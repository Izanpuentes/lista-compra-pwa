import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer'; // <-- NUEVA IMPORTACIÓN

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
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});

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

const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// --- LÓGICA DE WEBSOCKETS (TIEMPO REAL) ---

io.on('connection', (socket) => {
  console.log(`Un usuario se ha conectado: ${socket.id}`);

  socket.on('joinHouse', (houseId) => {
    socket.join(houseId);
    console.log(`Usuario ${socket.id} se unió a la casa ${houseId}`);
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
      const { name, houseId, addedById, supermercado, categoria } = data;
      
      const newItem = await prisma.item.create({
        data: { 
          name, 
          houseId, 
          addedById,
          supermercado,
          categoria
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

  // --- NUEVA LÓGICA DE SUGERENCIAS ---
  socket.on('sendSuggestion', async (data) => {
    try {
      const { text, houseId } = data;
      
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER, // Te lo envías a ti mismo
        subject: `💡 Nueva sugerencia para la lista de la compra`,
        text: `Has recibido una nueva sugerencia desde la casa:\n\n"${text}"`
      };

      await transporter.sendMail(mailOptions);
      
      // Avisamos al frontend de que se ha enviado correctamente para que cierre la ventana
      socket.emit('suggestionSent');
    } catch (error) {
      console.error("Error al enviar el correo:", error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`El usuario se ha desconectado: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});