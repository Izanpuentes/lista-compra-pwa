# Lista de la Compra compartida

Aplicación web progresiva (PWA) para organizar la compra y las comidas de una casa entre todos sus miembros.
Cada persona se instala la app en el móvil, se une a su casa con un código de invitación y ve los cambios
de los demás en tiempo real.

## Funcionalidades

- **Listas por supermercado**: crea una lista para cada tienda (con su icono y color) y añade productos
  escribiéndolos o **dictándolos por voz**.
- **Sincronización en tiempo real**: cuando alguien añade, marca o borra un producto, el resto de la casa
  lo ve al momento, sin recargar.
- **Categorización automática**: cada producto se clasifica solo (verduras, lácteos, limpieza…) con
  diccionarios de palabras clave y distancia de Levenshtein, para tolerar faltas de ortografía.
- **Casas y miembros**: crea una casa, invita a otros con un código, gestiona sus miembros o únete a
  varias casas con la misma cuenta.
- **Calendario de comidas**: planifica la comida y la cena de los próximos siete días, con historial de
  semanas anteriores que puedes copiar a la semana actual.
- **Recetario**: unas 95 recetas de cocina mediterránea con ingredientes e instrucciones, para buscar
  ideas y añadirlas al menú.
- **Cuentas de usuario**: registro, inicio de sesión y recuperación de contraseña por correo.
- **Instalable**: funciona como app en el móvil (pantalla completa, icono propio) y se actualiza sola.

## Tecnologías

| Parte | Tecnologías |
|---|---|
| Frontend | React, TypeScript, Vite, vite-plugin-pwa (Workbox), Web Speech API |
| Backend | Node.js, Express 5, Socket.IO, TypeScript |
| Datos | PostgreSQL con Prisma ORM |
| Autenticación | JWT y contraseñas cifradas con bcrypt |
| Correo | API HTTP de Brevo |
| Desarrollo | Docker Compose para la base de datos |

## Estructura

```
frontend/   PWA en React (interfaz, voz, categorizador, calendario y recetario)
backend/    API REST + servidor de tiempo real (Socket.IO) y esquema de Prisma
  prisma/   esquema, migraciones y recetas iniciales
```

En producción, el backend sirve también el frontend compilado, de modo que todo funciona como un único servicio.

## Ejecutarlo en local

Requisitos: Node.js 20+ y Docker.

```bash
# 1. Base de datos
docker compose up -d

# 2. Backend
cd backend
# crea un archivo .env con las variables de la tabla de abajo
npm install
npx prisma migrate dev
npx prisma db seed        # carga el recetario
npm run dev               # http://localhost:3000

# 3. Frontend (en otra terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Variables de entorno del backend:

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Conexión a PostgreSQL |
| `JWT_SECRET` | Firma de las sesiones |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Envío de correos de recuperación de contraseña |

## Estado

Proyecto personal en desarrollo activo. Próximos pasos: orden de productos independiente para cada
supermercado y mejoras en el flujo de registro y de gestión de varias casas.
