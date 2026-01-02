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

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = authenticatedUserSchema.parse(payload);
    next();
  } catch (error) {
    // Handle JWT-specific errors
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      res.status(403).json({ error: 'Token expired' });
      return;
    }
    // Handle Zod validation errors or other unexpected errors
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
