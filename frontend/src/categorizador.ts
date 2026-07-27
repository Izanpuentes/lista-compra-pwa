// --- 1. ALGORITMO DE DISTANCIA DE LEVENSHTEIN ---
// Calcula cuántas letras hay que cambiar para ir de la palabra 'a' a la palabra 'b'
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // Eliminación
        matrix[i][j - 1] + 1, // Inserción
        matrix[i - 1][j - 1] + cost // Sustitución
      );
    }
  }
  return matrix[a.length][b.length];
};

export const categorizarProducto = (nombreItem: string): string => {
  if (!nombreItem) return 'Otros';

  // Normalizamos: minúsculas y sin tildes
  const lower = nombreItem.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // --- 2. DICCIONARIOS MASIVOS ---
  const kwFritos = ['patatas fritas', 'bolsa', 'nacho', 'ganchito', 'kiko', 'palomitas', 'dorito', 'cheeto', 'rufle', 'pringles', 'corteza', 'torrezno', 'gusanito', 'snack'];
  const kwVerduras = ['patata', 'tomate', 'fruta', 'verdura', 'cebolla', 'zanahoria', 'pimiento', 'ajo', 'lechuga', 'calabacin', 'platano', 'manzana', 'naranja', 'limon', 'brocoli', 'puerro', 'berenjena', 'espinaca', 'acelga', 'champiñon', 'seta', 'pera', 'mandarina', 'uva', 'fresa', 'melon', 'sandia', 'kiwi', 'aguacate', 'melocoton', 'ciruela', 'cereza', 'pepino', 'coliflor', 'repollo', 'alcachofa', 'calabaza', 'batata', 'boniato'];
  const kwCarnes = ['pollo', 'carne', 'ternera', 'cerdo', 'lomo', 'pechuga', 'pavo', 'chuleta', 'salchicha fresca', 'cordero', 'muslo', 'costilla', 'picada', 'hamburguesa', 'panceta', 'bacon', 'entrecot', 'solomillo', 'carcasa', 'alitas', 'pincho moruno', 'albondiga'];
  const kwPescados = ['pescado', 'salmon', 'merluza', 'lubina', 'dorada', 'bacalao', 'gamba', 'langostino', 'pulpo', 'calamar', 'sepia', 'boqueron', 'atun fresco', 'bonito', 'pez espada', 'langosta', 'mejillon', 'almeja', 'berberecho', 'sardina fresca', 'gallo', 'rodaballo', 'trucha', 'rape', 'cigala', 'chipiron'];
  const kwLeche = ['leche', 'bebida de avena', 'bebida de soja', 'bebida de almendra', 'leche sin lactosa', 'leche entera', 'leche semidesnatada', 'leche desnatada'];
  const kwPan = ['pan', 'barra', 'hogaza', 'pico', 'colin', 'baguette', 'chapata', 'molde', 'integral', 'biscote', 'regaña', 'panecillo', 'pulguita'];
  const kwAlcohol = ['cerveza', 'vino', 'alcohol', 'licor', 'ron', 'ginebra', 'vodka', 'whisky', 'tinto', 'blanco', 'rosado', 'cava', 'champagne', 'sidra', 'vermut', 'tequila', 'lata de cerveza'];
  const kwLacteosEmbutidos = ['queso', 'jamon', 'yogur', 'embutido', 'chorizo', 'salchichon', 'mortadela', 'mantequilla', 'nata', 'kefir', 'pavo cocido', 'jamon york', 'jamon serrano', 'fuet', 'salami', 'lomo embuchado', 'sobrasada', 'provolone', 'mozzarella', 'parmesano', 'brie', 'camembert', 'cuajada', 'flan', 'natillas', 'arroz con leche'];
  const kwPrecocinados = ['pizza', 'lasaña', 'precocinado', 'tortilla', 'croqueta', 'canelon', 'empanadilla', 'empanada', 'gazpacho', 'salmorejo', 'sopa', 'pure', 'crema de', 'pasta fresca', 'ravioli', 'tortellini', 'nugget', 'rollito', 'hummus', 'guacamole'];
  const kwEnlatados = ['lata', 'atun', 'maiz', 'esparrago', 'mejillon', 'sardina', 'tomate frito', 'brik', 'bote', 'aceituna', 'berberecho en conserva', 'anchoa', 'guisante', 'judia verde', 'garbanzo', 'lenteja', 'alubia', 'fabada', 'champiñon en lata', 'pimiento asado', 'melocoton en almibar', 'piña en su jugo', 'caldo'];
  const kwChocolatesFrutosSecos = ['chocolate', 'nuez', 'almendra', 'pistacho', 'cacahuete', 'pipa', 'bombon', 'cacao', 'tableta', 'trufa', 'nutella', 'nocilla', 'crema de cacahuete', 'avellana', 'pasa', 'datil', 'castaña', 'anacardo'];
  const kwHigiene = ['gel', 'champu', 'papel', 'pasta', 'jabon', 'desodorante', 'lejia', 'fregasuelos', 'suavizante', 'detergente', 'limpiacristales', 'cepillo', 'esponja', 'fregona', 'escoba', 'recogedor', 'cubo', 'bolsa de basura', 'estropajo', 'balleta', 'servilleta', 'rollo', 'compresa', 'tampon', 'cuchilla', 'espuma de afeitar', 'crema', 'mascarilla', 'acondicionador', 'colonia', 'ambientador', 'insecticida'];
  const kwHelados = ['helado', 'polo', 'tarrina', 'cucurucho', 'bombon helado', 'sorbete', 'corte', 'sandwich helado'];
  const kwDesayuno = ['galleta', 'cereal', 'cafe', 'mermelada', 'bolleria', 'magdalena', 'croissant', 'infusion', 'te', 'azucar', 'edulcorante', 'sacarina', 'miel', 'cacao soluble', 'colacao', 'nesquik', 'bizcocho', 'sobao', 'ensaimada', 'donuts', 'copos de avena'];

  // --- 3. LÓGICA DE BÚSQUEDA DIFUSA (FUZZY MATCHING) ---
  const matches = (keywords: string[]) => {
    // 3.1. Búsqueda exacta inicial (rápida)
    if (keywords.some(kw => lower.includes(kw))) return true;

    // 3.2. Si no hay coincidencia exacta, comprobamos fallos ortográficos/pronunciación
    const palabrasUsuario = lower.split(/\s+/); // Troceamos la frase del usuario

    for (const palabra of palabrasUsuario) {
      // Ignoramos palabras muy cortas (artículos, preposiciones) para evitar falsos positivos
      if (palabra.length <= 3) continue; 

      for (const kw of keywords) {
        // Cuanto más larga es la palabra clave, más errores de escritura permitimos
        // Ej: 'pan' (3) = 0 errores. 'cebolla' (7) = 1 error. 'champiñon' (9) = 2 errores.
        const tolerancia = Math.floor(kw.length / 5) + 1; 
        
        if (getLevenshteinDistance(palabra, kw) <= tolerancia) {
          return true; // Hemos encontrado una palabra lo suficientemente parecida
        }
      }
    }
    
    return false;
  };

  // --- 4. ASIGNACIÓN CON PRIORIDAD ---
  if (matches(kwFritos)) return 'Fritos/Bolsas';
  if (matches(kwPrecocinados)) return 'Precocinados';
  if (matches(kwHelados)) return 'Helados';
  if (matches(kwVerduras)) return 'Verduras y frutas';
  if (matches(kwCarnes)) return 'Carnes';
  if (matches(kwPescados)) return 'Pescados';
  if (matches(kwLeche)) return 'Leche';
  if (matches(kwPan)) return 'Pan';
  if (matches(kwAlcohol)) return 'Alcohol';
  if (matches(kwLacteosEmbutidos)) return 'Lácteos y embutidos';
  if (matches(kwEnlatados)) return 'Enlatados';
  if (matches(kwChocolatesFrutosSecos)) return 'Chocolates y frutos secos';
  if (matches(kwHigiene)) return 'Higiene';
  if (matches(kwDesayuno)) return 'Desayuno';
  
  return 'Otros';
};