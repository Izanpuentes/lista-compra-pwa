import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

interface ShoppingItem {
  id: string; 
  name: string;
  comprado: boolean;
  houseId: string;
  supermercado: string;
  categoria: string; // <-- Nuevo campo en el frontend
}

const socket = io()

// --- DEFINIMOS LA RUTA LÓGICA DEL SUPERMERCADO ---
const RUTAS_SUPERMERCADO = [
  'Verduras y frutas',
  'Carnes',
  'Pescados',
  'Desayuno',
  'Fritos/Bolsas',
  'Pan',
  'Leche',
  'Alcohol',
  'Lácteos y embutidos',
  'Precocinados',
  'Enlatados',
  'Chocolates y frutos secos',
  'Higiene',
  'Helados',
  'Otros'
];

function App() {
  const [houseId] = useState('a513962b-c0c9-446f-bf70-2684f545b4dd')
  const [items, setItems] = useState<ShoppingItem[]>([])
  
  // Estados para el nuevo producto
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategory, setNewItemCategory] = useState('Otros')
  
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false)
  const [suggestionText, setSuggestionText] = useState('')
  const [activeSupermarket, setActiveSupermarket] = useState<string | null>(null)

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

  // --- LÓGICA DE DICCIONARIO INTELIGENTE ---
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setNewItemName(text);
    
    const lower = text.toLowerCase();
    
    // Asignación automática por palabras clave
    if (lower.includes('patatas fritas') || lower.includes('bolsa de')) setNewItemCategory('Fritos/Bolsas');
    else if (lower.includes('patata') || lower.includes('tomate') || lower.includes('fruta') || lower.includes('verdura')) setNewItemCategory('Verduras y frutas');
    else if (lower.includes('pollo') || lower.includes('carne') || lower.includes('ternera') || lower.includes('cerdo')) setNewItemCategory('Carnes');
    else if (lower.includes('pescado') || lower.includes('salmon') || lower.includes('merluza')) setNewItemCategory('Pescados');
    else if (lower.includes('leche')) setNewItemCategory('Leche');
    else if (lower.includes('pan') || lower.includes('barra')) setNewItemCategory('Pan');
    else if (lower.includes('cerveza') || lower.includes('vino') || lower.includes('alcohol')) setNewItemCategory('Alcohol');
    else if (lower.includes('queso') || lower.includes('jamon') || lower.includes('yogur') || lower.includes('embutido')) setNewItemCategory('Lácteos y embutidos');
    else if (lower.includes('pizza') || lower.includes('lasaña') || lower.includes('precocinado')) setNewItemCategory('Precocinados');
    else if (lower.includes('lata') || lower.includes('atun') || lower.includes('maiz')) setNewItemCategory('Enlatados');
    else if (lower.includes('chocolate') || lower.includes('nuez') || lower.includes('almendra')) setNewItemCategory('Chocolates y frutos secos');
    else if (lower.includes('gel') || lower.includes('champu') || lower.includes('papel') || lower.includes('pasta')) setNewItemCategory('Higiene');
    else if (lower.includes('helado') || lower.includes('polo')) setNewItemCategory('Helados');
    else if (lower.includes('galleta') || lower.includes('cereal') || lower.includes('cafe')) setNewItemCategory('Desayuno');
    else setNewItemCategory('Otros');
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim() || !activeSupermarket) return

    socket.emit('addItem', {
      name: newItemName,
      houseId: houseId,
      supermercado: activeSupermarket,
      categoria: newItemCategory // Enviamos la categoría asignada
    })
    
    setNewItemName('')
    setNewItemCategory('Otros') // Reseteamos al enviar
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
    return '#ffffff';
  }

  const filteredItems = items.filter(item => item.supermercado === activeSupermarket);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: getBackgroundColor(), transition: 'background-color 0.3s ease' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
        
        {!activeSupermarket && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '50px' }}>
            <h1 style={{ textAlign: 'center' }}>¿Dónde vamos a comprar?</h1>
            <button onClick={() => setActiveSupermarket('aldi')} style={{ WebkitAppearance: 'none', padding: '20px', fontSize: '24px', backgroundColor: '#005b9f', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Aldi</button>
            <button onClick={() => setActiveSupermarket('mercadona')} style={{ WebkitAppearance: 'none', padding: '20px', fontSize: '24px', backgroundColor: '#00824b', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Mercadona</button>
            <button onClick={() => setActiveSupermarket('lidl')} style={{ WebkitAppearance: 'none', padding: '20px', fontSize: '24px', backgroundColor: '#fff000', color: '#005b9f', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Lidl</button>
          </div>
        )}

        {activeSupermarket && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
              <button onClick={() => setActiveSupermarket(null)} style={{ WebkitAppearance: 'none', padding: '8px 12px', fontSize: '20px', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: 'white', color: '#000' }}>⬅️ Atrás</button>
              <h1 style={{ margin: 0, textTransform: 'capitalize' }}>🛒 {activeSupermarket}</h1>
            </div>
            
            <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={newItemName}
                  onChange={handleNameChange} // <- Llama a la lógica inteligente
                  placeholder={`Añadir a ${activeSupermarket}...`} 
                  style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc', WebkitAppearance: 'none' }}
                />
                <button type="submit" style={{ WebkitAppearance: 'none', padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: '#e0e0e0', color: '#000', border: '1px solid #ccc', borderRadius: '8px' }}>
                  Añadir
                </button>
              </div>
              
              {/* Desplegable para corrección manual */}
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
            
            {/* --- RENDERIZADO AGRUPADO POR CATEGORÍAS --- */}
            {RUTAS_SUPERMERCADO.map(categoria => {
              const itemsDeEstaCategoria = filteredItems.filter(item => !item.comprado && item.categoria === categoria);
              
              if (itemsDeEstaCategoria.length === 0) return null; // Oculta secciones vacías

              return (
                <div key={categoria} style={{ marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', borderBottom: '2px solid rgba(0,0,0,0.1)', paddingBottom: '5px', color: '#333' }}>
                    📍 {categoria}
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {itemsDeEstaCategoria.map(item => (
                      <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                        <span onClick={() => toggleItem(item)} style={{ cursor: 'pointer', flex: 1, fontSize: '18px' }}>{item.name}</span>
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
                  <span onClick={() => toggleItem(item)} style={{ textDecoration: 'line-through', color: 'gray', opacity: 0.7, cursor: 'pointer', flex: 1, fontSize: '18px' }}>{item.name}</span>
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