import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'

interface ShoppingItem {
  id: string; // (o number, dependiendo de cómo lo genere tu base de datos)
  name: string;
  isBought?: boolean;
}

// Conectamos con nuestro backend (puerto 3000)
const socket = io()

function App() {
  // ¡Pon aquí el ID real de tu casa!
  const [houseId] = useState('a513962b-c0c9-446f-bf70-2684f545b4dd')
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItemName, setNewItemName] = useState('')

  useEffect(() => {
    // 1. Al cargar la app, nos unimos a la "sala" de esta casa
    socket.emit('joinHouse', houseId)

    // 2. Pedimos los artículos que ya existen por API REST
    fetch(`/api/houses/${houseId}`)
      .then(res => res.json())
      .then(data => setItems(data))
      .catch(err => console.error("Error cargando items:", err))

    // 3. Escuchamos activamente si alguien añade un artículo
    socket.on('itemAdded', (newItem) => {
      // Añadimos el nuevo artículo al principio de la lista actual
      setItems((prevItems) => [newItem, ...prevItems])
    })

    // Añade esto debajo de socket.on('itemAdded', ...)
    socket.on('itemDeleted', (deletedItemId) => {
      // Filtramos la lista para quedarnos con todos MENOS el que acaban de borrar
      setItems((prevItems) => prevItems.filter(item => item.id !== deletedItemId))
    })

    // Y recuerda limpiar el evento en el return:
    return () => {
      socket.off('itemAdded')
      socket.off('itemDeleted') // <-- Añadir esta línea
    }

    // Limpieza al cerrar el componente
    return () => {
      socket.off('itemAdded')
    }
  }, [houseId])

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemName.trim()) return

    // Enviamos el artículo al backend por WebSocket
    socket.emit('addItem', {
      name: newItemName,
      houseId: houseId,
      // addedById: "TU_USER_ID" // Opcional por ahora, lo dejamos vacío
    })
    
    setNewItemName('') // Limpiamos el input
  }

  const handleDeleteItem = async (itemId: string) => {
  // Opcion A: Si borras a través de REST
  try {
    await fetch(`/api/houses/${houseId}/items/${itemId}`, {
      method: 'DELETE'
    });
    // La lista se actualizará automáticamente si tienes el socket escuchando el evento de borrado
  } catch (error) {
    console.error("Error al borrar el producto:", error);
  }

  // Opcion B: Si borras directamente emitiendo un evento por WebSockets
  // socket.emit('deleteItem', { houseId, itemId });
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
            
            {/* Botón para eliminar */}
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