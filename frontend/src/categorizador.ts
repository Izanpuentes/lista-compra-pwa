export const categorizarProducto = (nombreItem: string): string => {
  if (!nombreItem) return 'Otros';

  // Normalizamos: minúsculas y sin tildes
  const lower = nombreItem.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // --- DICCIONARIOS MASIVOS ---
  const kwFritos = [
    'patatas fritas', 'bolsa', 'nacho', 'ganchito', 'kiko', 'palomitas', 'dorito', 'cheeto', 
    'rufle', 'pringles', 'corteza', 'torrezno', 'gusanito', 'snack'
  ];
  
  const kwVerduras = [
    'patata', 'tomate', 'fruta', 'verdura', 'cebolla', 'zanahoria', 'pimiento', 'ajo', 
    'lechuga', 'calabacin', 'platano', 'manzana', 'naranja', 'limon', 'brocoli', 'puerro', 
    'berenjena', 'espinaca', 'acelga', 'champiñon', 'seta', 'pera', 'mandarina', 'uva', 
    'fresa', 'melon', 'sandia', 'kiwi', 'aguacate', 'melocoton', 'ciruela', 'cereza', 
    'pepino', 'coliflor', 'repollo', 'alcachofa', 'calabaza', 'batata', 'boniato'
  ];
  
  const kwCarnes = [
    'pollo', 'carne', 'ternera', 'cerdo', 'lomo', 'pechuga', 'pavo', 'chuleta', 'salchicha fresca', 
    'cordero', 'muslo', 'costilla', 'picada', 'hamburguesa', 'panceta', 'bacon', 'entrecot', 
    'solomillo', 'carcasa', 'alitas', 'pincho moruno'
  ];
  
  const kwPescados = [
    'pescado', 'salmon', 'merluza', 'lubina', 'dorada', 'bacalao', 'gamba', 'langostino', 
    'pulpo', 'calamar', 'sepia', 'boqueron', 'atun fresco', 'bonito', 'pez espada', 'langosta', 
    'mejillon', 'almeja', 'berberecho', 'sardina fresca', 'gallo', 'rodaballo', 'trucha', 
    'rape', 'cigala', 'chipiron'
  ];
  
  const kwLeche = [
    'leche', 'bebida de avena', 'bebida de soja', 'bebida de almendra', 'leche sin lactosa', 
    'leche entera', 'leche semidesnatada', 'leche desnatada'
  ];
  
  const kwPan = [
    'pan', 'barra', 'hogaza', 'pico', 'colin', 'baguette', 'chapata', 'molde', 'integral', 
    'biscote', 'regaña', 'panecillo', 'pulguita'
  ];
  
  const kwAlcohol = [
    'cerveza', 'vino', 'alcohol', 'licor', 'ron', 'ginebra', 'vodka', 'whisky', 'tinto', 
    'blanco', 'rosado', 'cava', 'champagne', 'sidra', 'vermut', 'tequila', 'lata de cerveza'
  ];
  
  const kwLacteosEmbutidos = [
    'queso', 'jamon', 'yogur', 'embutido', 'chorizo', 'salchichon', 'mortadela', 'mantequilla', 
    'nata', 'kefir', 'pavo cocido', 'jamon york', 'jamon serrano', 'fuet', 'salami', 'lomo embuchado', 
    'sobrasada', 'provolone', 'mozzarella', 'parmesano', 'brie', 'camembert', 'cuajada', 'flan', 
    'natillas', 'arroz con leche'
  ];
  
  const kwPrecocinados = [
    'pizza', 'lasaña', 'precocinado', 'tortilla', 'croqueta', 'canelon', 'empanadilla', 'empanada', 
    'gazpacho', 'salmorejo', 'sopa', 'pure', 'crema de', 'pasta fresca', 'ravioli', 'tortellini', 
    'nugget', 'rollito', 'hummus', 'guacamole'
  ];
  
  const kwEnlatados = [
    'lata', 'atun', 'maiz', 'esparrago', 'mejillon', 'sardina', 'tomate frito', 'brik', 'bote', 
    'aceituna', 'berberecho en conserva', 'anchoa', 'guisante', 'judia verde', 'garbanzo', 
    'lenteja', 'alubia', 'fabada', 'champiñon en lata', 'pimiento asado', 'melocoton en almibar', 
    'piña en su jugo', 'caldo'
  ];
  
  const kwChocolatesFrutosSecos = [
    'chocolate', 'nuez', 'almendra', 'pistacho', 'cacahuete', 'pipa', 'bombon', 'cacao', 
    'tableta', 'trufa', 'nutella', 'nocilla', 'crema de cacahuete', 'avellana', 'pasa', 
    'datil', 'castaña', 'anacardo'
  ];
  
  const kwHigiene = [
    'gel', 'champu', 'papel', 'pasta', 'jabon', 'desodorante', 'lejia', 'fregasuelos', 
    'suavizante', 'detergente', 'limpiacristales', 'cepillo', 'esponja', 'fregona', 'escoba', 
    'recogedor', 'cubo', 'bolsa de basura', 'estropajo', 'balleta', 'servilleta', 'rollo', 
    'compresa', 'tampon', 'cuchilla', 'espuma de afeitar', 'crema', 'mascarilla', 'acondicionador', 
    'colonia', 'ambientador', 'insecticida'
  ];
  
  const kwHelados = [
    'helado', 'polo', 'tarrina', 'cucurucho', 'bombon helado', 'sorbete', 'corte', 'sandwich helado'
  ];
  
  const kwDesayuno = [
    'galleta', 'cereal', 'cafe', 'mermelada', 'bolleria', 'magdalena', 'croissant', 'infusion', 
    'te', 'azucar', 'edulcorante', 'sacarina', 'miel', 'cacao soluble', 'colacao', 'nesquik', 
    'bizcocho', 'sobao', 'ensaimada', 'donuts', 'copos de avena'
  ];

  // Función auxiliar de comprobación
  const matches = (keywords: string[]) => keywords.some(kw => lower.includes(kw));

  // --- ASIGNACIÓN CON PRIORIDAD ---
  // Las categorías con palabras que pueden solaparse van primero
  if (matches(kwFritos)) return 'Fritos/Bolsas';
  if (matches(kwPrecocinados)) return 'Precocinados';
  if (matches(kwHelados)) return 'Helados';
  
  // Categorías principales
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