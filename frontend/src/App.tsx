import { useState, useEffect, useRef } from 'react'
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

interface House {
  id: string;
  name: string;
  inviteCode: string;
}

interface HouseMember {
  id: string;
  name: string;
  email: string;
}

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

const socket = io({ autoConnect: false })

const RUTAS_SUPERMERCADO = [
  'Verduras y frutas', 'Carnes', 'Pescados', 'Desayuno', 'Fritos/Bolsas', 
  'Pan', 'Leche', 'Alcohol', 'Lácteos y embutidos', 'Precocinados', 
  'Enlatados', 'Chocolates y frutos secos', 'Higiene', 'Helados', 'Otros'
];

const ORDEN_MERCADONA = [
  'Verduras y frutas', 'Precocinados', 'Enlatados', 'Pescados', 'Carnes', 
  'Helados', 'Fritos/Bolsas', 'Lácteos y embutidos', 'Leche', 'Alcohol', 
  'Desayuno', 'Pan', 'Chocolates y frutos secos', 'Higiene', 'Otros'
];

const obtenerProximos7Dias = () => {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + i);
    const idFormato = fecha.toISOString().split('T')[0]; 
    let nombreFormato = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric' }).format(fecha);
    nombreFormato = nombreFormato.charAt(0).toUpperCase() + nombreFormato.slice(1);
    if (i === 0) nombreFormato += ' (Hoy)';
    if (i === 1) nombreFormato += ' (Mañana)';
    dias.push({ id: idFormato, nombre: nombreFormato });
  }
  return dias;
};

function App() {
  
  const [currentUser, setCurrentUser] = useState<string | null>(localStorage.getItem('listaCompraUser'));
  const [houseId, setHouseId] = useState<string | null>(localStorage.getItem('houseId'));
  const [userHouses, setUserHouses] = useState<House[]>(() => {
    const saved = localStorage.getItem('userHouses');
    return saved ? JSON.parse(saved) : [];
  });

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authInviteCode, setAuthInviteCode] = useState('');
  const [authError, setAuthError] = useState('');
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    if (invite) {
      setAuthInviteCode(invite);
      setIsLoginMode(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    try {
      const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
      const payload = isLoginMode 
        ? { email: authEmail, password: authPassword }
        : { 
            nombre: authName,
            email: authEmail, 
            password: authPassword, 
            accion: authInviteCode.trim() !== '' ? 'unirse' : 'crear',
            codigoInvitacion: authInviteCode,
            nombreVivienda: `Casa de ${authName}`
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en la autenticación');

      const casasUsuario = data.usuario.casas || [];
      const primeraCasa = casasUsuario.length > 0 ? casasUsuario[0].id : null;

      localStorage.setItem('token', data.token);
      localStorage.setItem('listaCompraUser', data.usuario.nombre);
      localStorage.setItem('userHouses', JSON.stringify(casasUsuario));
      localStorage.setItem('userId', data.usuario.id);
      if (primeraCasa) localStorage.setItem('houseId', primeraCasa);

      setCurrentUser(data.usuario.nombre);
      setCurrentUserId(null);
      setUserHouses(casasUsuario);
      setHouseId(primeraCasa);

    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [platoManual, setPlatoManual] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Otros');
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [activeSupermarket, setActiveSupermarket] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(localStorage.getItem('userId'));
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [houseMembers, setHouseMembers] = useState<HouseMember[]>([]);
  const [houseAdminId, setHouseAdminId] = useState<string | null>(null);

  const [isAddHouseModalOpen, setIsAddHouseModalOpen] = useState(false);
  const [addHouseMode, setAddHouseMode] = useState<'crear' | 'unirse'>('crear');
  const [newHouseInput, setNewHouseInput] = useState('');

  const [isRecetarioOpen, setIsRecetarioOpen] = useState(false);
  const [recetasBaseDatos, setRecetasBaseDatos] = useState<Receta[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState('Todas');
  const [recetaExpandida, setRecetaExpandida] = useState<string | null>(null);
  const [busquedaReceta, setBusquedaReceta] = useState(''); 

  const [recetasSeleccionadas, setRecetasSeleccionadas] = useState<Receta[]>([]);
  const [isSupermarketModalOpen, setIsSupermarketModalOpen] = useState(false);

  const categorias = ['Todas', 'Legumbres', 'Carnes', 'Pescados', 'Pastas', 'Huevos', 'Sopas y Cremas', 'Verduras', 'Ensaladas', 'Arroces', 'Tapas', 'Postres'];
  
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [expandidoCalendario, setExpandidoCalendario] = useState<string | null>(null);
  const diasCalendario = obtenerProximos7Dias();

  const normalizarMenu = (menuViejo: any) => {
    const menuNuevo: any = {};
    if (!menuViejo) return menuNuevo;
    for (const dia in menuViejo) {
      menuNuevo[dia] = {
        comida: Array.isArray(menuViejo[dia]?.comida) ? menuViejo[dia].comida : (menuViejo[dia]?.comida ? [menuViejo[dia].comida] : []),
        cena: Array.isArray(menuViejo[dia]?.cena) ? menuViejo[dia].cena : (menuViejo[dia]?.cena ? [menuViejo[dia].cena] : [])
      };
    }
    return menuNuevo;
  };

  const [menuSemanal, setMenuSemanal] = useState<Record<string, {comida: Receta[], cena: Receta[]}>>(() => {
    const guardado = localStorage.getItem('menuSemanalAppV3') || localStorage.getItem('menuSemanalAppV2');
    return guardado ? normalizarMenu(JSON.parse(guardado)) : {};
  });

  const sincronizarMenu = (nuevoMenu: any) => {
    setMenuSemanal(nuevoMenu);
    localStorage.setItem('menuSemanalAppV3', JSON.stringify(nuevoMenu));
    socket.emit('updateMenu', { houseId, menu: nuevoMenu }); 
  };

  const [isHistorialOpen, setIsHistorialOpen] = useState(false);
  const [semanaExpandidaHistorial, setSemanaExpandidaHistorial] = useState<string | null>(null);

  const semanasHistorial = (() => {
    const semanas: Record<string, { lunes: string, etiqueta: string, dias: Record<number, {comida: Receta[], cena: Receta[]}> }> = {};
    Object.entries(menuSemanal).forEach(([fechaStr, datos]) => {
      if ((!datos.comida || datos.comida.length === 0) && (!datos.cena || datos.cena.length === 0)) return;
      const [y, m, d] = fechaStr.split('-').map(Number);
      if (!y || !m || !d) return;
      const dateObj = new Date(y, m - 1, d);
      const dayOfWeek = dateObj.getDay();
      const diff = dateObj.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(y, m - 1, diff);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const mondayStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;

      if (!semanas[mondayStr]) {
        const opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
        semanas[mondayStr] = {
          lunes: mondayStr,
          etiqueta: `Semana del ${monday.toLocaleDateString('es-ES', opciones)}`,
          dias: {}
        };
      }
      semanas[mondayStr].dias[dayOfWeek] = datos;
    });
    return Object.values(semanas).sort((a, b) => b.lunes.localeCompare(a.lunes));
  })();

  const copiarHistorialAActual = (semanaHistorial: any) => {
    if (!window.confirm(`¿Seguro que quieres copiar la ${semanaHistorial.etiqueta}? Esto reemplazará las comidas que ya tengas asignadas en los próximos 7 días.`)) return;
    const nuevoMenu = { ...menuSemanal };
    diasCalendario.forEach(diaActual => {
      const [y, m, d] = diaActual.id.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayOfWeek = dateObj.getDay();
      if (semanaHistorial.dias[dayOfWeek]) {
        nuevoMenu[diaActual.id] = semanaHistorial.dias[dayOfWeek];
      } else {
        nuevoMenu[diaActual.id] = { comida: [], cena: [] }; 
      }
    });
    sincronizarMenu(nuevoMenu);
    alert("✅ ¡Menú de la semana copiado con éxito!");
    setIsHistorialOpen(false);
    setIsCalendarOpen(true);
  };

  const handleEliminarRecetaCalendario = (dia: string, tipo: 'comida'|'cena', recetaId: string) => {
    const diaData = menuSemanal[dia] || { comida: [], cena: [] };
    const nuevoMenu = {
      ...menuSemanal,
      [dia]: { 
        ...diaData, 
        [tipo]: (diaData[tipo] || []).filter(r => r.id !== recetaId) 
      }
    };
    sincronizarMenu(nuevoMenu);
  };

  const [recetaParaCalendario, setRecetaParaCalendario] = useState<Receta | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState(diasCalendario[0].id);
  const [tipoComidaSeleccionado, setTipoComidaSeleccionado] = useState<'comida' | 'cena'>('comida');

  const handleAñadirPlatoManual = () => {
    if (!platoManual.trim()) return;
    const nuevaRecetaManual: Receta = {
      id: `manual-${Date.now()}`,
      nombre: platoManual.trim(),
      categoria: 'Plato rápido',
      instrucciones: '',
      ingredientes: []
    };
    setRecetaParaCalendario(nuevaRecetaManual);
    setPlatoManual('');
  };

  const confirmarAñadirAlCalendario = () => {
    if (!recetaParaCalendario) return;
    const diaData = menuSemanal[diaSeleccionado] || { comida: [], cena: [] };
    const nuevoMenu = {
      ...menuSemanal,
      [diaSeleccionado]: { 
        ...diaData, 
        [tipoComidaSeleccionado]: [...(diaData[tipoComidaSeleccionado] || []), recetaParaCalendario] 
      }
    };
    sincronizarMenu(nuevoMenu);
    setRecetaParaCalendario(null);
    setIsRecetarioOpen(false);
    setIsCalendarOpen(true);
  };

  const recetasFiltradas = recetasBaseDatos.filter(receta => {
    const coincideCategoria = categoriaActiva === 'Todas' || receta.categoria === categoriaActiva;
    const termino = busquedaReceta.toLowerCase();
    const coincideBusqueda = receta.nombre.toLowerCase().includes(termino) || 
                             receta.ingredientes.some(i => i.nombre.toLowerCase().includes(termino));
    return coincideCategoria && coincideBusqueda;
  });
  
  useEffect(() => {
    if (!houseId) return;

    fetch(`/api/houses/${houseId}/items`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setItems(data);
          localStorage.setItem('backupItems', JSON.stringify(data)); 
        }
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

    socket.auth = { token: localStorage.getItem('token') };
    socket.connect();
    socket.emit('joinHouse', houseId);

    socket.on('connect', () => {
      const colaOffline = JSON.parse(localStorage.getItem('colaSincronizacion') || '[]');
      if (colaOffline.length > 0) {
        colaOffline.forEach((accion: any) => socket.emit(accion.evento, accion.data));
        localStorage.removeItem('colaSincronizacion');
      }
    });

    socket.on('itemAdded', (newItem) => setItems((prev) => [newItem, ...prev]))
    socket.on('item-toggled', (updatedItem) => setItems((prev) => prev.map(item => item.id === updatedItem.id ? updatedItem : item)))
    socket.on('itemDeleted', (deletedItemId) => setItems((prev) => prev.filter(item => item.id !== deletedItemId)))
    socket.on('appUpdated', () => setUpdateAvailable(true));
    socket.on('menuUpdated', (nuevoMenu) => {
      const menuCorregido = normalizarMenu(nuevoMenu);
      setMenuSemanal(menuCorregido);
      localStorage.setItem('menuSemanalAppV3', JSON.stringify(menuCorregido));
    });

    return () => {
      socket.off('itemAdded')
      socket.off('item-toggled') 
      socket.off('itemDeleted')
      socket.off('appUpdated')
      socket.off('menuUpdated')
    }
  }, [houseId]);

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
    setRecetasSeleccionadas([receta]);
    setIsSupermarketModalOpen(true);
  };

  const procesarAñadirRecetasSeleccionadas = (supermercadoDestino: string) => {
    recetasSeleccionadas.forEach(receta => {
      receta.ingredientes.forEach(ingrediente => {
        const nombreNormalizado = ingrediente.nombre.trim().toLowerCase();
        const itemExistente = items.find(
          item => item.supermercado === supermercadoDestino && item.name.trim().toLowerCase() === nombreNormalizado
        );

        if (itemExistente) {
          if (itemExistente.comprado) {
            socket.emit('toggle-item', { itemId: itemExistente.id, houseId, comprado: false });
          }
        } else {
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
    });

    const mensaje = recetasSeleccionadas.length === 1 
      ? `✅ ¡Ingredientes de "${recetasSeleccionadas[0].nombre}" añadidos a ${supermercadoDestino}!`
      : `✅ ¡Ingredientes de ${recetasSeleccionadas.length} recetas añadidos a ${supermercadoDestino}!`;
    
    alert(mensaje);
    setRecetasSeleccionadas([]); 
    setIsSupermarketModalOpen(false);
    setIsRecetarioOpen(false); 
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setNewItemName(text);
    setNewItemCategory(categorizarProducto(text));
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !activeSupermarket || !currentUser) return;
    const nombreNormalizado = newItemName.trim().toLowerCase();
    const itemExistente = items.find(
      item => item.supermercado === activeSupermarket && item.name.trim().toLowerCase() === nombreNormalizado
    );

    if (itemExistente) {
      if (itemExistente.comprado) {
        socket.emit('toggle-item', { itemId: itemExistente.id, houseId, comprado: false });
      } else {
        alert(`¡"${newItemName}" ya está en tu lista de ${activeSupermarket}!`);
      }
    } else {
      socket.emit('addItem', { 
        name: newItemName, houseId, supermercado: activeSupermarket, categoria: newItemCategory, creador: currentUser 
      });
    }
    setNewItemName(''); 
    setNewItemCategory('Otros');
  };

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
    socket.emit('sendSuggestion', { text: suggestionText, houseId, creador: currentUser });
    alert("¡Sugerencia enviada correctamente!");
    setIsSuggestionOpen(false);
    setSuggestionText('');
  }

  const getBackgroundColor = () => {
    if (activeSupermarket === 'aldi') return '#e0f0ff';
    if (activeSupermarket === 'mercadona') return '#e6faec';
    if (activeSupermarket === 'lidl') return '#fffde6';
    if (activeSupermarket === 'costco') return '#ffe6e6';
    if (activeSupermarket === 'medina 3') return '#f3e5f5';
    return '#ffffff';
  }

  // --- FUNCIONES DE ADMINISTRACIÓN ---
  const abrirAdministracion = async () => {
    try {
      console.log("Intentando abrir administración para la casa:", houseId);
      const res = await fetch(`/api/houses/${houseId}/users`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      console.log("Respuesta del servidor:", data);
      
      if (res.ok && !data.error) {
        setHouseMembers(data.users);
        setHouseAdminId(data.adminId);
        setIsAdminModalOpen(true);
      } else {
        alert("Error del servidor: " + (data.error || "No se pudo cargar la administración"));
      }
    } catch (error) {
      console.error("Error crítico al abrir administración:", error);
      alert("Fallo de red al conectar con el servidor.");
    }
  };

  const abandonarCasa = async () => {
    if (!window.confirm("¿Seguro que quieres abandonar esta casa? Perderás el acceso.")) return;
    try {
      await fetch(`/api/houses/${houseId}/leave`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      window.location.reload(); 
    } catch (error) {
      console.error("Error al abandonar:", error);
    }
  };

  const expulsarUsuario = async (targetId: string, nombre: string) => {
    if (!window.confirm(`¿Seguro que quieres expulsar a ${nombre}?`)) return;
    try {
      await fetch(`/api/houses/${houseId}/users/${targetId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setHouseMembers(prev => prev.filter(m => m.id !== targetId));
    } catch (error) {
      console.error("Error al expulsar:", error);
    }
  };

  const eliminarCasa = async () => {
    if (!window.confirm("¡ATENCIÓN! ¿Seguro que quieres borrar la casa entera y todas sus listas? Esta acción no se puede deshacer.")) return;
    try {
      await fetch(`/api/houses/${houseId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      window.location.reload();
    } catch (error) {
      console.error("Error al eliminar casa:", error);
    }
  };

  const procesarAñadirCasa = async () => {
    if (!newHouseInput.trim()) return;
    try {
      const endpoint = addHouseMode === 'crear' ? '/api/houses' : '/api/houses/join';
      const payload = addHouseMode === 'crear' ? { name: newHouseInput } : { inviteCode: newHouseInput };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && !data.error) {
        window.location.reload(); // Recargamos para que lea el nuevo array de casas de la BD
      } else {
        alert(data.error || 'Error al procesar la solicitud');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  if (!currentUser || !houseId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f2f5', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px' }}>
        <div style={{ backgroundColor: 'white', padding: '40px 30px', borderRadius: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', width: '100%', maxWidth: '350px', animation: 'fadeIn 0.5s ease' }}>
          <h1 style={{ margin: '0 0 25px 0', textAlign: 'center', fontSize: '28px', color: '#1a1a1a', fontWeight: '800' }}>
            {isLoginMode ? '¡Hola de nuevo! 👋' : 'Unirse a la Casa 🏠'}
          </h1>
          {authError && (
            <div style={{ backgroundColor: '#fff0f0', color: '#ff4d4f', padding: '12px', borderRadius: '12px', marginBottom: '20px', fontSize: '14px', textAlign: 'center', fontWeight: 'bold' }}>
              {authError}
            </div>
          )}
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {!isLoginMode && (
              <>
                <input type="text" placeholder="Tu Nombre (ej: Mamá)" value={authName} onChange={e => setAuthName(e.target.value)} required style={{ padding: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', fontSize: '16px', outline: 'none', backgroundColor: '#f8f9fa' }} />
                <input type="text" placeholder="Código de Invitación (opcional)" value={authInviteCode} onChange={e => setAuthInviteCode(e.target.value)} style={{ padding: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', fontSize: '16px', outline: 'none', backgroundColor: '#f8f9fa' }} />
              </>
            )}
            <input type="email" placeholder="Correo electrónico" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required style={{ padding: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', fontSize: '16px', outline: 'none', backgroundColor: '#f8f9fa' }} />
            <input type="password" placeholder="Contraseña" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required style={{ padding: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', fontSize: '16px', outline: 'none', backgroundColor: '#f8f9fa' }} />
            <button type="submit" style={{ padding: '16px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 15px rgba(0,123,255,0.3)' }}>
              {isLoginMode ? 'Entrar' : 'Crear mi cuenta'}
            </button>
          </form>
          <button 
            onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); }} 
            style={{ width: '100%', marginTop: '20px', background: 'transparent', border: 'none', color: '#666', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isLoginMode ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
          </button>
        </div>
      </div>
    )
  }

  const filteredItems = items.filter(item => item.supermercado === activeSupermarket);
  const categoriasAUsar = activeSupermarket === 'mercadona' ? ORDEN_MERCADONA : RUTAS_SUPERMERCADO;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: getBackgroundColor(), transition: 'background-color 0.4s ease', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* --- FIX GLOBAL PARA EL MODO OSCURO DE IPHONE --- */}
      <style>{`
        input, textarea, select {
          color: #1a1a1a !important;
          color-scheme: light;
        }
        ::placeholder {
          color: #999 !important;
          opacity: 1;
        }
      `}</style>  

      {updateAvailable && (
        <div style={{ position: 'sticky', top: 0, left: 0, right: 0, backgroundColor: '#ff9800', color: 'white', padding: '15px 20px', zIndex: 9999, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 15px rgba(255,152,0,0.4)', animation: 'fadeIn 0.5s ease-in-out' }}>
          <span style={{ fontWeight: 'bold', fontSize: '15px' }}>🚀 ¡Nueva versión disponible!</span>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', borderRadius: '12px', border: 'none', backgroundColor: 'white', color: '#ff9800', fontWeight: '900', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>Actualizar</button>
        </div>
      )}

      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '1.5rem', paddingBottom: '100px' }}>
        
        {/* --- PANTALLA PRINCIPAL --- */}
        {!activeSupermarket && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '30px', animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '35px', backgroundColor: 'white', padding: '20px', borderRadius: '24px', boxShadow: '0 8px 25px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '28px', color: '#1a1a1a', fontWeight: '800', letterSpacing: '-0.5px' }}>Tus Listas</h1>
                <button 
                  onClick={() => {
                    socket.disconnect();
                    localStorage.clear();
                    setCurrentUser(null); 
                    setHouseId(null); 
                    setUserHouses([]);
                  }}
                  style={{ background: '#fff0f0', border: 'none', padding: '8px 12px', borderRadius: '12px', cursor: 'pointer', color: '#ff4d4f', fontWeight: 'bold', fontSize: '14px' }}
                >
                  Cerrar sesión
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🏠</span>
                <select 
                  value={houseId || ''} 
                  onChange={(e) => {
                    const nuevaCasaId = e.target.value;
                    setHouseId(nuevaCasaId);
                    localStorage.setItem('houseId', nuevaCasaId);
                    socket.emit('joinHouse', nuevaCasaId);
                  }}
                  style={{ flex: 1, padding: '12px', fontSize: '16px', borderRadius: '12px', border: '2px solid #f0f2f5', backgroundColor: '#f8f9fa', outline: 'none', color: '#333', fontWeight: 'bold' }}
                
                  
                >
                  {userHouses.map(casa => (
                    <option key={casa.id} value={casa.id}>{casa.name} (Código: {casa.inviteCode})</option>
                  ))}
                </select>
                {/* NUEVO BOTÓN DE ENGRANAJE */}
                <button 
                  onClick={abrirAdministracion}
                  style={{ padding: '12px', fontSize: '18px', borderRadius: '12px', border: '2px solid #f0f2f5', background: '#f8f9fa', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  ⚙️
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <button onClick={() => setActiveSupermarket('aldi')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #005b9f 0%, #003f75 100%)', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(0,91,159,0.25)', transition: 'transform 0.1s' }}><span style={{ fontSize: '34px', background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🛍️</span>Aldi</button>
              <button onClick={() => setActiveSupermarket('medina 3')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(156,39,176,0.25)' }}><span style={{ fontSize: '34px', background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🏪</span>Medina 3</button>
              <button onClick={() => setActiveSupermarket('mercadona')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #00824b 0%, #005c35 100%)', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(0,130,75,0.25)' }}><span style={{ fontSize: '34px', background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🧺</span>Mercadona</button>
              <button onClick={() => setActiveSupermarket('lidl')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #ffd700 0%, #f0b400 100%)', color: '#003f75', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(255,215,0,0.3)' }}><span style={{ fontSize: '34px', background: 'rgba(0,63,117,0.1)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🛒</span>Lidl</button>
              <button onClick={() => setActiveSupermarket('costco')} style={{ WebkitAppearance: 'none', padding: '30px 10px', fontSize: '20px', background: 'linear-gradient(135deg, #e31837 0%, #a61027 100%)', color: 'white', border: 'none', borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', boxShadow: '0 10px 20px rgba(227,24,55,0.25)' }}><span style={{ fontSize: '34px', background: 'rgba(255,255,255,0.15)', padding: '16px', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>📦</span>Costco</button>
            </div>
          </div>
        )}

        {/* --- PANTALLA LISTA DE LA COMPRA --- */}
        {activeSupermarket && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
              <button onClick={() => setActiveSupermarket(null)} style={{ WebkitAppearance: 'none', padding: '10px 14px', fontSize: '16px', cursor: 'pointer', borderRadius: '14px', border: 'none', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>⬅️</button>
              <h1 style={{ margin: 0, textTransform: 'capitalize', fontSize: '22px', fontWeight: '800', color: '#1a1a1a', flex: 1, textAlign: 'center', paddingRight: '40px' }}>{activeSupermarket}</h1>
            </div>
            
            <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '35px', backgroundColor: 'white', padding: '20px', borderRadius: '24px', boxShadow: '0 8px 25px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <input type="text" value={newItemName} onChange={handleNameChange} placeholder={`¿Qué falta en ${activeSupermarket}?`} style={{ flex: 1, padding: '16px', fontSize: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', backgroundColor: '#f8f9fa', WebkitAppearance: 'none', minWidth: 0, outline: 'none' }} />
                <button type="button" onClick={toggleListening} style={{ WebkitAppearance: 'none', width: '56px', height: '56px', fontSize: '22px', cursor: 'pointer', backgroundColor: isListening ? '#ff4d4f' : '#f0f2f5', color: isListening ? 'white' : 'black', border: 'none', borderRadius: '16px', flexShrink: 0, transition: 'all 0.3s ease', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: isListening ? '0 4px 15px rgba(255,77,79,0.3)' : 'none' }}>{isListening ? '🔴' : '🎙️'}</button>
              </div>
              <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} style={{ padding: '16px', fontSize: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', backgroundColor: '#f8f9fa', WebkitAppearance: 'none', color: '#444', width: '100%', outline: 'none', fontWeight: '500' }}>
                {categoriasAUsar.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <button type="submit" style={{ WebkitAppearance: 'none', padding: '16px', fontSize: '16px', cursor: 'pointer', background: 'linear-gradient(135deg, #28a745 0%, #208838 100%)', color: 'white', border: 'none', borderRadius: '16px', fontWeight: 'bold', width: '100%', boxShadow: '0 6px 15px rgba(40,167,69,0.25)' }}>➕ Añadir al carrito</button>
            </form>

            {categoriasAUsar.map(categoria => {
              const itemsDeEstaCategoria = filteredItems.filter(item => !item.comprado && item.categoria === categoria);
              if (itemsDeEstaCategoria.length === 0) return null; 
              return (
                <div key={categoria} style={{ marginBottom: '25px' }}>
                  <h4 style={{ margin: '0 0 12px 10px', color: '#666', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>📍 {categoria}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {itemsDeEstaCategoria.map(item => (
                      <div key={item.id} onClick={() => toggleItem(item)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: 'white', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #ddd', flexShrink: 0 }}></div>
                          <span style={{ fontSize: '18px', color: '#222', fontWeight: '500' }}>{item.name} <span style={{ fontSize: '12px', color: '#888', marginLeft: '10px', backgroundColor: '#f0f2f5', padding: '4px 8px', borderRadius: '10px', fontWeight: 'normal' }}>{item.creador}</span></span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ WebkitAppearance: 'none', padding: '10px', background: '#fff0f0', color: '#ff4d4f', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>🗑️</button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            
            <div style={{ marginTop: '40px' }}>
              <h4 style={{ margin: '0 0 12px 10px', color: '#999', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>❌ Frecuentes</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredItems.filter(item => item.comprado).map(item => (
                  <div key={item.id} onClick={() => toggleItem(item)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: '20px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, opacity: 0.6 }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#ff4d4f', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: '12px', flexShrink: 0 }}>❌</div>
                      <span style={{ textDecoration: 'line-through', fontSize: '18px', color: '#666', fontWeight: '500' }}>{item.name}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} style={{ WebkitAppearance: 'none', padding: '10px', background: 'transparent', color: '#ccc', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px' }}>🗑️</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- BOTONES FLOTANTES --- */}
        <button onClick={() => setIsRecetarioOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '25px', left: '25px', width: '65px', height: '65px', borderRadius: '50%', background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)', color: 'white', border: 'none', fontSize: '28px', boxShadow: '0 8px 20px rgba(255,152,0,0.4)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>📖</button>
        <button onClick={() => setIsCalendarOpen(true)} style={{ WebkitAppearance: 'none', position: 'fixed', bottom: '25px', left: '50%', transform: 'translateX(-50%)', width: '75px', height: '75px', borderRadius: '50%', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', fontSize: '32px', boxShadow: '0 8px 25px rgba(156,39,176,0.4)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>📅</button>
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

        {/* --- MODAL AÑADIR/UNIRSE A CASA --- */}
        {isAddHouseModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1400 }}>
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, textAlign: 'center', color: '#1a1a1a', fontSize: '22px', fontWeight: '800' }}>Nueva Casa</h3>
              
              <div style={{ display: 'flex', backgroundColor: '#f0f2f5', borderRadius: '12px', padding: '4px' }}>
                <button onClick={() => setAddHouseMode('crear')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: addHouseMode === 'crear' ? 'white' : 'transparent', color: addHouseMode === 'crear' ? '#007bff' : '#666', fontWeight: 'bold', cursor: 'pointer', boxShadow: addHouseMode === 'crear' ? '0 2px 5px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>Crear</button>
                <button onClick={() => setAddHouseMode('unirse')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: addHouseMode === 'unirse' ? 'white' : 'transparent', color: addHouseMode === 'unirse' ? '#007bff' : '#666', fontWeight: 'bold', cursor: 'pointer', boxShadow: addHouseMode === 'unirse' ? '0 2px 5px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>Unirse</button>
              </div>

              <input 
                type="text" 
                placeholder={addHouseMode === 'crear' ? "Nombre de la casa..." : "Código de invitación..."} 
                value={newHouseInput} 
                onChange={(e) => setNewHouseInput(e.target.value)} 
                style={{ padding: '16px', borderRadius: '16px', border: '2px solid #f0f2f5', fontSize: '16px', outline: 'none', backgroundColor: '#f8f9fa', color: '#333' }} 
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setIsAddHouseModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold', fontSize: '16px' }}>Cancelar</button>
                <button onClick={procesarAñadirCasa} style={{ flex: 1, padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)', color: 'white', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 10px rgba(0,123,255,0.3)' }}>Aceptar</button>
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
              <input type="text" placeholder="Buscar por receta o ingrediente..." value={busquedaReceta} onChange={(e) => setBusquedaReceta(e.target.value)} style={{ padding: '16px', fontSize: '16px', borderRadius: '16px', border: 'none', marginBottom: '20px', width: '100%', boxSizing: 'border-box', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', outline: 'none' }} />
              <div style={{ display: 'flex', overflowX: 'auto', whiteSpace: 'nowrap', gap: '10px', paddingBottom: '15px', marginBottom: '10px', scrollbarWidth: 'none' }}>
                {categorias.map(cat => (
                  <button key={cat} onClick={() => setCategoriaActiva(cat)} style={{ padding: '10px 20px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold', transition: 'all 0.2s', backgroundColor: categoriaActiva === cat ? '#28a745' : 'white', color: categoriaActiva === cat ? 'white' : '#555', boxShadow: '0 4px 10px rgba(0,0,0,0.04)' }}>{cat}</button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 40px 20px' }}>
              <div style={{ backgroundColor: '#f3e5f5', padding: '15px', borderRadius: '16px', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px', border: '2px solid #ce93d8' }}>
                <span style={{ color: '#6a1b9a', fontWeight: 'bold', fontSize: '14px' }}>¿No encuentras la receta?</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" placeholder="Escribe un plato rápido (ej: Sandwich)" value={platoManual} onChange={(e) => setPlatoManual(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') handleAñadirPlatoManual(); }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ce93d8', outline: 'none', fontSize: '15px' }} />
                  <button onClick={handleAñadirPlatoManual} style={{ background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', borderRadius: '12px', padding: '0 15px', fontWeight: 'bold', cursor: 'pointer', fontSize: '15px' }}>Asignar</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {recetasFiltradas.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>No hay recetas en esta categoría.</p>
                ) : (
                  recetasFiltradas.map(receta => {
                    const isSelected = recetasSeleccionadas.some(r => r.id === receta.id);
                    return (
                    <div key={receta.id} onClick={() => setRecetaExpandida(recetaExpandida === receta.id ? null : receta.id)} style={{ backgroundColor: 'white', borderRadius: '24px', padding: '20px', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, paddingRight: '10px' }}>
                          <h3 style={{ margin: '0 0 8px 0', fontSize: '19px', color: '#1a1a1a', fontWeight: '800', lineHeight: '1.2' }}>{receta.nombre}</h3>
                          <span style={{ fontSize: '12px', backgroundColor: '#fff3e0', color: '#e65100', padding: '5px 10px', borderRadius: '8px', fontWeight: 'bold' }}>{receta.categoria}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={(e) => { e.stopPropagation(); setRecetaParaCalendario(receta); }} style={{ width: '42px', height: '42px', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', borderRadius: '14px', fontSize: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 4px 10px rgba(156,39,176,0.3)' }} title="Añadir al Menú Semanal">📅</button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (isSelected) setRecetasSeleccionadas(prev => prev.filter(r => r.id !== receta.id));
                              else setRecetasSeleccionadas(prev => [...prev, receta]);
                            }} 
                            style={{ width: '42px', height: '42px', background: isSelected ? 'linear-gradient(135deg, #28a745 0%, #208838 100%)' : '#f0f2f5', color: isSelected ? 'white' : '#aaa', border: 'none', borderRadius: '14px', fontSize: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: isSelected ? '0 4px 10px rgba(40,167,69,0.3)' : 'none', transition: 'all 0.2s' }} 
                            title="Seleccionar para comprar"
                          >
                            {isSelected ? '✓' : '+'}
                          </button>
                        </div>
                      </div>
                      
                      {recetaExpandida === receta.id && (
                        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #f0f2f5', cursor: 'default' }} onClick={e => e.stopPropagation()}>
                          <h4 style={{ margin: '0 0 12px 0', color: '#444', fontSize: '15px', fontWeight: '800' }}>🛒 Ingredientes:</h4>
                          <ul style={{ margin: '0 0 25px 0', paddingLeft: '20px', color: '#555', fontSize: '15px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {receta.ingredientes.map((ingrediente, idx) => <li key={idx}>{ingrediente.nombre}</li>)}
                          </ul>
                          <h4 style={{ margin: '0 0 12px 0', color: '#444', fontSize: '15px', fontWeight: '800' }}>👨‍🍳 Preparación:</h4>
                          <p style={{ margin: 0, color: '#555', fontSize: '15px', lineHeight: '1.7', whiteSpace: 'pre-line' }}>{receta.instrucciones || "No hay instrucciones para esta receta."}</p>
                        </div>
                      )}
                    </div>
                  )})
                )}
              </div>
            </div>

            {/* NUEVA BARRA INFERIOR DE COMPRA */}
            {recetasSeleccionadas.length > 0 && (
              <div style={{ padding: '20px', backgroundColor: 'white', borderTop: '1px solid #eee', boxShadow: '0 -4px 15px rgba(0,0,0,0.05)', zIndex: 10, animation: 'fadeIn 0.3s ease' }}>
                <button 
                  onClick={() => setIsSupermarketModalOpen(true)}
                  style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)', color: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 8px 25px rgba(0,123,255,0.3)' }}
                >
                  🛒 Comprar {recetasSeleccionadas.length} receta{recetasSeleccionadas.length > 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- PANTALLA DEL CALENDARIO (MENÚ SEMANAL) --- */}
        {isCalendarOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f8f9fa', zIndex: 1100, display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh' }}>
            <div style={{ padding: '20px 20px 0 20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: '#1a1a1a', fontWeight: '800' }}>📅 Menú</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setIsCalendarOpen(false); setIsRecetarioOpen(true); }} style={{ background: 'linear-gradient(135deg, #28a745 0%, #208838 100%)', color: 'white', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', padding: '8px 12px', borderRadius: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 10px rgba(40,167,69,0.3)' }}>➕ Añadir</button>
                  <button onClick={() => { setIsCalendarOpen(false); setIsHistorialOpen(true); }} style={{ background: '#f3e5f5', color: '#9c27b0', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', padding: '8px 12px', borderRadius: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>⏳</button>
                  <button onClick={() => setIsCalendarOpen(false)} style={{ background: '#f0f2f5', border: 'none', fontSize: '18px', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>❌</button>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 100px 20px', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {diasCalendario.map(diaObj => {
                  const datosDia = menuSemanal[diaObj.id] || { comida: [], cena: [] };
                  return (
                    <div key={diaObj.id} style={{ backgroundColor: 'white', borderRadius: '24px', padding: '20px', boxShadow: '0 6px 20px rgba(0,0,0,0.04)' }}>
                      <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#6a1b9a', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>{diaObj.nombre}</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '22px', marginTop: '10px' }}>☀️</span>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {datosDia.comida && datosDia.comida.length > 0 && datosDia.comida.map((receta, idx) => (
                              <div key={`${receta.id}-${idx}`} style={{ border: '2px solid #f0f2f5', borderRadius: '14px', backgroundColor: 'white', overflow: 'hidden' }}>
                                <div onClick={() => setExpandidoCalendario(expandidoCalendario === `${diaObj.id}-comida-${receta.id}` ? null : `${diaObj.id}-comida-${receta.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', backgroundColor: expandidoCalendario === `${diaObj.id}-comida-${receta.id}` ? '#f8f9fa' : 'white' }}>
                                  <span style={{ fontSize: '16px', color: '#333', fontWeight: 'bold', flex: 1, paddingRight: '10px' }}>{receta.nombre}</span>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={(e) => { e.stopPropagation(); handleAñadirReceta(receta); setIsCalendarOpen(false); }} style={{ background: '#e6faec', color: '#28a745', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Añadir ingredientes al carrito">➕</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleEliminarRecetaCalendario(diaObj.id, 'comida', receta.id); }} style={{ background: '#fff0f0', color: '#ff4d4f', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Quitar del menú">🗑️</button>
                                  </div>
                                </div>
                                {expandidoCalendario === `${diaObj.id}-comida-${receta.id}` && (
                                  <div style={{ padding: '16px', borderTop: '2px solid #f0f2f5', backgroundColor: '#fafafa' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#444' }}>🛒 Ingredientes:</h4>
                                    <ul style={{ margin: '0 0 15px 0', paddingLeft: '20px', color: '#555', fontSize: '14px' }}>{receta.ingredientes.map((ing, i) => <li key={i}>{ing.nombre}</li>)}</ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '22px', marginTop: '10px', filter: 'hue-rotate(180deg) saturate(1.5) brightness(1.2)' }}>🌙</span><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {datosDia.cena && datosDia.cena.length > 0 && datosDia.cena.map((receta, idx) => (
                              <div key={`${receta.id}-${idx}`} style={{ border: '2px solid #f0f2f5', borderRadius: '14px', backgroundColor: 'white', overflow: 'hidden' }}>
                                <div onClick={() => setExpandidoCalendario(expandidoCalendario === `${diaObj.id}-cena-${receta.id}` ? null : `${diaObj.id}-cena-${receta.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', backgroundColor: expandidoCalendario === `${diaObj.id}-cena-${receta.id}` ? '#f8f9fa' : 'white' }}>
                                  <span style={{ fontSize: '16px', color: '#333', fontWeight: 'bold', flex: 1, paddingRight: '10px' }}>{receta.nombre}</span>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={(e) => { e.stopPropagation(); handleAñadirReceta(receta); setIsCalendarOpen(false); }} style={{ background: '#e6faec', color: '#28a745', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Añadir ingredientes al carrito">➕</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleEliminarRecetaCalendario(diaObj.id, 'cena', receta.id); }} style={{ background: '#fff0f0', color: '#ff4d4f', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Quitar del menú">🗑️</button>
                                  </div>
                                </div>
                                {expandidoCalendario === `${diaObj.id}-cena-${receta.id}` && (
                                  <div style={{ padding: '16px', borderTop: '2px solid #f0f2f5', backgroundColor: '#fafafa' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#444' }}>🛒 Ingredientes:</h4>
                                    <ul style={{ margin: '0 0 15px 0', paddingLeft: '20px', color: '#555', fontSize: '14px' }}>{receta.ingredientes.map((ing, i) => <li key={i}>{ing.nombre}</li>)}</ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* --- PANTALLA DEL HISTORIAL --- */}
        {isHistorialOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f8f9fa', zIndex: 1150, display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100vh' }}>
            <div style={{ padding: '20px 20px 0 20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: 'white', padding: '15px 20px', borderRadius: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: '#1a1a1a', fontWeight: '800' }}>⏳ Historial</h2>
                <button onClick={() => { setIsHistorialOpen(false); setIsCalendarOpen(true); }} style={{ background: '#f0f2f5', border: 'none', fontSize: '18px', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>❌</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 40px 20px', WebkitOverflowScrolling: 'touch' }}>
              {semanasHistorial.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>Aún no hay semanas en el historial.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {semanasHistorial.map(semana => (
                    <div key={semana.lunes} style={{ backgroundColor: 'white', borderRadius: '24px', padding: '20px', boxShadow: '0 6px 20px rgba(0,0,0,0.04)' }}>
                      <div onClick={() => setSemanaExpandidaHistorial(semanaExpandidaHistorial === semana.lunes ? null : semana.lunes)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                        <h3 style={{ margin: 0, fontSize: '17px', color: '#6a1b9a', fontWeight: '800' }}>{semana.etiqueta}</h3>
                        <span style={{ fontSize: '20px', transform: semanaExpandidaHistorial === semana.lunes ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>🔽</span>
                      </div>
                      {semanaExpandidaHistorial === semana.lunes && (
                        <div style={{ marginTop: '20px', borderTop: '2px solid #f0f2f5', paddingTop: '20px', animation: 'fadeIn 0.3s ease' }}>
                          <button onClick={() => copiarHistorialAActual(semana)} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', borderRadius: '16px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '20px', boxShadow: '0 4px 15px rgba(156,39,176,0.3)' }}>📥 Copiar a la semana actual</button>
                          {[1, 2, 3, 4, 5, 6, 0].map(diaIdx => {
                            const datosDia = semana.dias[diaIdx];
                            if (!datosDia) return null;
                            const nombresDias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                            return (
                              <div key={diaIdx} style={{ marginBottom: '15px' }}>
                                <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#333' }}>{nombresDias[diaIdx]}</h4>
                                <div style={{ paddingLeft: '12px', borderLeft: '3px solid #e1bee7', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {datosDia.comida.length > 0 && <span style={{ fontSize: '14px', color: '#555' }}>☀️ {datosDia.comida.map(r => r.nombre).join(', ')}</span>}
                                  {datosDia.cena.length > 0 && <span style={{ fontSize: '14px', color: '#555' }}><span style={{ filter: 'hue-rotate(180deg) saturate(1.5) brightness(1.2)' }}>🌙</span> {datosDia.cena.map(r => r.nombre).join(', ')}</span>}</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                <button onClick={() => setRecetaParaCalendario(null)} style={{ flex: 1, WebkitAppearance: 'none', padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold', fontSize: '16px' }}>Cancelar</button>
                <button onClick={confirmarAñadirAlCalendario} style={{ flex: 1, WebkitAppearance: 'none', padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 10px rgba(156,39,176,0.3)' }}>Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* --- MODAL SELECCIONAR SUPERMERCADO PARA RECETAS MULTIPLES --- */}
        {isSupermarketModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200 }}>
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: 0, textAlign: 'center', color: '#1a1a1a', fontSize: '20px', fontWeight: '800', lineHeight: '1.3' }}>
                ¿Dónde quieres comprar para<br/>
                <span style={{color: '#007bff'}}>
                  {recetasSeleccionadas.length === 1 ? `"${recetasSeleccionadas[0].nombre}"` : `estas ${recetasSeleccionadas.length} recetas`}
                </span>?
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                <button onClick={() => procesarAñadirRecetasSeleccionadas('aldi')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #005b9f 0%, #003f75 100%)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,91,159,0.2)' }}>Aldi</button>
                <button onClick={() => procesarAñadirRecetasSeleccionadas('mercadona')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #00824b 0%, #005c35 100%)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(0,130,75,0.2)' }}>Mercadona</button>
                <button onClick={() => procesarAñadirRecetasSeleccionadas('lidl')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #ffd700 0%, #f0b400 100%)', color: '#003f75', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(255,215,0,0.2)' }}>Lidl</button>
                <button onClick={() => procesarAñadirRecetasSeleccionadas('costco')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #e31837 0%, #a61027 100%)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(227,24,55,0.2)' }}>Costco</button>
                <button onClick={() => procesarAñadirRecetasSeleccionadas('medina 3')} style={{ WebkitAppearance: 'none', padding: '20px 10px', fontSize: '16px', background: 'linear-gradient(135deg, #9c27b0 0%, #6a1b9a 100%)', color: 'white', border: 'none', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(156,39,176,0.2)' }}>Medina 3</button>
              </div>
              <button onClick={() => setIsSupermarketModalOpen(false)} style={{ WebkitAppearance: 'none', padding: '15px', marginTop: '10px', borderRadius: '16px', border: 'none', cursor: 'pointer', backgroundColor: '#f0f2f5', color: '#444', fontWeight: 'bold', fontSize: '16px' }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* --- MODAL DE ADMINISTRACIÓN --- */}
        {isAdminModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1300 }}>
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: '#1a1a1a', fontSize: '22px', fontWeight: '800' }}>⚙️ Administrar Casa</h3>
                <button onClick={() => setIsAdminModalOpen(false)} style={{ background: '#f0f2f5', border: 'none', fontSize: '16px', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>❌</button>
              </div>

              <div>
                <h4 style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>👥 Miembros</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {houseMembers.map(miembro => (
                    <div key={miembro.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 15px', backgroundColor: '#f8f9fa', borderRadius: '16px', border: houseAdminId === miembro.id ? '2px solid #007bff' : '2px solid transparent' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 'bold', color: '#333', fontSize: '16px' }}>{miembro.name} {currentUserId === miembro.id ? '(Tú)' : ''}</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>{houseAdminId === miembro.id ? '👑 Administrador' : 'Inquilino'}</span>
                      </div>
                      
                      {currentUserId === houseAdminId && currentUserId !== miembro.id && (
                        <button onClick={() => expulsarUsuario(miembro.id, miembro.name)} style={{ background: '#fff0f0', color: '#ff4d4f', border: 'none', borderRadius: '10px', padding: '8px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>Expulsar</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* NUEVO BOTÓN PARA AÑADIR CASA */}
                <button 
                  onClick={() => { setIsAdminModalOpen(false); setIsAddHouseModalOpen(true); }} 
                  style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#e0f0ff', color: '#007bff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,123,255,0.2)' }}
                >
                  ➕ Añadir o unirse a otra casa
                </button>  {currentUserId === houseAdminId ? (
                  <button onClick={eliminarCasa} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#ff4d4f', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,77,79,0.3)' }}>
                    🗑️ Eliminar Casa
                  </button>
                ) : (
                  <button onClick={abandonarCasa} style={{ width: '100%', padding: '16px', borderRadius: '16px', border: 'none', background: '#ff9800', color: 'white', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,152,0,0.3)' }}>
                    🚪 Abandonar Casa
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default App