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
  instrucciones: string; // Añadido
  ingredientes: Ingrediente[];
  // Quitamos 'tiempo' porque lo borramos de la base de datos
}

const socket = io()

const RUTAS_SUPERMERCADO = [
  'Verduras y frutas', 'Carnes', 'Pescados', 'Desayuno', 'Fritos/Bolsas', 
  'Pan', 'Leche', 'Alcohol', 'Lácteos y embutidos', 'Precocinados', 
  'Enlatados', 'Chocolates y frutos secos', 'Higiene', 'Helados', 'Otros'
];

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
  
  // NUEVOS ESTADOS Y LÓGICA (Arreglado)
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [recetaExpandida, setRecetaExpandida] = useState<string | null>(null);

  const [recetaPendiente, setRecetaPendiente] = useState<Receta | null>(null);

  const categorias = ['Todas', 'Legumbres', 'Carnes', 'Pescados', 'Pastas', 'Huevos', 'Sopas y Cremas', 'Verduras', 'Ensaladas', 'Arroces', 'Tapas'];

  // Filtramos usando la variable correcta (recetasBaseDatos)
  const recetasFiltradas = categoriaActiva === 'Todas' 
    ? recetasBaseDatos 
    : recetasBaseDatos.filter(receta => receta.categoria === categoriaActiva);

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

    socket.on('suggestionSent', () => {
      alert("¡Sugerencia enviada correctamente!")
      setIsSuggestionOpen(false)
      setSuggestionText('')
    })

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

  // Función 1: Comprueba si hay supermercado activo
  const handleAñadirReceta = (receta: Receta) => {
    if (!activeSupermarket) {
      // Si no hay supermercado, guardamos la receta y abrimos el modal
      setRecetaPendiente(receta);
      return;
    }
    // Si ya estamos dentro de uno, lo añadimos directamente
    procesarAñadirReceta(receta, activeSupermarket);
  };

  // Función 2: Hace el trabajo real de guardar los ingredientes
  const procesarAñadirReceta = (receta: Receta, supermercadoDestino: string) => {
    receta.ingredientes.forEach(ingrediente => {
      const categoriaDetectada = categorizarProducto(ingrediente.nombre);
      const nuevoItemData = {
        name: ingrediente.nombre,
        houseId: houseId,
        supermercado: supermercadoDestino, // Usamos el destino elegido
        categoria: categoriaDetectada,
        creador: currentUser
      };

      emitirOSincronizar('addItem', nuevoItemData);
      
      const itemOffline: ShoppingItem = {
        id: 'recipe-item-' + Date.now() + Math.random(),
        name: ingrediente.nombre,
        comprado: false,
        houseId: houseId,
        supermercado: supermercadoDestino,
        categoria: categoriaDetectada,
        creador: currentUser!
      };
      setItems(prev => [itemOffline, ...prev]);
    });

    alert(`✅ ¡Ingredientes añadidos a la lista de ${supermercadoDestino}!`);
    setRecetaPendiente(null); // Cerramos el modal de elección
    setIsRecetarioOpen(false); // Cerramos el recetario para seguir comprando
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
    socket.emit('sendSuggestion', { text: suggestionText, houseId });
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: getBackgroundColor(), transition: 'background-color 0.3s ease' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
        
        {/* --- PANTALLA PRINCIPAL (Supermercados o Lista) --- */}
        {!activeSupermarket && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '50px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{ textAlign: 'center', margin: 0 }}>¿Dónde vamos a comprar?</h1>
              <div style={{ fontSize: '14px', color: '#666', cursor: 'pointer' }} onClick={() => { localStorage.removeItem('listaCompraUser'); setCurrentUser(null); }}>
                👤 {currentUser} (Cambiar)
              </div>
            </div>
            <button onClick={() => setActiveSupermarket('aldi')} style={{ WebkitAppearance: 'none', padding: '20px', fontSize: '24px', backgroundColor: '#005b9f', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Aldi</button>
            <button onClick={() => setActiveSupermarket('mercadona')} style={{ WebkitAppearance: 'none', padding: '20px', fontSize: '24px', backgroundColor: '#00824b', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Mercadona</button>
            <button onClick={() => setActiveSupermarket('lidl')} style={{ WebkitAppearance: 'none', padding: '20px', fontSize: '24px', backgroundColor: '#fff000', color: '#005b9f', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Lidl</button>
            <button onClick={() => setActiveSupermarket('costco')} style={{ WebkitAppearance: 'none', padding: '20px', fontSize: '24px', backgroundColor: '#e31837', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Costco</button>
          </div>
        )}

        {activeSupermarket && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
              <button onClick={() => setActiveSupermarket(null)} style={{ WebkitAppearance: 'none', padding: '8px 12px', fontSize: '20px', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: 'white', color: '#000' }}>⬅️ Atrás</button>
              <h1 style={{ margin: 0, textTransform: 'capitalize' }}>🛒 {activeSupermarket}</h1>
            </div>
            
            <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={handleNameChange}
                  placeholder={`Añadir a ${activeSupermarket}...`} 
                  style={{ flex: 1, padding: '12px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc', WebkitAppearance: 'none', minWidth: 0 }}
                />
                <button 
                  type="button" 
                  onClick={toggleListening} 
                  style={{ WebkitAppearance: 'none', padding: '12px 15px', fontSize: '20px', cursor: 'pointer', backgroundColor: isListening ? '#ff4d4f' : '#e0e0e0', color: isListening ? 'white' : 'black', border: '1px solid #ccc', borderRadius: '8px', flexShrink: 0, transition: 'all 0.3s ease' }}
                >
                  {isListening ? '🔴' : '🎙️'}
                </button>
              </div>
              <button type="submit" style={{ WebkitAppearance: 'none', padding: '12px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', width: '100%' }}>➕ Añadir a la lista</button>
              <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} style={{ padding: '12px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc', WebkitAppearance: 'none', backgroundColor: '#fff', color: '#000', width: '100%' }}>
                {RUTAS_SUPERMERCADO.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </form>

            <h3>🛒 Carro Lista de la Compra</h3>
            {RUTAS_SUPERMERCADO.map(categoria => {
              const itemsDeEstaCategoria = filteredItems.filter(item => !item.comprado && item.categoria === categoria);
              if (itemsDeEstaCategoria.length === 0) return null; 
              return (
                <div key={categoria} style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', borderBottom: '2px solid rgba(0,0,0,0.1)', paddingBottom: '5px', color: '#333' }}>📍 {categoria}</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {itemsDeEstaCategoria.map(item => (
                      <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                        <span onClick={() => toggleItem(item)} style={{ cursor: 'pointer', flex: 1, fontSize: '18px' }}>{item.name} <span style={{ fontSize: '12px', color: '#888', marginLeft: '6px' }}>({item.creador})</span></span>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ WebkitAppearance: 'none', padding: '8px 12px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
            <hr style={{ borderColor: '#ddd', margin: '30px 0' }}/>
            <h3>❌ Frecuentes</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {filteredItems.filter(item => item.comprado).map(item => (
                <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                  <span onClick={() => toggleItem(item)} style={{ textDecoration: 'line-through', color: 'gray', opacity: 0.7, cursor: 'pointer', flex: 1, fontSize: '18px' }}>{item.name} <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '6px' }}>({item.creador})</span></span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ WebkitAppearance: 'none', padding: '8px 12px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* --- BOTONES FLOTANTES --- */}
        <button onClick={() => setIsRecetarioOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '20px', left: '20px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#ff9800', color: 'white', border: 'none', fontSize: '24px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }} title="Abrir Recetario">📖</button>
        <button onClick={() => setIsSuggestionOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '20px', right: '20px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', border: 'none', fontSize: '24px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>💡</button>

        {/* --- MODAL SUGERENCIAS --- */}
        {isSuggestionOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 style={{ margin: 0 }}>Enviar sugerencia</h3>
              <textarea value={suggestionText} onChange={(e) => setSuggestionText(e.target.value)} placeholder="¿Qué echas en falta en la app?" rows={4} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', resize: 'none', WebkitAppearance: 'none' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setIsSuggestionOpen(false)} style={{ WebkitAppearance: 'none', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0', color: '#000' }}>Cancelar</button>
                <button onClick={handleSendSuggestion} style={{ WebkitAppearance: 'none', padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#28a745', color: 'white' }}>Enviar</button>
              </div>
            </div>
          </div>
        )}

        {/* --- PANTALLA DEL RECETARIO (Acordeón e Interfaz Nueva) --- */}
        {isRecetarioOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'white', zIndex: 1100, display: 'flex', flexDirection: 'column', padding: '20px', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>📖 Recetario</h2>
              <button onClick={() => setIsRecetarioOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>❌</button>
            </div>

            {/* Categorías con Scroll Horizontal (Sin cortes) */}
            <div style={{ display: 'flex', overflowX: 'auto', whiteSpace: 'nowrap', gap: '12px', paddingBottom: '15px', marginBottom: '15px', WebkitOverflowScrolling: 'touch' }}>
              {categorias.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setCategoriaActiva(cat)}
                  style={{ 
                    padding: '8px 20px', 
                    borderRadius: '25px', 
                    border: 'none', 
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                    backgroundColor: categoriaActiva === cat ? '#ff9800' : '#f0f0f0',
                    color: categoriaActiva === cat ? 'white' : '#333'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Lista de Recetas (Acordeón) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingBottom: '40px' }}>
              {recetasFiltradas.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>No hay recetas en esta categoría.</p>
              ) : (
                recetasFiltradas.map(receta => (
                  <div 
                    key={receta.id} 
                    onClick={() => setRecetaExpandida(recetaExpandida === receta.id ? null : receta.id)}
                    style={{ border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px', backgroundColor: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                  >
                    {/* Cabecera de la receta (Siempre visible) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#333' }}>{receta.nombre}</h3>
                        <span style={{ fontSize: '12px', backgroundColor: '#fff3e0', color: '#e65100', padding: '4px 8px', borderRadius: '4px' }}>
                          {receta.categoria}
                        </span>
                      </div>
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); // Evita que al dar al botón '+' se abra/cierre la receta
                          handleAñadirReceta(receta);
                        }}
                        style={{ width: '40px', height: '40px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '50%', fontSize: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="Añadir a la lista"
                      >
                        +
                      </button>
                    </div>
                    
                    {/* Interior Desplegable (Instrucciones e Ingredientes) */}
                    {recetaExpandida === receta.id && (
                      <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #eee', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                        
                        <h4 style={{ margin: '0 0 10px 0', color: '#444' }}>🛒 Ingredientes:</h4>
                        <ul style={{ margin: '0 0 20px 0', paddingLeft: '20px', color: '#666', fontSize: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                          {receta.ingredientes.map((ingrediente, idx) => (
                            <li key={idx}>{ingrediente.nombre}</li>
                          ))}
                        </ul>

                        <h4 style={{ margin: '0 0 10px 0', color: '#444' }}>👨‍🍳 Preparación:</h4>
                        <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                          {receta.instrucciones || "No hay instrucciones para esta receta."}
                        </p>
                        
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            
          </div>
        )}

        {/* --- MODAL SELECCIONAR SUPERMERCADO PARA RECETA --- */}
        {recetaPendiente && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, textAlign: 'center', color: '#333', fontSize: '18px' }}>
                ¿Dónde quieres comprar los ingredientes para "{recetaPendiente.nombre}"?
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'aldi')} style={{ WebkitAppearance: 'none', padding: '15px', fontSize: '18px', backgroundColor: '#005b9f', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Aldi</button>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'mercadona')} style={{ WebkitAppearance: 'none', padding: '15px', fontSize: '18px', backgroundColor: '#00824b', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Mercadona</button>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'lidl')} style={{ WebkitAppearance: 'none', padding: '15px', fontSize: '18px', backgroundColor: '#fff000', color: '#005b9f', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Lidl</button>
                <button onClick={() => procesarAñadirReceta(recetaPendiente, 'costco')} style={{ WebkitAppearance: 'none', padding: '15px', fontSize: '18px', backgroundColor: '#e31837', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Costco</button>
              </div>

              <button 
                onClick={() => setRecetaPendiente(null)} 
                style={{ WebkitAppearance: 'none', padding: '12px', marginTop: '5px', borderRadius: '10px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0', color: '#555', fontWeight: 'bold', fontSize: '16px' }}
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