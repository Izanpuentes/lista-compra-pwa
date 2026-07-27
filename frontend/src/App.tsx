import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

interface ShoppingItem {
  id: string; 
  name: string;
  comprado: boolean;
  houseId: string;
  supermercado: string; // <-- Añadido al frontend
}

const socket = io()

function App() {
  const [houseId] = useState('a513962b-c0c9-446f-bf70-2684f545b4dd')
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItemName, setNewItemName] = useState('')
  
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false)
  const [suggestionText, setSuggestionText] = useState('')

  // --- ESTADO PARA EL SUPERMERCADO ---
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

    socket.on('itemAdded', (newItem) => {
      setItems((prevItems) => [newItem, ...prevItems])
    })

    socket.on('item-toggled', (updatedItem) => {
      setItems((prevItems) => 
        prevItems.map(item => item.id === updatedItem.id ? updatedItem : item)
      );
    });

    socket.on('itemDeleted', (deletedItemId) => {
      setItems((prevItems) => prevItems.filter(item => item.id !== deletedItemId))
    })

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

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim() || !activeSupermarket) return

    socket.emit('addItem', {
      name: newItemName,
      houseId: houseId,
      supermercado: activeSupermarket // Enviamos el supermercado al backend
    })
    
    setNewItemName('')
  }

  const toggleItem = (item: ShoppingItem) => {
    socket.emit('toggle-item', { 
      itemId: item.id, 
      houseId: houseId, 
      comprado: !item.comprado 
    });
  };

  const handleDeleteItem = (itemId: string) => {
    socket.emit('deleteItem', { houseId, itemId });
  };

  const handleSendSuggestion = () => {
    if (!suggestionText.trim()) return;
    socket.emit('sendSuggestion', { text: suggestionText, houseId });
  }

  // --- LÓGICA DE COLORES DE FONDO ---
  const getBackgroundColor = () => {
    if (activeSupermarket === 'aldi') return '#e0f0ff'; // Azul muy clarito
    if (activeSupermarket === 'mercadona') return '#e6faec'; // Verde muy clarito
    if (activeSupermarket === 'lidl') return '#fffde6'; // Amarillo muy clarito
    return '#ffffff'; // Blanco por defecto
  }

  // Filtramos los items para mostrar SOLO los del supermercado seleccionado
  const filteredItems = items.filter(item => item.supermercado === activeSupermarket);

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: getBackgroundColor(), 
      transition: 'background-color 0.3s ease' 
    }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
        
        {/* --- PANTALLA INICIAL: SELECCIÓN DE SUPERMERCADO --- */}
        {!activeSupermarket && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '50px' }}>
            <h1 style={{ textAlign: 'center' }}>¿Dónde vamos a comprar?</h1>
            
            <button 
              onClick={() => setActiveSupermarket('aldi')}
              style={{ padding: '20px', fontSize: '24px', backgroundColor: '#005b9f', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Aldi
            </button>
            
            <button 
              onClick={() => setActiveSupermarket('mercadona')}
              style={{ padding: '20px', fontSize: '24px', backgroundColor: '#00824b', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Mercadona
            </button>
            
            <button 
              onClick={() => setActiveSupermarket('lidl')}
              style={{ padding: '20px', fontSize: '24px', backgroundColor: '#fff000', color: '#005b9f', border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Lidl
            </button>
          </div>
        )}

        {/* --- PANTALLA DE LISTA (Solo se ve si hay un supermercado activo) --- */}
        {activeSupermarket && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
              <button 
                onClick={() => setActiveSupermarket(null)}
                style={{ padding: '8px 12px', fontSize: '20px', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: 'white' }}
              >
                ⬅️ Atrás
              </button>
              <h1 style={{ margin: 0, textTransform: 'capitalize' }}>🛒 {activeSupermarket}</h1>
            </div>
            
            <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input 
                type="text" 
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={`Añadir a ${activeSupermarket}...`} 
                style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
              />
              <button type="submit" style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
                Añadir
              </button>
            </form>

            <h3>🛒 Carro Lista de la Compra</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {filteredItems.filter(item => !item.comprado).map(item => (
                <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                  <span onClick={() => toggleItem(item)} style={{ cursor: 'pointer', flex: 1, fontSize: '18px' }}>
                    {item.name}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} 
                    style={{ padding: '8px 12px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>

            <hr style={{ borderColor: '#ddd' }}/>

            <h3>❌ Frecuentes</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {filteredItems.filter(item => item.comprado).map(item => (
                <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ddd' }}>
                  <span 
                    onClick={() => toggleItem(item)} 
                    style={{ textDecoration: 'line-through', color: 'gray', opacity: 0.7, cursor: 'pointer', flex: 1, fontSize: '18px' }}
                  >
                    {item.name}
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} 
                    style={{ padding: '8px 12px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* --- BOTÓN Y MODAL DE SUGERENCIAS (Siempre visibles) --- */}
        <button 
          onClick={() => setIsSuggestionOpen(true)}
          style={{ position: 'fixed', bottom: '20px', right: '20px', width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', border: 'none', fontSize: '24px', boxShadow: '0 4px 8px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
          💡
        </button>

        {isSuggestionOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 style={{ margin: 0 }}>Enviar sugerencia</h3>
              <textarea 
                value={suggestionText}
                onChange={(e) => setSuggestionText(e.target.value)}
                placeholder="¿Qué echas en falta en la app?"
                rows={4}
                style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '16px', resize: 'none' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button onClick={() => setIsSuggestionOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f0f0' }}>Cancelar</button>
                <button onClick={handleSendSuggestion} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', backgroundColor: '#28a745', color: 'white' }}>Enviar</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default App