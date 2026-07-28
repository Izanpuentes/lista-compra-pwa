import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// --- FUNCIÓN MÁGICA DE TRADUCCIÓN ---
// Usa una API pública de Google Translate sin necesidad de API Keys
async function traducir(texto: string): Promise<string> {
  if (!texto) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(texto)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data[0][0][0];
  } catch (error) {
    console.error(`⚠️ Error traduciendo "${texto}". Se guardará en inglés.`);
    return texto; // Si falla, lo guardamos en inglés para no perder la receta
  }
}

// Función para pausar el script y que las APIs no nos detecten como un ataque (Rate Limiting)
const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🌱 Iniciando la descarga y TRADUCCIÓN de recetas...');
  console.log('⚠️ Este proceso tardará unos minutos para no saturar a Google. Paciencia...');

  await prisma.ingrediente.deleteMany();
  await prisma.receta.deleteMany();

  const abecedario = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let totalRecetas = 0;

  for (const letra of abecedario) {
    console.log(`\n🔍 Buscando recetas por la letra "${letra.toUpperCase()}"...`);
    
    try {
      const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?f=${letra}`);
      const data = await response.json();

      if (data.meals) {
        for (const meal of data.meals) {
          // 1. Recopilar ingredientes crudos
          const ingredientesRaw = [];
          for (let i = 1; i <= 20; i++) {
            const ingrediente = meal[`strIngredient${i}`];
            if (ingrediente && ingrediente.trim() !== '') {
              ingredientesRaw.push(ingrediente.trim());
            }
          }

          // 2. TRUCO DE OPTIMIZACIÓN: Traducir todo de golpe
          // Unimos los ingredientes con un separador raro (" | ") para hacer una sola petición
          const nombreTraducido = await traducir(meal.strMeal);
          const paisTraducido = await traducir(meal.strArea || 'Internacional');
          
          const cadenaIngredientes = ingredientesRaw.join(' | ');
          const cadenaTraducida = await traducir(cadenaIngredientes);
          
          // Volvemos a separar la cadena traducida en un array de ingredientes
          const ingredientesTraducidos = cadenaTraducida.split('|').map(ing => ({ 
            nombre: ing.trim().replace(/^./, str => str.toUpperCase()) // Ponemos la primera letra en mayúscula
          }));

          // 3. Guardar en la base de datos
          await prisma.receta.create({
            data: {
              nombre: nombreTraducido,
              categoria: paisTraducido,
              tiempo: '45 min', // TheMealDB no provee tiempo
              ingredientes: {
                create: ingredientesTraducidos
              }
            }
          });
          
          totalRecetas++;
          process.stdout.write(`✅ ${nombreTraducido} guardada... `);
          
          // Pausa de 1.5 segundos entre recetas para que Google Translate no nos bloquee
          await esperar(1500); 
        }
      } else {
        console.log(`Sin resultados para la letra ${letra.toUpperCase()}`);
      }
    } catch (error) {
      console.error(`❌ Error general en la letra ${letra}:`, error);
    }
  }

  console.log(`\n🎉 ¡ÉXITO! Se han descargado, traducido y guardado ${totalRecetas} recetas en tu base de datos.`);
}

main()
  .catch((e) => {
    console.error("❌ Error fatal durante el seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });