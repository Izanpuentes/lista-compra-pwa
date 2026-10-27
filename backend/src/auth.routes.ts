import express from 'express';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { enviarEmail } from './email.service.js';
import { JWT_SECRET } from './config.js';

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
      JWT_SECRET, 
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
      JWT_SECRET, 
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

// --- RUTA 1: SOLICITAR CAMBIO DE CONTRASEÑA ---
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const usuario = await prisma.user.findUnique({ where: { email } });
    
    if (!usuario) {
      return res.status(404).json({ error: 'No existe ninguna cuenta con ese correo.' });
    }

    // Generamos un código de 6 dígitos y le damos 15 minutos de vida
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiracion = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { email },
      data: { resetCode: codigo, resetCodeExpiry: expiracion }
    });

    await enviarEmail({
      to: email,
      subject: 'Recuperar contraseña - Lista de la Compra',
      html: `<p>Hola ${usuario.name},</p><p>Tu código para cambiar la contraseña es: <strong style="font-size: 24px;">${codigo}</strong></p><p>Este código caduca en 15 minutos.</p>`
    });

    res.json({ mensaje: 'Código enviado. Revisa tu correo.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al solicitar el código.' });
  }
});

// --- RUTA 2: ESTABLECER LA NUEVA CONTRASEÑA ---
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const usuario = await prisma.user.findUnique({ where: { email } });

    if (!usuario || usuario.resetCode !== code || !usuario.resetCodeExpiry || usuario.resetCodeExpiry < new Date()) {
      return res.status(400).json({ error: 'Código incorrecto o caducado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Actualizamos la contraseña y borramos el código temporal
    await prisma.user.update({
      where: { email },
      data: { password: passwordHash, resetCode: null, resetCodeExpiry: null }
    });

    res.json({ mensaje: 'Contraseña actualizada con éxito. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});

export default router;