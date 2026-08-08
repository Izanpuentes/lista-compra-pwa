import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// El token ya solo contiene el userId
export interface AuthRequest extends Request {
  user?: {
    userId: string;
  };
}

export const verificarToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado o formato inválido.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Formato de token incorrecto.' });
    }

    // Verificamos y extraemos solo el userId
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta_de_desarrollo') as { userId: string };
    
    req.user = payload;
    next();
    
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};