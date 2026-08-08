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
    const { nombre, email, password, accion, codigoInvitacion, nombreVivienda } = req.body;

    const usuarioExistente = await prisma.user.findUnique({ where: { email } });
    if (usuarioExistente) {
      return res.status(400).json({ error: 'El email ya está registrado.' });
    }

    // 1. Validamos la invitación ANTES de crear el usuario para evitar errores
    let viviendaDestino = null;
    if (accion === 'unirse') {
      viviendaDestino = await prisma.house.findUnique({
        where: { inviteCode: codigoInvitacion },
      });
      
      if (!viviendaDestino) {
        return res.status(404).json({ error: 'El código de invitación no existe.' });
      }
    } else if (accion !== 'crear') {
      return res.status(400).json({ error: 'Debes especificar si quieres "crear" o "unirse".' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 2. Creamos al usuario suelto primero para que la base de datos genere su ID
    const nuevoUsuario = await prisma.user.create({
      data: {
        name: nombre,
        email,
        password: passwordHash,
      }
    });

    // 3. Ahora que tenemos su ID, gestionamos la casa y el adminId
    if (accion === 'crear') {
      await prisma.house.create({
        data: {
          name: nombreVivienda || `Casa de ${nombre}`,
          inviteCode: generarCodigo(),
          adminId: nuevoUsuario.id, // ¡Aquí le ponemos la corona de administrador!
          users: {
            connect: { id: nuevoUsuario.id } // Lo conectamos a la casa
          }
        }
      });
    } else if (accion === 'unirse' && viviendaDestino) {
      await prisma.house.update({
        where: { id: viviendaDestino.id },
        data: {
          users: {
            connect: { id: nuevoUsuario.id } // Lo conectamos a la casa existente
          }
        }
      });
    }

    // 4. Volvemos a buscar al usuario con sus casas ya asociadas
    const usuarioConCasas = await prisma.user.findUnique({
      where: { id: nuevoUsuario.id },
      include: { houses: true }
    });

    // Generamos el pase VIP para que el frontend pueda iniciar sesión directamente
    const token = jwt.sign(
      { userId: nuevoUsuario.id }, 
      process.env.JWT_SECRET || 'clave_secreta_de_desarrollo', 
      { expiresIn: '30d' }
    );

    res.status(201).json({ 
      mensaje: 'Usuario registrado con éxito',
      token, // ¡Enviamos el token!
      usuario: {
        id: usuarioConCasas?.id,
        nombre: usuarioConCasas?.name,
        casas: usuarioConCasas?.houses 
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