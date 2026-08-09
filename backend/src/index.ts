import express, { type Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import authRoutes from './auth.routes.js';
import { verificarToken, type AuthRequest } from './auth.middleware.js'; // o la ruta donde lo hayas guardado
import jwt from 'jsonwebtoken';

// Reemplazamos la configuración de nodemailer por la de Resend
const resend = new Resend(process.env.RESEND_API_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const httpServer = createServer(app); 
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE NODEMAILER ---


app.use(cors());
app.use(express.json());

// Obtener todos los artículos de una casa (Protegido por JWT y validación N:M)
app.get('/api/houses/:houseId/items', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const houseId = req.params.houseId as string;
    const userId = req.user?.userId;

    // --- NUEVO: Validamos que userId exista para que TypeScript esté tranquilo ---
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado de forma válida' });
    }

    // Seguridad extra: Comprobamos si el usuario pertenece a esta casa concreta
    const casaPermitida = await prisma.house.findFirst({
      where: {
        id: houseId,
        users: { some: { id: userId } } // Al pasar el 'if' de arriba, TypeScript ya sabe que es un string seguro
      }
    });

    if (!casaPermitida) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta vivienda' });
    }

    const items = await prisma.item.findMany({
      where: { houseId },
      orderBy: { createdAt: 'desc' } 
    });
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los artículos' });
  }
});



// Ruta para obtener todas las recetas con sus ingredientes
app.get('/api/recetas', async (req, res) => {
  try {
    const recetas = await prisma.receta.findMany({
      include: {
        ingredientes: true // Esto es magia pura de Prisma, te trae los ingredientes automáticamente
      }
    });
    res.json(recetas);
  } catch (error) {
    console.error("Error al obtener recetas:", error);
    res.status(500).json({ error: "Error al cargar el recetario" });
  }
});

// --- RUTA PARA FORZAR ACTUALIZACIÓN EN LOS MÓVILES ---
app.get('/api/trigger-update', (req, res) => {
  // io.emit envía el mensaje a TODOS los usuarios conectados sin excepción
  io.emit('appUpdated', { message: 'Nueva versión disponible' });
  res.send('✅ Notificación de actualización enviada a todos los dispositivos conectados de la familia.');
});

const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

app.use('/api/auth', authRoutes);

// 1. OBTENER LOS MIEMBROS DE UNA CASA
app.get('/api/houses/:houseId/users', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const houseId = req.params.houseId as string; // Fijamos el tipo explícitamente a string

    const house = await prisma.house.findUnique({
      where: { id: houseId },
      // Cambiamos 'nombre' por 'name' que es como está definido en tu base de datos
      include: { users: { select: { id: true, name: true, email: true } } } 
    });

    if (!house) return res.status(404).json({ error: 'Casa no encontrada' });
    
    res.json({ adminId: house.adminId, users: house.users });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// 2. ABANDONAR UNA CASA (Para usuarios normales)
app.post('/api/houses/:houseId/leave', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const houseId = req.params.houseId as string;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ error: 'Usuario no autenticado' });

    const house = await prisma.house.findUnique({ where: { id: houseId } });
    
    if (house?.adminId === userId) {
      return res.status(400).json({ error: 'El administrador no puede abandonar la casa, debe borrarla o transferirla.' });
    }

    await prisma.house.update({
      where: { id: houseId },
      data: { users: { disconnect: { id: userId } } }
    });

    res.json({ message: 'Has abandonado la casa correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al abandonar la casa' });
  }
});

// 3. EXPULSAR A UN USUARIO (Solo Administrador)
app.delete('/api/houses/:houseId/users/:targetUserId', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const houseId = req.params.houseId as string;
    const targetUserId = req.params.targetUserId as string;
    const adminId = req.user?.userId;

    const house = await prisma.house.findUnique({ where: { id: houseId } });

    if (house?.adminId !== adminId) {
      return res.status(403).json({ error: 'No tienes permisos para expulsar usuarios.' });
    }

    await prisma.house.update({
      where: { id: houseId },
      data: { users: { disconnect: { id: targetUserId } } }
    });

    res.json({ message: 'Usuario expulsado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al expulsar al usuario' });
  }
});

// 4. ELIMINAR LA CASA POR COMPLETO (Solo Administrador)
app.delete('/api/houses/:houseId', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const houseId = req.params.houseId as string;
    const adminId = req.user?.userId;

    const house = await prisma.house.findUnique({ where: { id: houseId } });

    if (house?.adminId !== adminId) {
      return res.status(403).json({ error: 'Solo el creador puede eliminar la casa.' });
    }

    // Prisma se encarga de borrar los items asociados
    await prisma.item.deleteMany({ where: { houseId } });
    await prisma.house.delete({ where: { id: houseId } });

    res.json({ message: 'Casa eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la casa' });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- LÓGICA DE WEBSOCKETS (TIEMPO REAL) ---
 

// --- MIDDLEWARE DE SEGURIDAD PARA WEBSOCKETS ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Autenticación requerida para tiempo real'));
  }

  try {
    // El payload ya solo tiene userId
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta_de_desarrollo') as { userId: string };
    
    (socket as any).user = payload;
    next();
  } catch (error) {
    return next(new Error('Token inválido o expirado'));
  }
});

io.on('connection', (socket) => {
  console.log(`Un usuario se ha conectado: ${socket.id}`);

  socket.on('joinHouse', async (houseId) => {
    socket.join(houseId);
    console.log(`Usuario ${socket.id} se unió a la casa ${houseId}`);
    
    try {
      // 1. Buscamos la casa en la base de datos
      const casa = await prisma.house.findUnique({
        where: { id: houseId },
        select: { menuSemanal: true } // Solo pedimos el menú para ir más rápido
      });

      // 2. Si la casa tiene un menú guardado, se lo enviamos al móvil
      if (casa && casa.menuSemanal) {
        socket.emit('menuUpdated', casa.menuSemanal);
      }
    } catch (error) {
      console.error("Error al cargar el menú desde la BD:", error);
    }
  });

  // NUEVO: Escuchar cuando alguien cambia el menú y avisar al resto
  // Escuchar cuando alguien cambia el menú y avisar al resto
  socket.on('updateMenu', async (data) => {
    const { houseId, menu } = data;
    
    try {
      // 1. Guardamos el menú en piedra en la base de datos
      await prisma.house.update({
        where: { id: houseId },
        data: { menuSemanal: menu } // Prisma detectará automáticamente que es un JSON
      });

      // 2. Avisamos a los demás móviles conectados a la casa
      socket.to(houseId).emit('menuUpdated', menu);
      
    } catch (error) {
      console.error("Error al guardar el menú en la BD:", error);
    }
  });

  socket.on('toggle-item', async (data) => {
    try {
      const updatedItem = await prisma.item.update({
        where: { id: data.itemId },
        data: { comprado: data.comprado }
      });
      io.to(data.houseId).emit('item-toggled', updatedItem);
    } catch (error) {
      console.error("Error al cambiar estado del item:", error);
    }
  });

  socket.on('addItem', async (data) => {
    try {
      // Extraemos también el supermercado de los datos que envía React
      const { name, houseId, addedById, supermercado, categoria, creador } = data;
      
      const newItem = await prisma.item.create({
        data: { 
          name, 
          houseId, 
          addedById,
          supermercado,
          categoria,
          creador
        },
        include: { addedBy: true } 
      });

      io.to(houseId).emit('itemAdded', newItem);
      
    } catch (error) {
      console.error("Error al añadir item por WebSocket:", error);
    }
  });

  socket.on('deleteItem', async (data) => {
    try {
      const { itemId, houseId } = data;
      await prisma.item.deleteMany({
        where: { id: itemId }
      });
      io.to(houseId).emit('itemDeleted', itemId);
    } catch (error) {
      console.error("Error al borrar item por WebSocket:", error);
    }
  });

  // Cuando el backend escucha el evento de sugerencia...
// Cuando el backend escucha el evento de sugerencia...
// Cuando el backend escucha el evento de sugerencia...
socket.on('sendSuggestion', async (data) => {
  console.log("📩 ¡Sugerencia recibida en el servidor por RESEND!", data);

  try {
    const dataResend = await resend.emails.send({
      from: 'Acme <onboarding@resend.dev>', 
      to: 'izanpuentes@gmail.com', 
      subject: `💡 Nueva sugerencia de ${data.creador}`,
      text: data.text
    });

    // Comprobamos si el compartimento 'error' trae algo
    if (dataResend.error) {
      console.error("❌ Resend ha devuelto un error:", dataResend.error);
      return;
    }

    // Si no hay error, leemos el ID de dentro de 'data'
    console.log("✅ Correo enviado con éxito por Resend. ID:", dataResend.data?.id);

  } catch (error) {
    // Esto captura fallos de conexión o caídas del servidor
    console.error("❌ ERROR CRÍTICO al conectar con Resend:", error);
  }
});

  socket.on('disconnect', () => {
    console.log(`El usuario se ha desconectado: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});