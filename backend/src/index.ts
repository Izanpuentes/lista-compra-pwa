import express, { type Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
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

// 5. CREAR UNA CASA NUEVA (Para un usuario ya registrado)
app.post('/api/houses', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { name } = req.body;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const generarCodigo = () => Math.random().toString(36).substring(2, 8).toUpperCase();

    const nuevaCasa = await prisma.house.create({
      data: {
        name: name || 'Nueva Casa',
        inviteCode: generarCodigo(),
        adminId: userId,
        users: { connect: { id: userId } }
      }
    });

    res.json(nuevaCasa);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear la casa' });
  }
});

// 6. UNIRSE A UNA CASA EXISTENTE (Para un usuario ya registrado)
app.post('/api/houses/join', verificarToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { inviteCode } = req.body;
    if (!userId) return res.status(401).json({ error: 'No autorizado' });

    const house = await prisma.house.findUnique({ where: { inviteCode } });
    if (!house) return res.status(404).json({ error: 'Código de invitación no válido' });

    const updatedHouse = await prisma.house.update({
      where: { id: house.id },
      data: { users: { connect: { id: userId } } }
    });

    res.json(updatedHouse);
  } catch (error) {
    res.status(500).json({ error: 'Error al unirse a la casa' });
  }
});

// --- RUTA TEMPORAL PARA RESTAURAR RECETAS ---
app.get('/api/restaurar-recetas', async (req, res) => {
  try {
    // 1. Limpiamos la base de datos
    await prisma.ingrediente.deleteMany();
    await prisma.receta.deleteMany();

    // 2. Definimos las recetas directamente aquí (puedes pegar tu JSON completo si quieres)
    const misRecetas = [
      {
    "nombre": "Lentejas Estofadas con Chorizo",
    "categoria": "Legumbres",
    "instrucciones": "Picar finamente cebolla, ajo y zanahoria. Sofreír en una olla con aceite. Añadir pimentón, tomate triturado y chorizo en rodajas. Incorporar las lentejas, cubrir con agua, echar laurel y cocer a fuego medio 45 min. Salar al gusto.",
    "ingredientes": ["Lentejas", "Cebolla", "Ajo", "Zanahoria", "Chorizo", "Pimentón dulce", "Tomate triturado", "Laurel", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Tortilla de Patatas",
    "categoria": "Huevos",
    "instrucciones": "Pelar y cortar patatas y cebolla finamente. Freír a fuego medio hasta que estén tiernas. Escurrir. Batir huevos con sal, mezclar con la patata y cuajar en sartén con unas gotas de aceite un par de minutos por lado.",
    "ingredientes": ["Patatas", "Huevos", "Cebolla", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Pollo al Horno con Limón",
    "categoria": "Carnes",
    "instrucciones": "Precalentar horno a 200°C. Poner base de patatas y cebolla en rodajas. Salpimentar muslos de pollo, embadurnar con aceite, ajo y zumo de limón. Hornear 45-50 min, volteando a la mitad.",
    "ingredientes": ["Muslos de pollo", "Patatas", "Cebolla", "Limón", "Ajo", "Vino blanco", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Macarrones con Atún",
    "categoria": "Pastas",
    "instrucciones": "Cocer macarrones. Sofreír cebolla picada. Añadir tomate frito y atún escurrido. Mezclar con la pasta y servir con queso rallado.",
    "ingredientes": ["Macarrones", "Tomate frito", "Atún en lata", "Cebolla", "Queso rallado", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Salmón a la Plancha",
    "categoria": "Pescados",
    "instrucciones": "Hacer espárragos a la plancha. Cocinar lomos de salmón (primero por la piel) 3 min por lado a fuego fuerte. Servir con limón.",
    "ingredientes": ["Lomos de salmón", "Espárragos trigueros", "Limón", "Aceite de oliva", "Sal gruesa"]
  },
  {
    "nombre": "Gazpacho Andaluz",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Triturar tomates, pimiento, pepino y ajo pelado con aceite, vinagre, sal y un poco de agua fría. Enfriar antes de servir.",
    "ingredientes": ["Tomates pera", "Pimiento verde", "Pepino", "Ajo", "Aceite de oliva", "Vinagre", "Sal"]
  },
  {
    "nombre": "Albóndigas en Salsa",
    "categoria": "Carnes",
    "instrucciones": "Mezclar carne con huevo, ajo en polvo y pan rallado. Formar albóndigas, enharinar y dorar. Sofreír cebolla y zanahoria, añadir vino y caldo. Cocer salsa, triturar, meter albóndigas y cocer 10 min.",
    "ingredientes": ["Carne picada mixta", "Huevo", "Pan rallado", "Harina", "Cebolla", "Zanahoria", "Vino blanco", "Caldo de pollo", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Arroz Caldoso con Sepia",
    "categoria": "Arroces",
    "instrucciones": "Sofrito de cebolla, ajo, pimiento y tomate. Añadir sepia en dados y cocinar 5 min. Rehogar arroz, verter caldo de pescado caliente (triple de arroz) y cocer 15 min. Añadir gambas, cocer 3 min y reposar.",
    "ingredientes": ["Arroz bomba", "Sepia", "Gambas peladas", "Caldo de pescado", "Cebolla", "Ajo", "Pimiento rojo", "Tomate", "Pimentón dulce", "Aceite de oliva"]
  },
  {
    "nombre": "Garbanzos con Espinacas",
    "categoria": "Legumbres",
    "instrucciones": "Dorar ajos y rebanada de pan, retirar y majar con comino. En ese aceite, rehogar espinacas cocidas, pimentón y añadir los garbanzos escurridos y el majado. Cocer 5 min todo junto.",
    "ingredientes": ["Garbanzos cocidos", "Espinacas frescas", "Ajo", "Pan", "Pimentón dulce", "Comino molido", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Pisto Manchego",
    "categoria": "Verduras",
    "instrucciones": "Picar en dados calabacín, pimiento rojo, verde y cebolla. Pochar a fuego lento por orden de dureza. Añadir tomate triturado y cocinar a fuego bajo 30 min.",
    "ingredientes": ["Calabacín", "Pimiento rojo", "Pimiento verde", "Cebolla", "Tomate triturado", "Aceite de oliva", "Sal", "Azúcar"]
  },
  {
    "nombre": "Croquetas de Jamón",
    "categoria": "Tapas",
    "instrucciones": "Rehogar cebolla muy fina, tostar la harina. Verter leche caliente poco a poco sin dejar de remover. Añadir jamón picado y nuez moscada. Enfriar masa, hacer formas, empanar y freír.",
    "ingredientes": ["Jamón serrano", "Cebolla", "Harina", "Leche entera", "Mantequilla", "Huevo", "Pan rallado", "Nuez moscada", "Aceite para freír"]
  },
  {
    "nombre": "Merluza en Salsa Verde",
    "categoria": "Pescados",
    "instrucciones": "Sofreír ajo picado sin dorar. Añadir harina y remover. Verter vino blanco y caldo de pescado. Añadir la merluza, perejil picado y guisantes. Cocinar 5 min por lado a fuego medio.",
    "ingredientes": ["Lomos de merluza", "Ajo", "Harina", "Vino blanco", "Caldo de pescado", "Guisantes", "Perejil fresco", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Salmorejo Cordobés",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Triturar tomates pelados, ajo y sal. Añadir pan de telera troceado y dejar empapar. Volver a triturar vertiendo el aceite a hilo para emulsionar. Servir con huevo duro y jamón.",
    "ingredientes": ["Tomates pera", "Pan de hogaza", "Ajo", "Aceite de oliva", "Sal", "Huevo duro", "Jamón serrano picado"]
  },
  {
    "nombre": "Pollo al Ajillo",
    "categoria": "Carnes",
    "instrucciones": "Freír abundantes dientes de ajo enteros con piel. Retirar. En ese aceite, dorar pollo troceado salpimentado. Añadir los ajos, vino blanco y un chorro de limón. Reducir la salsa.",
    "ingredientes": ["Pollo troceado", "Ajo", "Vino blanco", "Limón", "Perejil", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Ensalada Campera",
    "categoria": "Ensaladas",
    "instrucciones": "Cocer patatas y huevos. Cortar las patatas frías en trozos. Añadir pimiento, cebolla, tomate picado, atún y aceitunas. Aliñar con aceite, vinagre y sal.",
    "ingredientes": ["Patatas", "Huevo duro", "Pimiento rojo", "Cebolla", "Tomate", "Atún en lata", "Aceitunas verdes", "Aceite de oliva", "Vinagre", "Sal"]
  },
  {
    "nombre": "Arroz a la Cubana",
    "categoria": "Arroces",
    "instrucciones": "Cocer arroz blanco con un diente de ajo. Freír plátano en mitades. Freír huevos con puntilla. Servir el arroz con salsa de tomate frito caliente por encima, acompañado del huevo y plátano.",
    "ingredientes": ["Arroz", "Ajo", "Salsa de tomate frito", "Huevos", "Plátano", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Puré de Calabacín",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Rehogar cebolla y puerro. Añadir calabacín en trozos y patata chascada. Cubrir con caldo de verduras o agua y cocer 20 min. Añadir quesitos, triturar fino y salpimentar.",
    "ingredientes": ["Calabacín", "Patata", "Cebolla", "Puerro", "Quesitos", "Caldo de verduras", "Aceite de oliva", "Sal", "Pimienta blanca"]
  },
  {
    "nombre": "Filetes Rusos",
    "categoria": "Carnes",
    "instrucciones": "Mezclar carne picada con ajo, perejil, huevo y pan rallado. Hacer bolas y aplastarlas. Enharinar y freír en aceite caliente por ambos lados hasta dorar.",
    "ingredientes": ["Carne picada de ternera", "Ajo", "Perejil fresco", "Huevo", "Pan rallado", "Harina", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Lubina al Horno",
    "categoria": "Pescados",
    "instrucciones": "Hacer una cama de patata panadera y cebolla pochada en bandeja de horno. Colocar la lubina limpia encima con rodajas de limón. Hornear a 200°C unos 20 minutos rociando vino blanco.",
    "ingredientes": ["Lubina limpia", "Patatas", "Cebolla", "Limón", "Vino blanco", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Espaguetis a la Boloñesa",
    "categoria": "Pastas",
    "instrucciones": "Sofreír cebolla y zanahoria picadas. Añadir carne picada y dorar. Verter tomate triturado, orégano y cocinar 20 min. Cocer pasta, escurrir y mezclar con la salsa.",
    "ingredientes": ["Espaguetis", "Carne picada mixta", "Cebolla", "Zanahoria", "Tomate triturado", "Orégano", "Queso parmesano", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Fabada Asturiana (Exprés)",
    "categoria": "Legumbres",
    "instrucciones": "Poner fabes de bote lavadas en una cazuela. Añadir chorizo, morcilla y panceta (compango). Cubrir apenas con agua o caldo, dar un hervor a fuego lento de 15 minutos para integrar sabores.",
    "ingredientes": ["Alubias blancas (bote)", "Chorizo asturiano", "Morcilla asturiana", "Panceta", "Pimentón dulce", "Sal"]
  },
  {
    "nombre": "Sopa de Ajo (Sopa Castellana)",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Dorar ajos fileteados y taquitos de jamón. Retirar del fuego, añadir pimentón y rebanadas de pan duro. Volver al fuego, verter caldo y cocer 15 min. Cascar huevos en la sopa hasta que cuajen.",
    "ingredientes": ["Pan duro", "Ajo", "Jamón serrano en tacos", "Pimentón dulce", "Huevos", "Caldo de carne", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Sepia a la Plancha",
    "categoria": "Pescados",
    "instrucciones": "Limpiar bien la sepia. Macerar con ajo muy picado, perejil y un poco de aceite. Hacer a la plancha a fuego muy fuerte para que no cueza, vuelta y vuelta. Echar sal gorda al sacar.",
    "ingredientes": ["Sepia limpia", "Ajo", "Perejil fresco", "Aceite de oliva", "Sal gorda"]
  },
  {
    "nombre": "Guiso de Ternera con Patatas",
    "categoria": "Carnes",
    "instrucciones": "Dorar trozos de ternera para guisar. Sofreír cebolla, pimiento y zanahoria. Añadir vino tinto y reducir. Cubrir con caldo, cocer 1 hora a fuego lento. Añadir patatas chascadas y cocer 20 min más.",
    "ingredientes": ["Ternera para guisar", "Patatas", "Cebolla", "Pimiento verde", "Zanahoria", "Vino tinto", "Caldo de carne", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Ensaladilla Rusa",
    "categoria": "Ensaladas",
    "instrucciones": "Cocer patatas, zanahorias y huevos. Picar todo en dados pequeños. Mezclar en un bol con atún, aceitunas y guisantes. Envolver bien con mayonesa abundante y enfriar.",
    "ingredientes": ["Patatas", "Zanahorias", "Huevos", "Atún en lata", "Guisantes", "Aceitunas rellenas", "Mayonesa", "Sal"]
  },
  {
    "nombre": "Pollo a la Cerveza",
    "categoria": "Carnes",
    "instrucciones": "Salpimentar el pollo troceado y dorarlo en una cazuela con aceite. Retirar. En ese aceite, sofreír cebolla y ajo muy picados. Cuando doren, volver a meter el pollo, verter la lata de cerveza y dejar reducir a fuego medio unos 25 minutos hasta que la salsa espese.",
    "ingredientes": ["Pollo troceado", "Cebolla", "Ajo", "Cerveza rubia", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Solomillo al Whisky",
    "categoria": "Carnes",
    "instrucciones": "Marcar los medallones de solomillo de cerdo en una sartén con aceite y retirar. Sofreír un buen puñado de ajos enteros pelados. Añadir un vaso de whisky y flambear (con cuidado). Echar caldo de pollo, un chorrito de zumo de limón y reducir. Bañar la carne con esta salsa.",
    "ingredientes": ["Solomillo de cerdo", "Ajo", "Whisky", "Caldo de pollo", "Limón", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Berenjenas Rellenas de Carne",
    "categoria": "Verduras",
    "instrucciones": "Cortar las berenjenas por la mitad, hacer cortes en la carne y asar 20 min. Vaciar la pulpa. Sofreír cebolla, añadir carne picada, tomate frito y la pulpa picada. Rellenar las berenjenas, cubrir con queso y gratinar.",
    "ingredientes": ["Berenjenas", "Carne picada mixta", "Cebolla", "Tomate frito", "Queso rallado para gratinar", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Bacalao con Tomate",
    "categoria": "Pescados",
    "instrucciones": "Enharinar ligeramente los lomos de bacalao desalado y freír un poco para sellarlos. Retirar. En el mismo aceite, pochar mucha cebolla picada, añadir tomate triturado y cocinar 20 min. Introducir el bacalao en la salsa y cocinar 5 min más.",
    "ingredientes": ["Lomos de bacalao desalado", "Tomate triturado", "Cebolla", "Harina", "Aceite de oliva", "Sal", "Azúcar"]
  },
  {
    "nombre": "Huevos Rotos con Jamón",
    "categoria": "Huevos",
    "instrucciones": "Pelar y cortar las patatas en bastones. Freír en abundante aceite de oliva hasta que estén doradas. Escurrir y salar. Freír los huevos dejando la yema líquida. Colocar los huevos sobre las patatas, poner lonchas de jamón ibérico por encima y romper los huevos antes de comer.",
    "ingredientes": ["Patatas", "Huevos", "Jamón serrano", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Paella Mixta (Fácil)",
    "categoria": "Arroces",
    "instrucciones": "Sofreír en la paellera pollo, cerdo, calamares y gambas. Retirar. Hacer un sofrito con cebolla, ajo, pimiento y tomate. Añadir el arroz, pimentón y azafrán. Verter caldo de carne y pescado (doble que de arroz). Colocar la carne y marisco, y cocer 18 minutos.",
    "ingredientes": ["Arroz bomba", "Pollo troceado", "Costilla de cerdo", "Anillas de calamar", "Gambas", "Caldo mixto", "Tomate", "Pimiento rojo", "Azafrán", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Judías Verdes con Jamón",
    "categoria": "Verduras",
    "instrucciones": "Lavar, despuntar y cocer las judías verdes y la patata en trozos con agua y sal durante 15 minutos. Escurrir. En una sartén, dorar ajo laminado, añadir taquitos de jamón y saltear las judías y patatas un par de minutos.",
    "ingredientes": ["Judías verdes redondas", "Patatas", "Ajo", "Jamón serrano en tacos", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Marmitako de Bonito",
    "categoria": "Pescados",
    "instrucciones": "Hacer un sofrito de cebolla, pimiento verde y ajo. Añadir patatas chascadas, pimentón y carne de pimiento choricero. Cubrir con caldo de pescado y cocer 20 min. Apagar el fuego, añadir el bonito en dados sazonado, tapar y dejar que se haga con el calor residual 5 min.",
    "ingredientes": ["Bonito o atún fresco", "Patatas", "Cebolla", "Pimiento verde", "Ajo", "Caldo de pescado", "Pimentón dulce", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Espaguetis Carbonara (Original)",
    "categoria": "Pastas",
    "instrucciones": "Cocer la pasta. Dorar guanciale o panceta en tiras (sin aceite, en su grasa). Batir yemas de huevo con abundante queso pecorino o parmesano y pimienta. Escurrir la pasta, mezclar con la panceta caliente y fuera del fuego añadir la crema de yema. Mezclar con un poco de agua de cocción hasta quedar cremoso.",
    "ingredientes": ["Espaguetis", "Panceta o guanciale", "Yemas de huevo", "Queso parmesano rallado", "Pimienta negra", "Sal"]
  },
  {
    "nombre": "Alubias con Almejas",
    "categoria": "Legumbres",
    "instrucciones": "Sofreír ajo y perejil picado. Añadir un poco de harina y vino blanco. Cuando evapore, echar las almejas limpias y tapar hasta que abran. Incorporar alubias blancas cocidas de bote (enjuagadas) y un chorrito de caldo. Dar un hervor de 5 minutos.",
    "ingredientes": ["Alubias blancas (bote)", "Almejas", "Ajo", "Perejil fresco", "Vino blanco", "Harina", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Macarrones con Chorizo",
    "categoria": "Pastas",
    "instrucciones": "Cocer los macarrones. En una sartén, sofreír cebolla picada. Añadir chorizo en rodajas finas y dorar. Verter el tomate frito y orégano, cocinar 5 minutos. Mezclar la salsa con la pasta escurrida.",
    "ingredientes": ["Macarrones", "Chorizo", "Cebolla", "Tomate frito", "Orégano", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Lomo de Cerdo con Tomate",
    "categoria": "Carnes",
    "instrucciones": "Sellar filetes de lomo de cerdo en una sartén vuelta y vuelta. En la misma sartén, freír ajo y cebolla. Añadir puré de tomate o tomate triturado, pizca de azúcar y sal. Cocinar 15 min, meter los filetes y dejar 5 min más a fuego bajo.",
    "ingredientes": ["Filetes de lomo de cerdo", "Tomate triturado", "Cebolla", "Ajo", "Aceite de oliva", "Sal", "Azúcar"]
  },
  {
    "nombre": "Dorada a la Sal",
    "categoria": "Pescados",
    "instrucciones": "En una bandeja de horno, poner una cama de sal gruesa para hornear. Colocar las doradas enteras (sin tripas pero con escamas) y cubrirlas totalmente con más sal, humedeciéndola un poco con agua. Hornear a 200°C unos 25 min. Romper la costra de sal, limpiar el pescado y servir.",
    "ingredientes": ["Doradas enteras", "Sal gruesa para hornear", "Agua"]
  },
  {
    "nombre": "Crema de Calabaza",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Rehogar puerro y cebolla. Añadir calabaza pelada en trozos, una patata y zanahoria. Cubrir con caldo de verduras. Cocer 25 minutos. Triturar con un chorrito de nata o leche evaporada y salpimentar.",
    "ingredientes": ["Calabaza", "Puerro", "Cebolla", "Zanahoria", "Patata", "Caldo de verduras", "Nata líquida", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Ensalada de Pasta",
    "categoria": "Ensaladas",
    "instrucciones": "Cocer pasta corta (espirales o lazos). Enfriar bajo el grifo. Mezclar en un bol grande con tomate cherry cortado, atún escurrido, maíz dulce, dados de queso fresco y aceitunas negras. Aliñar con aceite, vinagre de módena, orégano y sal.",
    "ingredientes": ["Pasta tricolor", "Tomates cherry", "Atún en lata", "Maíz dulce", "Queso fresco", "Aceitunas negras", "Aceite de oliva", "Vinagre balsámico", "Orégano", "Sal"]
  },
  {
    "nombre": "Patatas Bravas",
    "categoria": "Tapas",
    "instrucciones": "Cortar patatas en dados. Freír a fuego medio para confitar y luego a fuego fuerte para dorar. Para la salsa brava: sofreír ajo y cebolla, añadir pimentón dulce y picante, una cucharada de harina, caldo de pollo y triturar. Salsear las patatas.",
    "ingredientes": ["Patatas", "Ajo", "Cebolla", "Pimentón dulce", "Pimentón picante", "Harina", "Caldo de pollo", "Aceite para freír", "Sal"]
  },
  {
    "nombre": "Gambas al Ajillo",
    "categoria": "Tapas",
    "instrucciones": "En una cazuela de barro, poner abundante aceite, ajos laminados y guindilla seca. Calentar a fuego suave. Cuando el ajo empiece a dorar, subir el fuego, añadir las gambas peladas y sal. Cocinar 1-2 minutos y servir burbujeando.",
    "ingredientes": ["Gambas peladas", "Ajo", "Guindilla cayena", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Revuelto de Ajetes y Gambas",
    "categoria": "Huevos",
    "instrucciones": "Lavar y trocear ajetes tiernos (ajos tiernos). Saltear en una sartén con aceite hasta que estén blandos. Añadir gambas peladas y saltear 1 minuto. Batir los huevos, echarlos a la sartén y cuajar a fuego suave removiendo constantemente.",
    "ingredientes": ["Ajos tiernos", "Gambas peladas", "Huevos", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Vichyssoise (Crema de Puerro Fría)",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Sofreír solo la parte blanca del puerro y cebolla en mantequilla y aceite (sin que cojan color). Añadir patata cascada y cubrir con caldo de pollo. Cocer 25 min. Triturar finamente, añadir nata líquida, rectificar de sal y dejar enfriar en la nevera.",
    "ingredientes": ["Puerros", "Cebolla", "Patatas", "Mantequilla", "Caldo de pollo", "Nata líquida", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Carrilladas al Vino Tinto",
    "categoria": "Carnes",
    "instrucciones": "Salpimentar y enharinar las carrilladas. Sellarlas a fuego fuerte y retirar. Sofreír ajo, cebolla, zanahoria y pimiento picados. Añadir una botella de vino tinto y reducir 10 min. Volver a meter la carne, cubrir con caldo y guisar a fuego muy lento (o en olla exprés) hasta que se deshagan. Triturar la salsa.",
    "ingredientes": ["Carrilladas de cerdo", "Cebolla", "Zanahoria", "Pimiento verde", "Ajo", "Vino tinto", "Caldo de carne", "Harina", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Arroz Negro",
    "categoria": "Arroces",
    "instrucciones": "Sofreír cebolla, ajo y pimiento verde. Añadir anillas de calamar y dorar. Echar tomate triturado y reducir. Incorporar la tinta de calamar diluida y el arroz. Rehogar. Cubrir con caldo de pescado muy caliente. Cocer 15-18 min. Servir con alioli.",
    "ingredientes": ["Arroz bomba", "Calamares o sepia", "Cebolla", "Ajo", "Pimiento verde", "Tomate triturado", "Tinta de calamar", "Caldo de pescado", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Huevos Rellenos de Atún",
    "categoria": "Huevos",
    "instrucciones": "Cocer huevos durante 10 min. Enfriar, pelar y cortar por la mitad. Sacar las yemas (guardar algunas para decorar). Mezclar las yemas con atún escurrido y mayonesa. Rellenar las claras con la mezcla, cubrir con un punto de mayonesa y espolvorear yema rallada por encima.",
    "ingredientes": ["Huevos", "Atún en lata", "Mayonesa", "Sal"]
  },
  {
    "nombre": "Costillas a la Barbacoa al Horno",
    "categoria": "Carnes",
    "instrucciones": "Salpimentar el costillar. Envolverlo completamente en papel de aluminio (papillote). Hornear a 150°C durante 2 horas para que quede muy tierno. Sacar, quitar el papel, pincelar generosamente con salsa barbacoa y hornear a 220°C unos 10 min hasta que caramelice.",
    "ingredientes": ["Costillar de cerdo", "Salsa Barbacoa", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Trucha con Jamón a la Navarra",
    "categoria": "Pescados",
    "instrucciones": "Limpiar las truchas y abrirlas como un libro. Salpimentar ligeramente (el jamón ya sala). Poner una o dos lonchas de jamón serrano dentro de cada trucha y cerrarlas. Enharinar por fuera y freír en aceite caliente unos 3 min por cada lado.",
    "ingredientes": ["Truchas", "Jamón serrano", "Harina", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Champiñones al Ajillo",
    "categoria": "Verduras",
    "instrucciones": "Limpiar los champiñones y cortarlos en láminas o cuartos. En una sartén, dorar ajos picados con una guindilla. Añadir los champiñones y fuego fuerte para que no suelten mucha agua. Cuando doren, añadir chorrito de vino blanco y perejil picado. Evaporar y servir.",
    "ingredientes": ["Champiñones frescos", "Ajo", "Perejil fresco", "Guindilla cayena", "Vino blanco", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Empedrat (Ensalada de Alubias)",
    "categoria": "Ensaladas",
    "instrucciones": "Enjuagar alubias blancas cocidas. Mezclar en un bol con pimiento rojo, pimiento verde, cebolla tierna y tomate, todo cortado en daditos muy pequeños. Añadir bacalao desmigado (desalado) o atún, y aceitunas negras. Aliñar con buen aceite de oliva y vinagre.",
    "ingredientes": ["Alubias blancas (bote)", "Bacalao desmigado o atún", "Pimiento rojo", "Pimiento verde", "Cebolla tierna", "Tomate", "Aceitunas negras", "Aceite de oliva", "Vinagre", "Sal"]
  },
  {
    "nombre": "Lasaña de Carne Clásica",
    "categoria": "Pastas",
    "instrucciones": "Hacer un sofrito de cebolla, zanahoria y apio. Añadir carne picada, tomate y cocinar a fuego lento 40 min (boloñesa). Preparar bechamel (mantequilla, harina, leche). Montar capas en fuente de horno: pasta, carne, bechamel. Repetir. Terminar con bechamel, queso rallado y hornear 20 min a 200°C.",
    "ingredientes": ["Placas de lasaña", "Carne picada mixta", "Cebolla", "Zanahoria", "Tomate triturado", "Leche entera", "Harina", "Mantequilla", "Queso para gratinar", "Sal", "Nuez moscada"]
  },
  {
    "nombre": "Filetes Empanados con Patatas",
    "categoria": "Carnes",
    "instrucciones": "Salpimentar finos filetes de ternera o pollo. Pasarlos por harina (opcional), luego por huevo batido y finalmente por pan rallado presionando bien. Freír en abundante aceite caliente hasta dorar. Servir con patatas fritas de guarnición.",
    "ingredientes": ["Filetes de ternera o pollo", "Huevo", "Pan rallado", "Aceite para freír", "Sal", "Patatas"]
  },
  {
    "nombre": "Atún Encebollado",
    "categoria": "Pescados",
    "instrucciones": "Cortar el atún en dados gruesos, salar y marcar rápido en una sartén. Retirar. Cortar mucha cebolla en juliana y pochar en ese aceite a fuego muy lento 30 min. Añadir pimentón, orégano, laurel, un chorro de vinagre y vino blanco. Evaporar, meter el atún 2 min y apagar.",
    "ingredientes": ["Atún fresco", "Cebolla", "Ajo", "Laurel", "Pimentón dulce", "Orégano", "Vinagre", "Vino blanco", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Lentejas Viudas (Sin carne)",
    "categoria": "Legumbres",
    "instrucciones": "Picar cebolla, ajo, pimiento y zanahoria. Sofreír en la olla. Añadir pimentón, tomate y remover. Echar las lentejas, patata cascada y una hoja de laurel. Cubrir con agua y cocer a fuego suave 40-45 minutos. Perfectas y saludables.",
    "ingredientes": ["Lentejas", "Cebolla", "Ajo", "Pimiento verde", "Zanahoria", "Patata", "Tomate frito", "Pimentón dulce", "Laurel", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Pimientos de Padrón",
    "categoria": "Tapas",
    "instrucciones": "Lavar y secar muy bien los pimientos de Padrón. Poner una sartén con un dedo de aceite de oliva. Cuando esté caliente (pero sin humear), freír los pimientos hasta que se arruguen y doren por todos lados. Escurrir y echar abundante sal gorda por encima.",
    "ingredientes": ["Pimientos de Padrón", "Aceite para freír", "Sal gorda"]
  },
  {
    "nombre": "Fideos a la Cazuela (Fideuá de carne)",
    "categoria": "Pastas",
    "instrucciones": "Dorar costilla de cerdo troceada y salchichas frescas cortadas. Retirar. Hacer un sofrito de cebolla, ajo y tomate. Añadir fideos gruesos (nº4) y tostar 1 minuto. Añadir la carne, cubrir con caldo de carne caliente y cocer unos 12 min hasta que absorban el caldo.",
    "ingredientes": ["Fideos gruesos", "Costilla de cerdo", "Salchichas frescas", "Cebolla", "Ajo", "Tomate rallado", "Caldo de carne", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Tortilla de Calabacín",
    "categoria": "Huevos",
    "instrucciones": "Cortar media cebolla y un calabacín en dados pequeños (con o sin piel). Pochar en la sartén a fuego medio hasta que suelten toda el agua y estén muy tiernos. Escurrir bien. Batir huevos, añadir la verdura pochada y sal. Cuajar en la sartén por ambos lados.",
    "ingredientes": ["Calabacín", "Cebolla", "Huevos", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Rape en Salsa Verde",
    "categoria": "Pescados",
    "instrucciones": "Sofreír ajos muy picados sin que tomen color. Añadir una cucharada de harina y cocinar 1 min. Verter medio vaso de vino blanco, un vaso de caldo de pescado y mucho perejil fresco picado. Introducir las rodajas de rape sazonadas y cocinar 5 min por lado. Añadir almejas al final si se desea.",
    "ingredientes": ["Rodajas de rape", "Ajo", "Perejil fresco", "Harina", "Vino blanco", "Caldo de pescado", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Pechugas al Limón",
    "categoria": "Carnes",
    "instrucciones": "Salpimentar pechugas de pollo fileteadas, pasarlas por harina y dorarlas en una sartén con un poco de aceite y mantequilla. Retirar. En la sartén añadir el zumo de dos limones, medio vaso de caldo y reducir 5 min. Volver a poner el pollo para que se impregne bien 2 minutos.",
    "ingredientes": ["Filetes de pechuga de pollo", "Limón", "Mantequilla", "Harina", "Caldo de pollo", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Escalivada Catalana",
    "categoria": "Verduras",
    "instrucciones": "Lavar berenjenas, pimientos rojos y cebollas (todo entero). Frotar con un poco de aceite. Hornear a 200°C durante unos 45-60 min, dándoles la vuelta a la mitad. Sacar, tapar con papel albal para que suden. Pelar, cortar en tiras, poner en una fuente y aliñar con abundante aceite de oliva, ajo picado y sal.",
    "ingredientes": ["Pimiento rojo", "Berenjena", "Cebolla", "Ajo", "Aceite de oliva virgen extra", "Sal"]
  },
  {
    "nombre": "Pipirrana Andaluza",
    "categoria": "Ensaladas",
    "instrucciones": "Picar tomate, pimiento verde, pepino y cebolla en dados minúsculos. En un mortero, majar un ajo con sal, añadir aceite de oliva y vinagre para hacer una emulsión. Mezclar todo, añadir atún desmigado y huevo duro picado. Fundamental dejar reposar muy fría en la nevera.",
    "ingredientes": ["Tomates", "Pimiento verde", "Pepino", "Cebolla", "Ajo", "Atún en lata", "Huevo duro", "Aceite de oliva", "Vinagre", "Sal"]
  },
  {
    "nombre": "Ajoblanco (Sopa fría de almendras)",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Poner miga de pan a remojo en agua fría. Triturar almendras crudas peladas junto con la miga escurrida, ajo pelado (sin el germen), aceite de oliva, vinagre y sal. Añadir agua fría hasta conseguir textura de crema líquida. Servir muy frío acompañado de uvas moscatel o melón.",
    "ingredientes": ["Almendras crudas peladas", "Miga de pan", "Ajo", "Aceite de oliva", "Vinagre", "Agua", "Sal", "Uvas (para acompañar)"]
  },
  {
    "nombre": "Magro con Tomate",
    "categoria": "Carnes",
    "instrucciones": "Cortar carne de cerdo (magro) en dados. Salpimentar y dorar a fuego fuerte. Retirar. Sofreír cebolla y pimiento picados. Echar un chorro de vino blanco y reducir. Añadir tomate triturado, la carne, pizca de azúcar y dejar guisar a fuego lento 40 min hasta que la carne esté muy tierna.",
    "ingredientes": ["Magro de cerdo en dados", "Cebolla", "Pimiento verde", "Vino blanco", "Tomate triturado", "Aceite de oliva", "Sal", "Azúcar"]
  },
  {
    "nombre": "Calamares a la Andaluza",
    "categoria": "Pescados",
    "instrucciones": "Limpiar los calamares y cortarlos en anillas gruesas. Secar muy bien con papel de cocina. Salar. Pasar por harina especial para fritura (o harina de garbanzo) sacudiendo bien el exceso. Freír en abundante aceite muy caliente (190°C) durante 1-2 minutos. Escurrir sobre papel.",
    "ingredientes": ["Calamares", "Harina especial fritura", "Aceite de girasol u oliva suave", "Sal", "Limón"]
  },
  {
    "nombre": "Potaje de Garbanzos con Espinacas",
    "categoria": "Legumbres",
    "instrucciones": "Sofreír cebolla y ajo picados. Añadir pimentón y tomate triturado. Echar garbanzos cocidos (enjuagados) y cubrir con caldo o agua. Dar un hervor de 10 min. Añadir hojas de espinaca fresca y cocer 3 minutos más. Servir con huevo duro picado por encima.",
    "ingredientes": ["Garbanzos cocidos", "Espinacas frescas", "Cebolla", "Ajo", "Tomate triturado", "Pimentón dulce", "Caldo de verduras", "Huevo duro", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Salmón a la Naranja",
    "categoria": "Pescados",
    "instrucciones": "Marcar los lomos de salmón salpimentados en la plancha 2 min por lado y retirar. En la sartén, echar el zumo de dos naranjas, una pizca de miel y reducir hasta que espese un poco. Bañar el salmón con esta reducción. Fácil y resultón.",
    "ingredientes": ["Lomos de salmón", "Naranjas", "Miel", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Pinchos Morunos",
    "categoria": "Tapas",
    "instrucciones": "Cortar carne de cerdo o pollo en dados. Macerar 24h en la nevera con: aceite, ajo picado, pimentón dulce, comino, orégano, cúrcuma, sal y un chorrito de limón. Ensartar la carne en palillos de brocheta y hacer a la plancha a fuego fuerte.",
    "ingredientes": ["Carne de cerdo (aguja) o pollo", "Ajo", "Pimentón dulce", "Comino", "Orégano", "Cúrcuma", "Limón", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Alcachofas Salteadas con Jamón",
    "categoria": "Verduras",
    "instrucciones": "Limpiar las alcachofas quitando las hojas duras hasta dejar los corazones. Cortar en láminas finas. Saltearlas a fuego medio en una sartén con aceite unos 10-15 min hasta que estén tiernas y doradas. Añadir ajo muy picado y taquitos de jamón, dar un par de vueltas y servir.",
    "ingredientes": ["Alcachofas frescas", "Jamón serrano en tacos", "Ajo", "Aceite de oliva", "Sal", "Limón (para limpiar)"]
  },
  {
    "nombre": "Sopa de Fideos con Pollo",
    "categoria": "Sopas y Cremas",
    "instrucciones": "Hacer un caldo cociendo carcasas de pollo, puerro, zanahoria y apio durante 1 hora. Colar el caldo. Poner a hervir el caldo limpio, añadir fideos finos (cabello de ángel), zanahoria en daditos y carne de pollo desmenuzada. Cocer 5 min.",
    "ingredientes": ["Carcasas de pollo", "Puerro", "Zanahoria", "Apio", "Fideos finos", "Pechuga de pollo", "Sal"]
  },
  {
    "nombre": "Tomates Aliñados (Ensalada Murciana simplificada)",
    "categoria": "Ensaladas",
    "instrucciones": "Cortar tomates maduros y sabrosos (tipo rosa o raf) en rodajas o gajos. Picar cebolla tierna en juliana fina. Disponer en una fuente plana. Añadir atún desmigado y olivas negras o de cuquillo. Aliñar generosamente con aceite de oliva virgen extra y sal en escamas.",
    "ingredientes": ["Tomates de ensalada", "Cebolla tierna", "Atún en lata", "Aceitunas", "Aceite de oliva virgen extra", "Sal en escamas"]
  },
  {
    "nombre": "Boquerones en Vinagre",
    "categoria": "Tapas",
    "instrucciones": "Limpiar los boquerones (sin cabeza ni espina), lavar en agua muy fría. Congelar 48h (por el anisakis). Descongelar y macerar en vinagre, agua y sal unas 4 horas hasta que queden blancos. Escurrir bien, colocar en un tupper y bañar en aceite de oliva, mucho ajo picado y perejil fresco.",
    "ingredientes": ["Boquerones frescos", "Vinagre de vino blanco", "Agua", "Sal", "Ajo", "Perejil fresco", "Aceite de oliva virgen extra"]
  },
  {
    "nombre": "Bacalao Dorado (Bacalhau à Brás)",
    "categoria": "Huevos",
    "instrucciones": "Picar cebolla muy fina y pochar lentamente. Añadir bacalao desmigado desalado y rehogar. Añadir patatas paja (finísimas) fritas previamente. Retirar del fuego y añadir huevos batidos, removiendo constantemente para que quede cremoso y no una tortilla. Decorar con aceitunas negras y perejil.",
    "ingredientes": ["Bacalao desmigado desalado", "Cebolla", "Patatas (para hacer patatas paja)", "Huevos", "Aceitunas negras", "Perejil fresco", "Aceite de oliva", "Sal"]
  },
  {
    "nombre": "Pimientos del Piquillo Rellenos de Atún",
    "categoria": "Tapas",
    "instrucciones": "Escurrir bien los pimientos del piquillo. Mezclar atún, huevo duro picado y mayonesa. Rellenar los pimientos con cuidado usando una cucharilla. Se pueden comer así en frío, o pasarlos por la sartén con un poco de aceite y ajo si se prefieren calientes.",
    "ingredientes": ["Pimientos del piquillo enteros", "Atún en lata", "Huevo duro", "Mayonesa"]
  },
  {
    "nombre": "Conejo al Ajillo",
    "categoria": "Carnes",
    "instrucciones": "Trocear el conejo y salpimentar. En una cazuela amplia con buen aceite, dorar un par de cabezas de ajo sueltas (sin pelar). Retirar los ajos. Dorar muy bien los trozos de conejo a fuego medio-fuerte. Cuando esté dorado, volver a echar los ajos, añadir un vaso de vino blanco y vinagre, y reducir a fuego lento 20 min.",
    "ingredientes": ["Conejo troceado", "Ajo", "Vino blanco", "Vinagre", "Aceite de oliva", "Sal", "Pimienta negra"]
  },
  {
    "nombre": "Arroz con Leche",
    "categoria": "Postres",
    "instrucciones": "Hervir leche con piel de limón, naranja y una rama de canela. Añadir el arroz y cocer a fuego muy lento durante 45 minutos removiendo constantemente. Cuando esté cremoso, añadir el azúcar, cocer 5 minutos más, retirar y dejar enfriar. Espolvorear con canela en polvo.",
    "ingredientes": ["Leche entera", "Arroz bomba", "Azúcar", "Limón", "Naranja", "Canela en rama", "Canela en polvo"]
  },
  {
    "nombre": "Flan de Huevo Casero",
    "categoria": "Postres",
    "instrucciones": "Hacer un caramelo con azúcar y agua y cubrir el fondo de las flaneras. Batir los huevos con azúcar y mezclar poco a poco con leche tibia. Verter en las flaneras y hornear al baño maría a 180°C durante 45 minutos. Dejar enfriar antes de desmoldar.",
    "ingredientes": ["Huevos", "Leche entera", "Azúcar", "Agua"]
  },
  {
    "nombre": "Tarta de la Abuela (Galletas y Chocolate)",
    "categoria": "Postres",
    "instrucciones": "Preparar natillas o flan de sobre. Fundir chocolate para postres con un poco de nata y mantequilla. Mojar ligeramente galletas María en leche. En un molde, alternar capas de galletas mojadas, natillas y chocolate. Terminar con chocolate y enfriar en la nevera 4 horas.",
    "ingredientes": ["Galletas María", "Preparado para flan o natillas", "Chocolate para fundir", "Leche entera", "Nata líquida", "Mantequilla"]
  },
  {
    "nombre": "Torrijas de Leche",
    "categoria": "Postres",
    "instrucciones": "Hervir leche con canela y cáscara de limón. Dejar templar. Cortar pan del día anterior en rebanadas gruesas. Empapar bien el pan en la leche, pasar por huevo batido y freír en abundante aceite caliente. Escurrir y rebozar en una mezcla de azúcar y canela.",
    "ingredientes": ["Pan especial torrijas o pan duro", "Leche", "Huevos", "Azúcar", "Canela en rama", "Canela en polvo", "Limón", "Aceite para freír"]
  },
  {
    "nombre": "Crema Catalana",
    "categoria": "Postres",
    "instrucciones": "Infusionar leche con canela y piel de limón. En un bol, batir yemas con azúcar y maicena. Verter la leche colada sobre las yemas sin dejar de remover. Volver al fuego lento hasta que espese (sin que hierva). Repartir en cazuelas de barro, enfriar y, antes de servir, espolvorear azúcar y quemar con un soplete.",
    "ingredientes": ["Leche entera", "Yemas de huevo", "Azúcar", "Maicena", "Canela en rama", "Limón"]
  },
  {
    "nombre": "Bizcocho de Yogur (Medida de vaso)",
    "categoria": "Postres",
    "instrucciones": "Usar el envase del yogur como medida. Batir 3 huevos con 2 medidas de azúcar. Añadir 1 yogur de limón, 1 medida de aceite y batir. Incorporar 3 medidas de harina y 1 sobre de levadura tamizadas. Mezclar bien y hornear a 180°C durante 35-40 minutos.",
    "ingredientes": ["Yogur de limón", "Huevos", "Harina de trigo", "Azúcar", "Aceite de girasol", "Levadura química (Royal)", "Mantequilla (para el molde)"]
  },
  {
    "nombre": "Natillas Caseras",
    "categoria": "Postres",
    "instrucciones": "Infusionar leche con limón y canela. Batir yemas de huevo con azúcar y un poco de maicena disuelta en leche fría. Mezclar todo y llevar a fuego suave removiendo sin parar hasta que espese ligeramente. Servir en cuencos con una galleta María encima y canela espolvoreada.",
    "ingredientes": ["Leche", "Yemas de huevo", "Azúcar", "Maicena", "Limón", "Canela en rama", "Canela en polvo", "Galletas María"]
  },
  {
    "nombre": "Tarta de Santiago",
    "categoria": "Postres",
    "instrucciones": "Batir huevos con azúcar hasta que espumen. Añadir ralladura de limón, una pizca de canela y la almendra molida mezclando suavemente con una espátula. Verter en un molde engrasado y hornear a 175°C unos 30 min. Enfriar y decorar con azúcar glas usando la cruz de Santiago como plantilla.",
    "ingredientes": ["Almendra molida cruda", "Azúcar", "Huevos", "Limón", "Canela en polvo", "Azúcar glas"]
  },
  {
    "nombre": "Leche Frita",
    "categoria": "Postres",
    "instrucciones": "Cocer leche con azúcar, canela y piel de limón. Disolver maicena en leche fría y añadir a la leche caliente, removiendo hasta que espese mucho. Verter en una fuente y dejar enfriar en la nevera hasta que solidifique. Cortar en cuadrados, pasar por harina y huevo, freír y rebozar en azúcar y canela.",
    "ingredientes": ["Leche entera", "Maicena", "Azúcar", "Huevos", "Harina", "Canela en rama", "Canela en polvo", "Limón", "Aceite para freír"]
  },
  {
    "nombre": "Manzanas Asadas",
    "categoria": "Postres",
    "instrucciones": "Lavar y descorazonar las manzanas (preferiblemente Reineta). Colocarlas en una fuente de horno. Poner en el hueco de cada una una nuez de mantequilla, una cucharadita de azúcar y un chorrito de coñac o vino dulce. Hornear a 200°C durante unos 35-40 minutos.",
    "ingredientes": ["Manzanas (tipo Reineta o Golden)", "Azúcar", "Mantequilla", "Vino dulce o Coñac", "Canela en polvo"]
  },
  {
    "nombre": "Peras al Vino Tinto",
    "categoria": "Postres",
    "instrucciones": "Pelar las peras dejando el rabito y un corte recto en la base para que se mantengan de pie. Ponerlas en una olla estrecha. Añadir vino tinto, azúcar, canela en rama y piel de naranja hasta casi cubrirlas. Cocer a fuego medio 30 min. Retirar las peras y reducir el líquido hasta que sea un sirope. Bañar las peras.",
    "ingredientes": ["Peras (tipo Conferencia)", "Vino tinto", "Azúcar", "Canela en rama", "Naranja"]
  },
  {
    "nombre": "Cuajada con Miel y Nueces",
    "categoria": "Postres",
    "instrucciones": "Calentar la leche (ideal de oveja) hasta los 37°C. Echar unas gotas de cuajo líquido en los vasitos. Verter la leche tibia rápidamente sobre el cuajo y no mover los vasos hasta que la leche solidifique (unos 15 min). Guardar en nevera. Servir con abundante miel y nueces troceadas.",
    "ingredientes": ["Leche entera (de oveja o vaca)", "Cuajo líquido", "Miel", "Nueces peladas"]
  },
  {
    "nombre": "Buñuelos de Viento",
    "categoria": "Postres",
    "instrucciones": "Hervir agua, mantequilla, sal y un poco de azúcar. Añadir la harina de golpe y remover hasta que la masa se despegue. Retirar y añadir huevos uno a uno mezclando bien. Freír pequeñas bolitas de masa en aceite a fuego medio (se darán la vuelta solos al hincharse). Rebozar en azúcar.",
    "ingredientes": ["Harina", "Agua", "Mantequilla", "Huevos", "Azúcar", "Sal", "Aceite para freír"]
  },
  {
    "nombre": "Tarta de Queso Fría (Sin horno)",
    "categoria": "Postres",
    "instrucciones": "Triturar galletas y mezclar con mantequilla fundida para hacer la base en un molde. Enfriar. Calentar un poco de leche y disolver gelatina neutra. Batir queso crema, nata líquida y azúcar, e incorporar la gelatina. Verter sobre la base y refrigerar 6 horas. Cubrir con mermelada de fresa o frambuesa.",
    "ingredientes": ["Queso crema (tipo Philadelphia)", "Nata para montar", "Azúcar", "Gelatina neutra (hojas o polvo)", "Leche", "Galletas tipo Digestive", "Mantequilla", "Mermelada de frutos rojos"]
  },
  {
    "nombre": "Macedonia de Frutas Naturales",
    "categoria": "Postres",
    "instrucciones": "Pelar y picar en dados pequeños la manzana, pera, plátano, kiwi, melocotón y fresas. Poner todo en un bol grande. Exprimir varias naranjas y verter el zumo sobre la fruta. Añadir una cucharada de azúcar si la fruta está ácida. Dejar macerar en la nevera al menos 2 horas antes de servir.",
    "ingredientes": ["Manzanas", "Plátanos", "Peras", "Naranjas (para zumo)", "Kiwis", "Fresas o Melocotón", "Azúcar"]
  },
  {
    "nombre": "Trufas de Chocolate Caseras",
    "categoria": "Postres",
    "instrucciones": "Calentar nata hasta que hierva. Retirar y volcar sobre chocolate negro troceado. Remover hasta fundir. Añadir un poco de mantequilla y mezclar. Dejar enfriar la mezcla (ganache) en la nevera varias horas hasta que esté dura. Hacer bolitas con las manos y rebozar en fideos de chocolate o cacao puro.",
    "ingredientes": ["Chocolate para postres (fondant)", "Nata para montar", "Mantequilla", "Fideos de chocolate o cacao en polvo"]
  },
  {
    "nombre": "Tocino de Cielo",
    "categoria": "Postres",
    "instrucciones": "Hacer un almíbar espeso hirviendo agua y azúcar durante 15 minutos. Dejar templar. Mezclar solo yemas de huevo y un huevo entero con cuidado de no hacer espuma. Añadir el almíbar en forma de hilo removiendo. Colar y verter en moldes caramelizados. Cocer al baño maría (en olla exprés o horno) unos 20 min.",
    "ingredientes": ["Yemas de huevo", "Huevo", "Azúcar", "Agua"]
  },
  {
    "nombre": "Pestiños Andaluces",
    "categoria": "Postres",
    "instrucciones": "Calentar aceite con cáscara de limón y anís en grano; enfriar y colar. Mezclar ese aceite con vino blanco y harina hasta hacer una masa que no se pegue. Reposar 30 min. Estirar, cortar en cuadrados y doblar dos esquinas hacia el centro. Freír en aceite y bañar en un almíbar caliente de miel y agua.",
    "ingredientes": ["Harina de trigo", "Aceite de oliva", "Vino blanco", "Matalauva (Anís en grano)", "Limón", "Miel", "Aceite para freír"]
  },
  {
    "nombre": "Quesada Pasiega Fácil",
    "categoria": "Postres",
    "instrucciones": "En un bol, mezclar yogur natural, huevos, azúcar, mantequilla derretida, harina, un poco de levadura y ralladura de limón. Batir todo con unas varillas hasta conseguir una crema homogénea. Verter en un molde engrasado y hornear a 180°C durante 45 minutos hasta que esté dorada por encima.",
    "ingredientes": ["Yogur natural", "Huevos", "Azúcar", "Mantequilla", "Harina", "Ralladura de limón", "Levadura química"]
  },
  {
    "nombre": "Sorbete de Limón al Cava",
    "categoria": "Postres",
    "instrucciones": "En una batidora de vaso o robot de cocina, añadir el helado de limón ligeramente descongelado, el cava muy frío y un chorrito de nata líquida para darle cremosidad. Triturar hasta que quede una mezcla homogénea y espumosa. Servir inmediatamente en copas (ideal para bajar comidas copiosas).",
    "ingredientes": ["Helado de limón", "Cava (Brut o Semi-seco)", "Nata líquida"]
  }
    ];

    // 3. Las insertamos
    for (const receta of misRecetas) {
      await prisma.receta.create({
        data: {
          nombre: receta.nombre,
          categoria: receta.categoria,
          instrucciones: receta.instrucciones,
          ingredientes: {
            create: receta.ingredientes.map((ing) => ({ nombre: ing }))
          }
        }
      });
    }

    res.send("<h2>✅ ¡Éxito! Las recetas se han restaurado correctamente desde Render.</h2>");
  } catch (error: any) {
    res.status(500).send(`<h2>❌ Error al restaurar:</h2><p>${error.message}</p>`);
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
    try {
      const casa = await prisma.house.findUnique({
        where: { id: houseId },
        select: { menuSemanal: true, listas: true } // Pedimos también las listas
      });

      if (casa) {
        if (casa.menuSemanal) socket.emit('menuUpdated', casa.menuSemanal);
        if (casa.listas) socket.emit('listasUpdated', casa.listas); // Enviamos las listas
      }
    } catch (error) {
      console.error("Error al cargar datos de la casa:", error);
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

  socket.on('addList', async ({ houseId, newList }) => {
    try {
      const casa = await prisma.house.findUnique({ where: { id: houseId } });
      if (casa) {
        // Transformamos por si hay datos antiguos y añadimos la nueva
        const listasActuales = Array.isArray(casa.listas) ? casa.listas.map((l: any) => typeof l === 'string' ? { nombre: l, icono: '🛒', color: '#e0f0ff' } : l) : [];
        
        if (!listasActuales.some(l => l.nombre === newList.nombre)) {
          const nuevasListas = [...listasActuales, newList];
          await prisma.house.update({ where: { id: houseId }, data: { listas: nuevasListas } });
          io.to(houseId).emit('listasUpdated', nuevasListas);
        }
      }
    } catch (error) { console.error(error); }
  });

  socket.on('deleteList', async ({ houseId, listName }) => {
    try {
      const casa = await prisma.house.findUnique({ where: { id: houseId } });
      if (casa) {
        const listasActuales = Array.isArray(casa.listas) ? casa.listas.map((l: any) => typeof l === 'string' ? { nombre: l, icono: '🛒', color: '#e0f0ff' } : l) : [];
        const nuevasListas = listasActuales.filter(l => l.nombre !== listName);
        
        await prisma.house.update({ where: { id: houseId }, data: { listas: nuevasListas } });
        await prisma.item.deleteMany({ where: { houseId, supermercado: listName } });
        io.to(houseId).emit('listasUpdated', nuevasListas);
      }
    } catch (error) { console.error(error); }
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