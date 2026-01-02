import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticatedUserSchema, type AuthenticatedUser } from '../authenticated-user';
import { requireEnv } from '../env';
import { AppError } from './errorHandler';

const JWT_SECRET = requireEnv('JWT_SECRET');

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    throw new AppError('No token provided', 401);
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = authenticatedUserSchema.parse(payload);
    next();
  } catch {
    throw new AppError('Invalid or expired token', 403);
  }
}
