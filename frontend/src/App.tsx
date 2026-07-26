import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

interface ShoppingItem {
  id: string; 
  name: string;
  isBought?: boolean;
}

// Conectamos con nuestro backend de Render
const socket = io()

function App() {
  const [houseId] = useState('a513962b-c0c9-446f-bf70-2684f545b4dd')
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItemName, setNewItemName] = useState('')

  useEffect(() => {
    // 1. Nos unimos a la "sala" de esta casa
    socket.emit('joinHouse', houseId)

    // 2. CORREGIDO: Añadido /items al final de la ruta
    fetch(`/api/houses/${houseId}/items`)
      .then(res => {
        if (!res.ok) throw new Error("Error en la respuesta del servidor")
        return res.json()
      })
      .then(data => setItems(data))
      .catch(err => console.error("Error cargando items:", err))

    // 3. Escuchamos activamente
    socket.on('itemAdded', (newItem) => {
      setItems((prevItems) => [newItem, ...prevItems])
    })

    socket.on('itemDeleted', (deletedItemId) => {
      setItems((prevItems) => prevItems.filter(item => item.id !== deletedItemId))
    })

    // 4. CORREGIDO: Un solo return para limpiar los eventos
    return () => {
      socket.off('itemAdded')
      socket.off('itemDeleted')
    }
  }, [houseId])

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim()) return

    socket.emit('addItem', {
      name: newItemName,
      houseId: houseId,
    })
    
    setNewItemName('')
  }

  const handleDeleteItem = (itemId: string) => {
    // CORREGIDO: Usamos la Opción B (WebSockets) que es la que configuraste en el backend
    socket.emit('deleteItem', { houseId, itemId });
  };

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🛒 Lista Compartida</h1>
      
      <form onSubmit={handleAddItem} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input 
          type="text" 
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Ej. Leche, Papel higiénico..." 
          style={{ flex: 1, padding: '10px', fontSize: '16px', borderRadius: '8px', border: '1px solid #ccc' }}
        />
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
          Añadir
        </button>
      </form>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ padding: '15px', background: '#f5f5f5', marginBottom: '10px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            
            <span>{item.name}</span>
            
            <button 
              onClick={() => handleDeleteItem(item.id)}
              style={{ background: '#ff4d4d', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
            >
              🗑️ Borrar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App