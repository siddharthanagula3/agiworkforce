import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticatedUserSchema, type AuthenticatedUser } from '../authenticated-user';
import { requireEnv } from '../env';

const JWT_SECRET = requireEnv('JWT_SECRET');

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Response | void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = authenticatedUserSchema.parse(payload);
    next();
    return;
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
