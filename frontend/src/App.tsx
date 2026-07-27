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

  // --- NUEVO ESTADO PARA LA VOZ ---
  const [isListening, setIsListening] = useState(false)

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    socket.emit('joinHouse', houseId)

    fetch(`/api/houses/${houseId}/items`)
      .then(res => {
        if (!res.ok) throw new Error("Error en la respuesta del servidor")
        return res.json()
      })
      .then(data => setItems(data))
      .catch(err => console.error("Error cargando items:", err))

    socket.on('itemAdded', (newItem) => setItems((prev) => [newItem, ...prev]))
    socket.on('item-toggled', (updatedItem) => setItems((prev) => prev.map(item => item.id === updatedItem.id ? updatedItem : item)))
    socket.on('itemDeleted', (deletedItemId) => setItems((prev) => prev.filter(item => item.id !== deletedItemId)))
    
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
  // --- LÓGICA DEL RECONOCIMIENTO DE VOZ CONTINUO E INTELIGENTE ---
  const toggleListening = () => {
    // Si ya está escuchando, lo apagamos manualmente
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    // Si no está escuchando, lo encendemos
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Lo siento, tu navegador no soporta el dictado por voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition; // Lo guardamos en la referencia
    recognition.lang = 'es-ES';
    
    recognition.continuous = true; // <-- AHORA ESCUCHA DE FORMA CONTINUA
    recognition.interimResults = false; // Solo procesa cuando terminas la frase

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      // Como es continuo, cogemos la última frase que ha escuchado
      const lastIndex = event.results.length - 1;
      // Forzamos a que lo lea como string
      const transcript: string = String(event.results[lastIndex][0].transcript).trim().replace(/\.$/, '');
      
      if (!transcript) return;

      // TRUCO PRO: Añadimos el tipado (p: string) para que TypeScript no se queje
      const productosDichos = transcript
        .split(/\s+y\s+|,/i) 
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      // Enviamos cada producto a la base de datos automáticamente
      productosDichos.forEach((productoStr: string) => {
        const categoriaDetectada = categorizarProducto(productoStr);
        
        socket.emit('addItem', {
          name: productoStr,
          houseId: houseId,
          supermercado: activeSupermarket,
          categoria: categoriaDetectada,
          creador: currentUser 
        });
      });
    };

    recognition.onerror = (event: any) => {
      console.error("Error en voz:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      // Si el móvil apaga el micro por seguridad, actualizamos el botón
      setIsListening(false);
    };

    recognition.start();
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setNewItemName(text);
    const categoriaDetectada = categorizarProducto(text);
    setNewItemCategory(categoriaDetectada);
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim() || !activeSupermarket || !currentUser) return

    socket.emit('addItem', {
      name: newItemName,
      houseId: houseId,
      supermercado: activeSupermarket,
      categoria: newItemCategory,
      creador: currentUser 
    })
    
    setNewItemName('')
    setNewItemCategory('Otros')
  }

  const toggleItem = (item: ShoppingItem) => socket.emit('toggle-item', { itemId: item.id, houseId: houseId, comprado: !item.comprado });
  const handleDeleteItem = (itemId: string) => socket.emit('deleteItem', { houseId, itemId });
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
              onClick={() => {
                localStorage.setItem('listaCompraUser', nombre); 
                setCurrentUser(nombre); 
              }}
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={handleNameChange}
                  placeholder={`Añadir a ${activeSupermarket}...`} 
                  style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc', WebkitAppearance: 'none' }}
                />
                
                {/* --- BOTÓN DE MICRÓFONO --- */}
                {/* --- BOTÓN DE MICRÓFONO --- */}
                <button 
                  type="button" 
                  onClick={toggleListening} // <-- AHORA LLAMA A LA NUEVA FUNCIÓN
                  style={{ 
                    WebkitAppearance: 'none', 
                    padding: '10px 15px', 
                    fontSize: '20px', 
                    cursor: 'pointer', 
                    backgroundColor: isListening ? '#ff4d4f' : '#e0e0e0',
                    color: isListening ? 'white' : 'black', 
                    border: '1px solid #ccc', 
                    borderRadius: '8px',
                    transition: 'all 0.3s ease'
                  }}
                  title="Dictar por voz"
                >
                  {isListening ? '🔴' : '🎙️'}
                </button>

                <button type="submit" style={{ WebkitAppearance: 'none', padding: '10px 15px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '8px' }}>
                  Añadir
                </button>
              </div>
              
              <select 
                value={newItemCategory} 
                onChange={(e) => setNewItemCategory(e.target.value)}
                style={{ padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc', WebkitAppearance: 'none', backgroundColor: '#fff', color: '#000' }}
              >
                {RUTAS_SUPERMERCADO.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </form>

            <h3>🛒 Carro Lista de la Compra</h3>
            
            {RUTAS_SUPERMERCADO.map(categoria => {
              const itemsDeEstaCategoria = filteredItems.filter(item => !item.comprado && item.categoria === categoria);
              if (itemsDeEstaCategoria.length === 0) return null; 

              return (
                <div key={categoria} style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', borderBottom: '2px solid rgba(0,0,0,0.1)', paddingBottom: '5px', color: '#333' }}>
                    📍 {categoria}
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {itemsDeEstaCategoria.map(item => (
                      <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                        <span onClick={() => toggleItem(item)} style={{ cursor: 'pointer', flex: 1, fontSize: '18px' }}>
                          {item.name} <span style={{ fontSize: '12px', color: '#888', marginLeft: '6px' }}>({item.creador})</span>
                        </span>
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
                  <span onClick={() => toggleItem(item)} style={{ textDecoration: 'line-through', color: 'gray', opacity: 0.7, cursor: 'pointer', flex: 1, fontSize: '18px' }}>
                    {item.name} <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '6px' }}>({item.creador})</span>
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ WebkitAppearance: 'none', padding: '8px 12px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
                </li>
              ))}
            </ul>
          </>
        )}

        <button onClick={() => setIsSuggestionOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '20px', right: '20px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', border: 'none', fontSize: '24px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>💡</button>

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

      </div>
    </div>
  )
}

export default App