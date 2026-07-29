import { useState, useEffect, useRef} from 'react'
import { io } from 'socket.io-client'
import { categorizarProducto } from './categorizador'

interface ShoppingItem {
  id: string; 
  name: string;
  comprado: boolean;
  houseId: string;
  supermercado: string;
  categoria: string;
  creador: string;
}

// --- INTERFACES ACTUALIZADAS ---
interface Ingrediente {
  nombre: string;
}

interface Receta {
  id: string;
  nombre: string;
  categoria: string;
  instrucciones: string;
  ingredientes: Ingrediente[];
}

const socket = io()

const RUTAS_SUPERMERCADO = [
  'Verduras y frutas', 'Carnes', 'Pescados', 'Desayuno', 'Fritos/Bolsas', 
  'Pan', 'Leche', 'Alcohol', 'Lácteos y embutidos', 'Precocinados', 
  'Enlatados', 'Chocolates y frutos secos', 'Higiene', 'Helados', 'Otros'
];

const ORDEN_MERCADONA = [
  'Verduras y frutas',         // Frutas y verduras
  'Precocinados',              // Comida lista para llevar
  'Enlatados',                 // Enlatados
  'Pescados',                  // Pescados
  'Carnes',                    // (La pongo junto al pescado para no dejarla suelta)
  'Helados',                   // Helados / Congelados
  'Fritos/Bolsas',             // Bolsas de fritos
  'Lácteos y embutidos',       // Embutidos y jamón
  'Leche',                     // Lácteos
  'Alcohol',                   // Bebidas gaseosas y alcohol
  'Desayuno',                  // Desayuno
  'Pan',                       // Pan
  'Chocolates y frutos secos', // Extras
  'Higiene',                   // Higiene
  'Otros'                      // Salsas, caldos, huevos, etc.
];

// --- GENERADOR DEL CALENDARIO DINÁMICO ---
const obtenerProximos7Dias = () => {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + i);
    
    // Clave interna única (ej: "2024-10-25")
    const idFormato = fecha.toISOString().split('T')[0]; 
    
    // Nombre visual (ej: "viernes, 25")
    let nombreFormato = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' }).format(fecha);
    // Capitalizamos la primera letra (ej: "Viernes, 25")
    nombreFormato = nombreFormato.charAt(0).toUpperCase() + nombreFormato.slice(1);
    
    // Le añadimos la etiqueta amigable
    if (i === 0) nombreFormato += ' (Hoy)';
    if (i === 1) nombreFormato += ' (Mañana)';

    dias.push({ id: idFormato, nombre: nombreFormato });
  }
  return dias;
};

function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(localStorage.getItem('listaCompraUser'))
  const [houseId] = useState('a513962b-c0c9-446f-bf70-2684f545b4dd')
  const [items, setItems] = useState<ShoppingItem[]>([])
  
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState('Otros')
  
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false)
  const [suggestionText, setSuggestionText] = useState('')
  const [activeSupermarket, setActiveSupermarket] = useState<string | null>(null)

  // --- ESTADO PARA LA VOZ ---
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null);

  // --- ESTADOS DEL RECETARIO ---
  const [isRecetarioOpen, setIsRecetarioOpen] = useState(false);
  const [recetasBaseDatos, setRecetasBaseDatos] = useState<Receta[]>([]);
  
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [recetaExpandida, setRecetaExpandida] = useState<string | null>(null);
  const [recetaPendiente, setRecetaPendiente] = useState<Receta | null>(null);
  
  const [busquedaReceta, setBusquedaReceta] = useState(''); 

  const categorias = ['Todas', 'Legumbres', 'Carnes', 'Pescados', 'Pastas', 'Huevos', 'Sopas y Cremas', 'Verduras', 'Ensaladas', 'Arroces', 'Tapas', 'Postres'];
  
  // --- ESTADOS DEL CALENDARIO (MENÚ SEMANAL DINÁMICO V2) ---
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [expandidoCalendario, setExpandidoCalendario] = useState<string | null>(null);
  const [modoAsignacion, setModoAsignacion] = useState<{dia: string, tipo: 'comida'|'cena'} | null>(null);
  
  const diasCalendario = obtenerProximos7Dias();

  // Ahora guardamos objetos de Receta enteros, por lo que cambiamos el nombre en localStorage (AppV2)
  const [menuSemanal, setMenuSemanal] = useState<Record<string, {comida: Receta | null, cena: Receta | null}>>(() => {
    const guardado = localStorage.getItem('menuSemanalAppV2');
    return guardado ? JSON.parse(guardado) : {};
  });

  const handleEliminarRecetaCalendario = (dia: string, tipo: 'comida'|'cena') => {
    const nuevoMenu = {
      ...menuSemanal,
      [dia]: { ...(menuSemanal[dia] || { comida: null, cena: null }), [tipo]: null }
    };
    setMenuSemanal(nuevoMenu);
    localStorage.setItem('menuSemanalAppV2', JSON.stringify(nuevoMenu));
  };

  const handleAsignarRecetaDesdeCalendario = (receta: Receta) => {
    if (!modoAsignacion) return;
    const nuevoMenu = {
      ...menuSemanal,
      [modoAsignacion.dia]: { ...(menuSemanal[modoAsignacion.dia] || { comida: null, cena: null }), [modoAsignacion.tipo]: receta }
    };
    setMenuSemanal(nuevoMenu);
    localStorage.setItem('menuSemanalAppV2', JSON.stringify(nuevoMenu));
    
    // Restauramos las pantallas
    setModoAsignacion(null);
    setIsRecetarioOpen(false);
    setIsCalendarOpen(true);
  };

  // --- CONEXIÓN RECETARIO -> CALENDARIO (BOTÓN MANUAL) ---
  const [recetaParaCalendario, setRecetaParaCalendario] = useState<Receta | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState(diasCalendario[0].id);
  const [tipoComidaSeleccionado, setTipoComidaSeleccionado] = useState<'comida' | 'cena'>('comida');

  const confirmarAñadirAlCalendario = () => {
    if (!recetaParaCalendario) return;
    const nuevoMenu = {
      ...menuSemanal,
      [diaSeleccionado]: { ...(menuSemanal[diaSeleccionado] || { comida: null, cena: null }), [tipoComidaSeleccionado]: recetaParaCalendario }
    };
    setMenuSemanal(nuevoMenu);
    localStorage.setItem('menuSemanalAppV2', JSON.stringify(nuevoMenu));

    const diaNom = diasCalendario.find(d => d.id === diaSeleccionado)?.nombre || diaSeleccionado;
    alert(`✅ "${recetaParaCalendario.nombre}" asignado al ${diaNom} para la ${tipoComidaSeleccionado}`);
    setRecetaParaCalendario(null);
  };

  // LÓGICA DE FILTRADO DOBLE (Por categoría y por barra de búsqueda)
  const recetasFiltradas = recetasBaseDatos.filter(receta => {
    const coincideCategoria = categoriaActiva === 'Todas' || receta.categoria === categoriaActiva;
    const termino = busquedaReceta.toLowerCase();
    const coincideBusqueda = receta.nombre.toLowerCase().includes(termino) || 
                             receta.ingredientes.some(i => i.nombre.toLowerCase().includes(termino));
    return coincideCategoria && coincideBusqueda;
  });
  
  useEffect(() => {
    socket.emit('joinHouse', houseId)

    fetch(`/api/houses/${houseId}/items`)
      .then(res => res.json())
      .then(data => {
        setItems(data);
        localStorage.setItem('backupItems', JSON.stringify(data)); 
      })
      .catch(() => {
        console.error("Estás offline, cargando copia de seguridad local");
        const backup = localStorage.getItem('backupItems');
        if (backup) setItems(JSON.parse(backup));
      });

    fetch('/api/recetas')
      .then(res => res.json())
      .then(data => setRecetasBaseDatos(data))
      .catch(err => console.error("Error cargando recetas:", err));

    socket.on('itemAdded', (newItem) => setItems((prev) => [newItem, ...prev]))
    socket.on('item-toggled', (updatedItem) => setItems((prev) => prev.map(item => item.id === updatedItem.id ? updatedItem : item)))
    socket.on('itemDeleted', (deletedItemId) => setItems((prev) => prev.filter(item => item.id !== deletedItemId)))
    
    socket.on('connect', () => {
      const colaOffline = JSON.parse(localStorage.getItem('colaSincronizacion') || '[]');
      if (colaOffline.length > 0) {
        colaOffline.forEach((accion: any) => socket.emit(accion.evento, accion.data));
        localStorage.removeItem('colaSincronizacion');
      }
    });

    return () => {
      socket.off('itemAdded')
      socket.off('item-toggled') 
      socket.off('itemDeleted')
      socket.off('suggestionSent')
    }
  }, [houseId])

  // --- LÓGICA DEL RECONOCIMIENTO DE VOZ ---
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Lo siento, tu navegador no soporta el dictado por voz.");

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition; 
    recognition.lang = 'es-ES';
    recognition.continuous = true; 
    recognition.interimResults = false; 

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const lastIndex = event.results.length - 1;
      const transcript: string = String(event.results[lastIndex][0].transcript).trim().replace(/\.$/, '');
      if (!transcript) return;

      const productosDichos = transcript.split(/\s+y\s+|,/i).map((p: string) => p.trim()).filter((p: string) => p.length > 0);

      productosDichos.forEach((productoStr: string) => {
        const categoriaDetectada = categorizarProducto(productoStr);
        socket.emit('addItem', { name: productoStr, houseId, supermercado: activeSupermarket, categoria: categoriaDetectada, creador: currentUser });
      });
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleAñadirReceta = (receta: Receta) => {
    if (!activeSupermarket) {
      setRecetaPendiente(receta);
      return;
    }
    procesarAñadirReceta(receta, activeSupermarket);
  };

  const procesarAñadirReceta = (receta: Receta, supermercadoDestino: string) => {
    receta.ingredientes.forEach(ingrediente => {
      // Normalizamos el nombre (minúsculas y sin espacios extra) para comparar bien
      const nombreNormalizado = ingrediente.nombre.trim().toLowerCase();
      
      // Comprobamos si el ingrediente ya existe en ESE supermercado
      const itemExistente = items.find(
        item => item.supermercado === supermercadoDestino && 
                item.name.trim().toLowerCase() === nombreNormalizado
      );

      if (itemExistente) {
        // Si existe y ya estaba comprado (frecuentes), lo desmarcamos para que vuelva a la lista
        if (itemExistente.comprado) {
          socket.emit('toggle-item', { itemId: itemExistente.id, houseId, comprado: false });
        }
        // Si no está comprado (ya está en la lista activa), NO HACEMOS NADA.
      } else {
        // Si no existe en absoluto, lo añadimos como un producto totalmente nuevo
        const categoriaDetectada = categorizarProducto(ingrediente.nombre);
        const nuevoItemData = {
          name: ingrediente.nombre,
          houseId: houseId,
          supermercado: supermercadoDestino,
          categoria: categoriaDetectada,
          creador: currentUser
        };
        emitirOSincronizar('addItem', nuevoItemData);
      }
    });

    alert(`✅ ¡Ingredientes de "${receta.nombre}" añadidos a ${supermercadoDestino}!`);
    setRecetaPendiente(null); 
    setIsRecetarioOpen(false); 
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setNewItemName(text);
    setNewItemCategory(categorizarProducto(text));
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim() || !activeSupermarket || !currentUser) return

    socket.emit('addItem', { name: newItemName, houseId, supermercado: activeSupermarket, categoria: newItemCategory, creador: currentUser })
    setNewItemName(''); setNewItemCategory('Otros');
  }

  const emitirOSincronizar = (evento: string, data: any) => {
    if (socket.connected) {
      socket.emit(evento, data);
    } else {
      const colaOffline = JSON.parse(localStorage.getItem('colaSincronizacion') || '[]');
      colaOffline.push({ evento, data });
      localStorage.setItem('colaSincronizacion', JSON.stringify(colaOffline));
    }
  };

  const toggleItem = (item: ShoppingItem) => socket.emit('toggle-item', { itemId: item.id, houseId, comprado: !item.comprado });
  const handleDeleteItem = (itemId: string) => {
    emitirOSincronizar('deleteItem', { houseId, itemId });
    setItems((prev) => prev.filter(item => item.id !== itemId));
  };
  const handleSendSuggestion = () => {
    if (!suggestionText.trim()) return;
    
    // Lo enviamos al servidor
    socket.emit('sendSuggestion', { text: suggestionText, houseId, creador: currentUser });
    
    // Limpiamos y cerramos al instante sin esperar respuesta del servidor
    alert("¡Sugerencia enviada correctamente!");
    setIsSuggestionOpen(false);
    setSuggestionText('');
  }

  const getBackgroundColor = () => {
    if (activeSupermarket === 'aldi') return '#e0f0ff';
    if (activeSupermarket === 'mercadona') return '#e6faec';
    if (activeSupermarket === 'lidl') return '#fffde6';
    if (activeSupermarket === 'costco') return '#ffe6e6';
    return '#ffffff';
  }

  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <h1 style={{ marginBottom: '30px', textAlign: 'center' }}>¿Quién está haciendo la lista?</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px' }}>
          {['Izán', 'Mamá', 'Papá', 'Hermana'].map(nombre => (
            <button 
              key={nombre}
              onClick={() => { localStorage.setItem('listaCompraUser', nombre); setCurrentUser(nombre); }}
              style={{ WebkitAppearance: 'none', padding: '15px', fontSize: '20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {nombre}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const filteredItems = items.filter(item => item.supermercado === activeSupermarket);
  const categoriasAUsar = activeSupermarket === 'mercadona' ? ORDEN_MERCADONA : RUTAS_SUPERMERCADO;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: getBackgroundColor(), transition: 'background-color 0.4s ease', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '1.5rem', paddingBottom: '100px' }}>
        
        {/* --- PANTALLA PRINCIPAL (Supermercados) --- */}
        {!activeSupermarket && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '30px', animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h1 style={{ margin: 0, fontSize: '32px', color: '#1a1a1a', fontWeight: '800', letterSpacing: '-0.5px' }}>Tus Listas</h1>
                <span style={{ color: '#666', fontSize: '16px', marginTop: '4px' }}>¿Dónde vamos a comprar, <strong>{currentUser}</strong>?</span>
              </div>
              <button 
                onClick={() => { localStorage.removeItem('listaCompraUser'); setCurrentUser(null); }}
                style={{ background: 'white', border: 'none', padding: '10px 14px', borderRadius: '12px', cursor: 'pointer', color: '#444', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}
              >
                👤 Cambiar
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <button onClick={() => setActiveSupermarket('aldi')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #005b9f 0%, #003f75 100%)', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(0,91,159,0.25)', transition: 'transform 0.1s' }}>
                <span style={{ fontSize: '34px', background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🛍️</span>
                Aldi
              </button>
              
              <button onClick={() => setActiveSupermarket('mercadona')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #00824b 0%, #005c35 100%)', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(0,130,75,0.25)' }}>
                <span style={{ fontSize: '34px', background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🧺</span>
                Mercadona
              </button>

              <button onClick={() => setActiveSupermarket('lidl')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #ffd700 0%, #f0b400 100%)', color: '#003f75', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(255,215,0,0.3)' }}>
                <span style={{ fontSize: '34px', background: 'rgba(0,63,117,0.1)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🛒</span>
                Lidl
              </button>

              <button onClick={() => setActiveSupermarket('costco')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #e31837 0%, #a61027 100%)', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(227,24,55,0.25)' }}>
                <span style={{ fontSize: '34px', background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>📦</span>
                Costco
              </button>
            </div>
          </div>
        )}

        {/* --- PANTALLA DE LA LISTA DE LA COMPRA --- */}
        {activeSupermarket && (
          <div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
              <button onClick={() => setActiveSupermarket(null)} style={{ WebkitAppearance: 'none', padding: '10px 14px', fontSize: '16px', cursor: 'pointer', borderRadius: '14px', border: 'none', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⬅️ <span style={{ display: 'none', '@media (min-width: 400px)': { display: 'inline' } } as any}>Atrás</span>
              </button>
              <h1 style={{ margin: 0, textTransform: 'capitalize', fontSize: '22px', fontWeight: '800', color: '#1a1a1a', flex: 1, textAlign: 'center', paddingRight: '40px' }}>
                {activeSupermarket}
              </h1>
            </div>
            
            <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '35px', backgroundColor: 'white', padding: '20px', borderRadius: '24px', boxShadow: '0 8px 25px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={handleNameChange}
                  placeholder={`¿Qué falta en ${activeSupermarket}?`} 
                  style={{ flex: 1, padding: '16px', fontSize: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', backgroundColor: '#f8f9fa', WebkitAppearance: 'none', minWidth: 0, outline: 'none' }}
                />
                <button 
                  type="button" 
                  onClick={toggleListening} 
                  style={{ WebkitAppearance: 'none', width: '56px', height: '56px', fontSize: '22px', cursor: 'pointer', backgroundColor: isListening ? '#ff4d4f' : '#f0f2f5', color: isListening ? 'white' : 'black', border: 'none', borderRadius: '16px', flexShrink: 0, transition: 'all 0.3s ease', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: isListening ? '0 4px 15px rgba(255,77,79,0.3)' : 'none' }}
                >
                  {isListening ? '🔴' : '🎙️'}
                </button>
              </div>
              <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} style={{ padding: '16px', fontSize: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', backgroundColor: '#f8f9fa', WebkitAppearance: 'none', color: '#444', width: '100%', outline: 'none', fontWeight: '500' }}>
                {categoriasAUsar.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <button type="submit" style={{ WebkitAppearance: 'none', padding: '16px', fontSize: '16px', cursor: 'pointer', background: 'linear-gradient(135deg, #28a745 0%, #208838 100%)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 'bold', width: '100%', boxShadow: '0 6px 15px rgba(40,167,69,0.25)' }}>
                ➕ Añadir al carrito
              </button>
            </form>

            {categoriasAUsar.map(categoria => {
              const itemsDeEstaCategoria = filteredItems.filter(item => !item.comprado && item.categoria === categoria);
              if (itemsDeEstaCategoria.length === 0) return null; 
              
              return (
                <div key={categoria} style={{ marginBottom: '25px' }}>
                  <h4 style={{ margin: '0 0 12px 10px', color: '#666', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>
                    📍 {categoria}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {itemsDeEstaCategoria.map(item => (
                      <div key={item.id} onClick={() => toggleItem(item)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: 'white', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', cursor: 'pointer' }}>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #ddd', flexShrink: 0 }}></div>
                          <span style={{ fontSize: '18px', color: '#222', fontWeight: '500' }}>
                            {item.name} 
                            <span style={{ fontSize: '12px', color: '#888', marginLeft: '10px', backgroundColor: '#f0f2f5', padding: '4px 8px', borderRadius: '10px', fontWeight: 'normal' }}>
                              {item.creador}
                            </span>
                          </span>
                        </div>

                        <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ WebkitAppearance: 'none', padding: '10px', background: '#fff0f0', color: '#ff4d4f', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            
            <div style={{ marginTop: '40px' }}>
              <h4 style={{ margin: '0 0 12px 10px', color: '#999', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>
                ❌ Frecuentes
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredItems.filter(item => item.comprado).map(item => (
                  <div key={item.id} onClick={() => toggleItem(item)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: '20px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, opacity: 0.6 }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#ff4d4f', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: '12px', flexShrink: 0 }}>❌</div>
                      <span style={{ textDecoration: 'line-through', fontSize: '18px', color: '#666', fontWeight: '500' }}>
                        {item.name}
                      </span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ WebkitAppearance: 'none', padding: '10px', background: 'transparent', color: '#ccc', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px' }}>
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- BOTONES FLOTANTES --- */}
        <button onClick={() => setIsRecetarioOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '25px', left: '25px', width: '65px', height: '65px', borderRadius: '50%', background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)', color: 'white', border: 'none', fontSize: '28px', boxShadow: '0 8px 20px rgba(255,152,0,0.4)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }} title="Abrir Recetario">📖</button>
        <button onClick={() => setIsCalendarOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '75px', height: '75px', borderRadius: '50%', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', fontSize: '32px', boxShadow: '0 8px 25px rgba(156,39,176,0.4)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }} title="Organizar Menú">📅</button>
        <button onClick={() => setIsSuggestionOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)', color: 'white', border: 'none', fontSize: '28px', boxShadow: '0 8px 20px rgba(0,123,255,0.4)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>💡</button>

        {/* --- MODAL SUGERENCIAS --- */}
        {isSuggestionOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '24px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '15px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#222' }}>Enviar sugerencia</h3>
              <textarea value={suggestionText} onChange={(e) => setSuggestionText(e.target.value)} placeholder="¿Qué echas en falta en la app?" rows={4} style={{ padding: '15px', borderRadius: '16px', border: '2px solid #eee', fontSize: '16px', resize: 'none', WebkitAppearance: 'none', backgroundColor: '#fafafa', outline: 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button onClick={() => setIsSuggestionOpen(false)} style={{ WebkitAppearance: 'none', padding: '12px 20px', borderRadius: '14px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold' }}>Cancelar</button>
                <button onClick={handleSendSuggestion} style={{ WebkitAppearance: 'none', padding: '12px 20px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #28a745 0%, #208838 100%)', color: 'white', fontWeight: 'bold' }}>Enviar</button>
              </div>
            </div>
          </div>
        )}

        {/* --- PANTALLA DEL RECETARIO --- */}
        {isRecetarioOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f8f9fa', zIndex: 1100, display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px 20px 0 20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: '#1a1a1a', fontWeight: '800' }}>📖 Recetario</h2>
                <button onClick={() => setIsRecetarioOpen(false)} style={{ background: '#f0f2f5', border: 'none', fontSize: '18px', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>❌</button>
              </div>

              <input 
                type="text" 
                placeholder="Buscar por receta o ingrediente..." 
                value={busquedaReceta}
                onChange={(e) => setBusquedaReceta(e.target.value)}
                style={{ padding: '16px', fontSize: '16px', borderRadius: '16px', border: 'none', marginBottom: '20px', width: '100%', boxSizing: 'border-box', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', outline: 'none' }}
              />
              
              <div style={{ display: 'flex', overflowX: 'auto', whiteSpace: 'nowrap', gap: '10px', paddingBottom: '15px', marginBottom: '10px', scrollbarWidth: 'none' }}>
                {categorias.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setCategoriaActiva(cat)}
                    style={{ 
                      padding: '10px 20px', 
                      borderRadius: '20px', 
                      border: 'none', 
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      backgroundColor: categoriaActiva === cat ? '#28a745' : 'white',
                      color: categoriaActiva === cat ? 'white' : '#555',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.04)'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 40px 20px' }}>
              {modoAsignacion && (
                <div style={{ backgroundColor: '#f3e5f5', padding: '15px', borderRadius: '16px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '2px solid #ce93d8' }}>
                  <span style={{ color: '#6a1b9a', fontWeight: 'bold', fontSize: '15px' }}>
                    📍 Seleccionando {modoAsignacion.tipo} para el {diasCalendario.find(d => d.id === modoAsignacion.dia)?.nombre.split(' ')[0]}
                  </span>
                  <button onClick={() => { setModoAsignacion(null); setIsRecetarioOpen(false); setIsCalendarOpen(true); }} style={{ border: 'none', background: 'white', color: '#6a1b9a', cursor: 'pointer', fontWeight: 'bold', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                    Cancelar
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {recetasFiltradas.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>No hay recetas en esta categoría.</p>
                ) : (
                  recetasFiltradas.map(receta => (
                    <div 
                      key={receta.id} 
                      onClick={() => setRecetaExpandida(recetaExpandida === receta.id ? null : receta.id)}
                      style={{ backgroundColor: 'white', borderRadius: '24px', padding: '20px', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.05)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, paddingRight: '10px' }}>
                          <h3 style={{ margin: '0 0 8px 0', fontSize: '19px', color: '#1a1a1a', fontWeight: '800', lineHeight: '1.2' }}>{receta.nombre}</h3>
                          <span style={{ fontSize: '12px', backgroundColor: '#fff3e0', color: '#e65100', padding: '5px 10px', borderRadius: '8px', fontWeight: 'bold' }}>
                            {receta.categoria}
                          </span>
                        </div>
                        
                        {modoAsignacion ? (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleAsignarRecetaDesdeCalendario(receta); }}
                            style={{ padding: '10px 16px', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 10px rgba(156,39,176,0.3)' }}
                          >
                            ✅ Elegir
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setRecetaParaCalendario(receta); }}
                              style={{ width: '42px', height: '42px', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 10px rgba(156,39,176,0.3)' }}
                              title="Añadir al Menú Semanal"
                            >
                              📅
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleAñadirReceta(receta); }}
                              style={{ width: '42px', height: '42px', background: 'linear-gradient(135deg, #28a745 0%, #208838 100%)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 10px rgba(40,167,69,0.3)' }}
                              title="Añadir al carrito"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {recetaExpandida === receta.id && (
                        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #f0f2f5', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                          <h4 style={{ margin: '0 0 12px 0', color: '#444', fontSize: '15px', fontWeight: '800' }}>🛒 Ingredientes:</h4>
                          <ul style={{ margin: '0 0 25px 0', paddingLeft: '20px', color: '#555', fontSize: '15px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {receta.ingredientes.map((ingrediente, idx) => (
                              <li key={idx}>{ingrediente.nombre}</li>
                            ))}
                          </ul>
                          <h4 style={{ margin: '0 0 12px 0', color: '#444', fontSize: '15px', fontWeight: '800' }}>👨‍🍳 Preparación:</h4>
                          <p style={{ margin: 0, color: '#555', fontSize: '15px', lineHeight: '1.7', whiteSpace: 'pre-line' }}>
                            {receta.instrucciones || "No hay instrucciones para esta receta."}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- PANTALLA DEL CALENDARIO (MENÚ SEMANAL) --- */}
        {isCalendarOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f8f9fa', zIndex: 1100, display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh' }}>
            
            <div style={{ padding: '20px 20px 0 20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: '#1a1a1a', fontWeight: '800' }}>📅 Menú Semanal</h2>
                <button onClick={() => setIsCalendarOpen(false)} style={{ background: '#f0f2f5', border: 'none', fontSize: '18px', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>❌</button>
              </div>
            </div>

            {/* CONTENEDOR DE SCROLL CORREGIDO */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 100px 20px', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {diasCalendario.map(diaObj => {
                  const datosDia = menuSemanal[diaObj.id] || { comida: null, cena: null };
                  
                  return (
                    <div key={diaObj.id} style={{ backgroundColor: 'white', borderRadius: '24px', padding: '20px', boxShadow: '0 6px 20px rgba(0,0,0,0.04)' }}>
                      <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#6a1b9a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        {diaObj.nombre}
                      </h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        
                        {/* --- COMIDA --- */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '22px', marginTop: '10px' }}>☀️</span>
                          {datosDia.comida ? (
                            <div style={{ flex: 1, border: '2px solid #f0f2f5', borderRadius: '14px', backgroundColor: 'white', overflow: 'hidden' }}>
                              <div onClick={() => setExpandidoCalendario(expandidoCalendario === `${diaObj.id}-comida` ? null : `${diaObj.id}-comida`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', backgroundColor: expandidoCalendario === `${diaObj.id}-comida` ? '#f8f9fa' : 'white' }}>
                                <span style={{ fontSize: '16px', color: '#333', fontWeight: 'bold', flex: 1, paddingRight: '10px' }}>{datosDia.comida.nombre}</span>
                                
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={(e) => { e.stopPropagation(); handleAñadirReceta(datosDia.comida!); setIsCalendarOpen(false); }} style={{ background: '#e6faec', color: '#28a745', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Añadir ingredientes al carrito">➕</button>
                                  <button onClick={(e) => { e.stopPropagation(); handleEliminarRecetaCalendario(diaObj.id, 'comida'); }} style={{ background: '#fff0f0', color: '#ff4d4f', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Quitar del menú">🗑️</button>
                                </div>
                              </div>
                              
                              {expandidoCalendario === `${diaObj.id}-comida` && (
                                <div style={{ padding: '16px', borderTop: '2px solid #f0f2f5', backgroundColor: '#fafafa' }}>
                                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#444' }}>🛒 Ingredientes:</h4>
                                  <ul style={{ margin: '0 0 15px 0', paddingLeft: '20px', color: '#555', fontSize: '14px' }}>{datosDia.comida.ingredientes.map((ing, i) => <li key={i}>{ing.nombre}</li>)}</ul>
                                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#444' }}>👨‍🍳 Preparación:</h4>
                                  <p style={{ margin: 0, fontSize: '14px', color: '#555', whiteSpace: 'pre-line', lineHeight: '1.5' }}>{datosDia.comida.instrucciones || 'Sin instrucciones.'}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button onClick={() => { setModoAsignacion({ dia: diaObj.id, tipo: 'comida' }); setIsCalendarOpen(false); setIsRecetarioOpen(true); }} style={{ flex: 1, padding: '14px 16px', borderRadius: '14px', border: '2px dashed #d1c4e9', backgroundColor: '#fdfbfb', fontSize: '16px', color: '#6a1b9a', fontWeight: 'bold', cursor: 'pointer', textAlign: 'left' }}>➕ Seleccionar comida</button>
                          )}
                        </div>
                        
                        {/* --- CENA --- */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '22px', marginTop: '10px' }}>🌙</span>
                          {datosDia.cena ? (
                            <div style={{ flex: 1, border: '2px solid #f0f2f5', borderRadius: '14px', backgroundColor: 'white', overflow: 'hidden' }}>
                              <div onClick={() => setExpandidoCalendario(expandidoCalendario === `${diaObj.id}-cena` ? null : `${diaObj.id}-cena`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', backgroundColor: expandidoCalendario === `${diaObj.id}-cena` ? '#f8f9fa' : 'white' }}>
                                <span style={{ fontSize: '16px', color: '#333', fontWeight: 'bold', flex: 1, paddingRight: '10px' }}>{datosDia.cena.nombre}</span>
                                
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={(e) => { e.stopPropagation(); handleAñadirReceta(datosDia.cena!); setIsCalendarOpen(false); }} style={{ background: '#e6faec', color: '#28a745', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Añadir ingredientes al carrito">➕</button>
                                  <button onClick={(e) => { e.stopPropagation(); handleEliminarRecetaCalendario(diaObj.id, 'cena'); }} style={{ background: '#fff0f0', color: '#ff4d4f', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Quitar del menú">🗑️</button>
                                </div>
                              </div>
                              
                              {expandidoCalendario === `${diaObj.id}-cena` && (
                                <div style={{ padding: '16px', borderTop: '2px solid #f0f2f5', backgroundColor: '#fafafa' }}>
                                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#444' }}>🛒 Ingredientes:</h4>
                                  <ul style={{ margin: '0 0 15px 0', paddingLeft: '20px', color: '#555', fontSize: '14px' }}>{datosDia.cena.ingredientes.map((ing, i) => <li key={i}>{ing.nombre}</li>)}</ul>
                                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#444' }}>👨‍🍳 Preparación:</h4>
                                  <p style={{ margin: 0, fontSize: '14px', color: '#555', whiteSpace: 'pre-line', lineHeight: '1.5' }}>{datosDia.cena.instrucciones || 'Sin instrucciones.'}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <button onClick={() => { setModoAsignacion({ dia: diaObj.id, tipo: 'cena' }); setIsCalendarOpen(false); setIsRecetarioOpen(true); }} style={{ flex: 1, padding: '14px 16px', borderRadius: '14px', border: '2px dashed #d1c4e9', backgroundColor: '#fdfbfb', fontSize: '16px', color: '#6a1b9a', fontWeight: 'bold', cursor: 'pointer', textAlign: 'left' }}>➕ Seleccionar cena</button>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* --- MODAL AÑADIR AL CALENDARIO --- */}
        {recetaParaCalendario && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
            <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '24px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, textAlign: 'center', color: '#1a1a1a', fontSize: '20px', fontWeight: '800', lineHeight: '1.3' }}>
                Asignar al menú:<br/><span style={{color: '#9c27b0'}}>"{recetaParaCalendario.nombre}"</span>
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#444', fontSize: '14px' }}>¿Qué día?</label>
                  <select value={diaSeleccionado} onChange={(e) => setDiaSeleccionado(e.target.value)} style={{ width: '100%', padding: '14px', borderRadius: '14px', border: '2px solid #eee', fontSize: '16px', outline: 'none', backgroundColor: '#f8f9fa', color: '#333', fontWeight: '600' }}>
                    {diasCalendario.map(diaObj => <option key={diaObj.id} value={diaObj.id}>{diaObj.nombre}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#444', fontSize: '14px' }}>¿Comida o Cena?</label>
                  <select value={tipoComidaSeleccionado} onChange={(e) => setTipoComidaSeleccionado(e.target.value as 'comida'|'cena')} style={{ width: '100%', padding: '14px', borderRadius: '14px', border: '2px solid #eee', fontSize: '16px', outline: 'none', backgroundColor: '#f8f9fa', color: '#333', fontWeight: '600' }}>
                    <option value="comida">☀️ Comida</option>
                    <option value="cena">🌙 Cena</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <button
                  onClick={() => setRecetaParaCalendario(null)}
                  style={{ flex: 1, WebkitAppearance: 'none', padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold', fontSize: '16px' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarAñadirAlCalendario}
                  style={{ flex: 1, WebkitAppearance: 'none', padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 10px rgba(156,39,176,0.3)' }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- MODAL SELECCIONAR SUPERMERCADO PARA RECETA --- */}
        {recetaPendiente && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, textAlign: 'center', color: '#1a1a1a', fontSize: '20px', fontWeight: '800', lineHeight: '1.3' }}>
                ¿Dónde quieres comprar para<br/>"<span style={{color: '#007bff'}}>{recetaPendiente.nombre}</span>"?
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'aldi')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #005b9f 0%, #003f75 100%)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,91,159,0.2)' }}>Aldi</button>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'mercadona')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #00824b 0%, #005c35 100%)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,130,75,0.2)' }}>Mercadona</button>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'lidl')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #ffd700 0%, #f0b400 100%)', color: '#003f75', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(255,215,0,0.2)' }}>Lidl</button>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'costco')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #e31837 0%, #a61027 100%)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(227,24,55,0.2)' }}>Costco</button>
              </div>

              <button 
                onClick={() => setRecetaPendiente(null)} 
                style={{ WebkitAppearance: 'none', padding: '15px', marginTop: '10px', borderRadius: '16px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold', fontSize: '16px' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default App