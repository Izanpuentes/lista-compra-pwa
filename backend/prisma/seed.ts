import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Leyendo archivo local de recetas mediterráneas...');

  // 1. Lee el archivo JSON que acabamos de crear
  const datosRaw = fs.readFileSync('./prisma/recetas_mediterraneas.json', 'utf-8');
  const recetasData = JSON.parse(datosRaw);

  // 2. Limpia la base de datos
  await prisma.ingrediente.deleteMany();
  await prisma.receta.deleteMany();

  // 3. Inserta todas las recetas del JSON masivo en milisegundos
  for (const receta of recetasData) {
    await prisma.receta.create({
      data: {
        nombre: receta.nombre,
        categoria: receta.categoria,
        instrucciones: receta.instrucciones,
        ingredientes: {
          create: receta.ingredientes.map((ing: string) => ({ nombre: ing }))
        }
      }
    });
  }

  console.log(`✅ ¡Éxito! Se han insertado ${recetasData.length} recetas mediterráneas en tu base de datos.`);
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });