import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const router = express.Router();
const prisma = new PrismaClient();

// Función auxiliar para generar un código único de 6 caracteres
const generarCodigo = () => Math.random().toString(36).substring(2, 8).toUpperCase();

router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    const usuarioExistente = await prisma.user.findUnique({ where: { email } });
    if (usuarioExistente) {
      return res.status(400).json({ error: 'El email ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 1. Creamos al usuario suelto, sin asignarle ninguna casa todavía
    const nuevoUsuario = await prisma.user.create({
      data: {
        name: nombre,
        email,
        password: passwordHash,
      }
    });

    const token = jwt.sign(
      { userId: nuevoUsuario.id }, 
      process.env.JWT_SECRET || 'clave_secreta_de_desarrollo', 
      { expiresIn: '30d' }
    );

    res.status(201).json({ 
      mensaje: 'Usuario registrado con éxito',
      token,
      usuario: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.name,
        casas: [] // Empieza limpio, con un array vacío
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor al registrar.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscamos al usuario INCLUYENDO todas sus casas
    const usuario = await prisma.user.findUnique({ 
      where: { email },
      include: { houses: true }
    });
    
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const passwordValida = await bcrypt.compare(password, usuario.password);
    if (!passwordValida) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    const token = jwt.sign(
      { userId: usuario.id }, 
      process.env.JWT_SECRET || 'clave_secreta_de_desarrollo', 
      { expiresIn: '30d' }
    );

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.name,
        casas: usuario.houses // ¡Enviamos el array de casas al frontend!
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
  }
});

export default router;