// config.ts
// Secretos y comprobaciones compartidas por el resto del backend.
import 'dotenv/config';
import crypto from 'crypto';
import { type Request, type Response, type NextFunction } from 'express';

// --- Clave para firmar las sesiones (JWT) ---
// Si JWT_SECRET no está definida, se genera una clave aleatoria al arrancar en lugar de usar un valor
// fijo escrito en el código (que cualquiera que lea el repositorio podría usar para fabricarse una sesión).
// Inconveniente: sin JWT_SECRET, las sesiones se pierden cada vez que se reinicia el servidor.
export const JWT_SECRET: string = (() => {
  const secreto = process.env.JWT_SECRET;
  if (secreto && secreto.length > 0) return secreto;
  console.warn('⚠️ JWT_SECRET no está definida: se usa una clave aleatoria y las sesiones se perderán al reiniciar.');
  return crypto.randomBytes(48).toString('hex');
})();

// --- Rutas de administración ---
// Solo funcionan si ADMIN_TOKEN está definida y la petición la incluye, en la cabecera
// "x-admin-token" o como ?token=... en la URL. Sin ADMIN_TOKEN quedan desactivadas.
export const soloAdministrador = (req: Request, res: Response, next: NextFunction) => {
  const esperado = process.env.ADMIN_TOKEN;
  if (!esperado) {
    return res.status(403).json({ error: 'Ruta de administración desactivada.' });
  }

  const recibido = req.header('x-admin-token') ?? (typeof req.query.token === 'string' ? req.query.token : '');
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  next();
};

// Escapa texto antes de meterlo en un HTML (por ejemplo, en un correo).
export const escaparHtml = (texto: unknown): string =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
