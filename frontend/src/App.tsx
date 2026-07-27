import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

interface ShoppingItem {
  id: string; 
  name: string;
  comprado: boolean; // Corregido de isBought a comprado
  houseId: string;
}

// Conectamos con nuestro backend de Render
const socket = io()

function App() {
  const [houseId] = useState('a513962b-c0c9-446f-bf70-2684f545b4dd')
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItemName, setNewItemName] = useState('')

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

    return () => {
      socket.off('itemAdded')
      socket.off('item-toggled') // Es buena práctica limpiar también este evento
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

  // Añadimos el tipo ShoppingItem para evitar errores de TypeScript
  const toggleItem = (item: ShoppingItem) => {
    socket.emit('toggle-item', { 
      itemId: item.id, 
      houseId: houseId, // Usamos la variable de estado houseId
      comprado: !item.comprado 
    });
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

      {/* LISTA DE PENDIENTES */}
      <h3>🛒 Para comprar</h3>
      <ul>
        {items.filter(item => !item.comprado).map(item => (
          <li key={item.id} onClick={() => toggleItem(item)} style={{ cursor: 'pointer' }}>
            {item.name} {/* Corregido: antes era item.nombre */}
          </li>
        ))}
      </ul>

      <hr />

      {/* LISTA DE FRECUENTES / COMPRADOS */}
      <h3>✅ Comprados / Frecuentes</h3>
      <ul>
        {items.filter(item => item.comprado).map(item => (
          <li 
            key={item.id} 
            onClick={() => toggleItem(item)} 
            style={{ textDecoration: 'line-through', color: 'gray', opacity: 0.7, cursor: 'pointer' }}
          >
            {item.name} {/* Corregido: antes era item.nombre */}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App