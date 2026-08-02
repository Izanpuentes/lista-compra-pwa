import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resend } from 'resend';

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

// Obtener todos los artículos de una casa
app.get('/api/houses/:houseId/items', async (req, res) => {
  try {
    const { houseId } = req.params;
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

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- LÓGICA DE WEBSOCKETS (TIEMPO REAL) ---

// Memoria central para los menús semanales de las casas
const menusSemanales: Record<string, any> = {}; 

io.on('connection', (socket) => {
  console.log(`Un usuario se ha conectado: ${socket.id}`);

  socket.on('joinHouse', (houseId) => {
    socket.join(houseId);
    console.log(`Usuario ${socket.id} se unió a la casa ${houseId}`);
    
    // Si la casa ya tiene un menú guardado, se lo mandamos al que acaba de entrar
    if (menusSemanales[houseId]) {
      socket.emit('menuUpdated', menusSemanales[houseId]);
    }
  });

  // NUEVO: Escuchar cuando alguien cambia el menú y avisar al resto
  socket.on('updateMenu', (data) => {
    const { houseId, menu } = data;
    menusSemanales[houseId] = menu; // Guardamos en el servidor
    socket.to(houseId).emit('menuUpdated', menu); // Avisamos a los demás
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
socket.on('sendSuggestion', async (data) => {
  console.log("📩 ¡Sugerencia recibida en el servidor por RESEND!", data);
});

  socket.on('disconnect', () => {
    console.log(`El usuario se ha desconectado: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});