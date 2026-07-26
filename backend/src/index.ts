import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
// Creamos un servidor HTTP nativo pasando la app de Express
const httpServer = createServer(app); 
// Inicializamos Socket.io adjuntándolo al servidor HTTP
const io = new Server(httpServer, {
  cors: {
    origin: "*", // En desarrollo permitimos conexiones de cualquier IP (tu móvil, tu PC)
    methods: ["GET", "POST"]
  }
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- ENDPOINTS BÁSICOS (API REST) ---

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'El servidor está funcionando' });
});

// --- RUTAS PARA CASAS ---

// Crear una nueva casa
app.post('/api/houses', async (req, res) => {
  try {
    const { name } = req.body;
    const newHouse = await prisma.house.create({
      data: { name }
    });
    res.status(201).json(newHouse);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear la casa' });
  }
});

// --- RUTAS PARA USUARIOS ---

// Crear un usuario y unirlo (opcionalmente) a una casa
app.post('/api/users', async (req, res) => {
  try {
    const { email, name, houseId } = req.body;
    const newUser = await prisma.user.create({
      data: { 
        email, 
        name, 
        houseId 
      }
    });
    res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el usuario. ¿Quizás el email ya existe?' });
  }
});

// Obtener todos los artículos de una casa
app.get('/api/houses/:houseId/items', async (req, res) => {
  try {
    const { houseId } = req.params;
    const items = await prisma.item.findMany({
      where: { houseId },
      orderBy: { createdAt: 'desc' } // Los más nuevos primero
    });
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los artículos' });
  }
});

// 1. Apuntamos a la carpeta compilada de React
const frontendPath = path.join(__dirname, '../../frontend/dist');

// 2. Le decimos a Express que sirva esos archivos estáticos
app.use(express.static(frontendPath));

// 3. Redirigimos cualquier ruta no reconocida al index.html de React
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- LÓGICA DE WEBSOCKETS (TIEMPO REAL) ---

io.on('connection', (socket) => {
  console.log(`Un usuario se ha conectado: ${socket.id}`);

  // 1. El usuario entra en la app y se une a la "sala" de su casa
  socket.on('joinHouse', (houseId) => {
    socket.join(houseId);
    console.log(`Usuario ${socket.id} se unió a la casa ${houseId}`);
  });

  // 2. El usuario añade un artículo a la lista
  socket.on('addItem', async (data) => {
    try {
      const { name, houseId, addedById } = data;
      
      // Primero lo guardamos en la base de datos con Prisma
      const newItem = await prisma.item.create({
        data: { 
          name, 
          houseId, 
          addedById 
        },
        include: { addedBy: true } // Para saber el nombre de quién lo añadió
      });

      // Luego, disparamos un evento a todos los móviles conectados a esa casa
      // "io.to(houseId)" asegura que solo lo reciban los de esa casa
      io.to(houseId).emit('itemAdded', newItem);
      
    } catch (error) {
      console.error("Error al añadir item por WebSocket:", error);
    }
  });

  // El usuario elimina un artículo
  socket.on('deleteItem', async (data) => {
    try {
      const { itemId, houseId } = data;
      
      // CAMBIO CLAVE: Usamos deleteMany en lugar de delete
      await prisma.item.deleteMany({
        where: { id: itemId }
      });

      // Avisamos a las pantallas para que lo quiten visualmente
      io.to(houseId).emit('itemDeleted', itemId);
      
    } catch (error) {
      console.error("Error al borrar item por WebSocket:", error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`El usuario se ha desconectado: ${socket.id}`);
  });
});

// Arrancamos el servidor
httpServer.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});