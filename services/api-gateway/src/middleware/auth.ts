import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticatedUserSchema, type AuthenticatedUser } from '../authenticated-user';
import { requireEnv } from '../env';
import { supabase } from '../lib/supabase';

const JWT_SECRET = requireEnv('JWT_SECRET');

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    // SECURITY: Properly parse the Authorization header instead of simple string replace.
    // Validates the 'Bearer <token>' format case-insensitively and handles edge cases.
    const parts = authHeader?.split(' ');
    const token = parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    });
    req.user = authenticatedUserSchema.parse(payload);

    // P0 Kill Switch: Check account status
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_status')
        .eq('id', req.user.userId)
        .single();

      if (!profile || profile.account_status !== 'active') {
        const status = profile?.account_status || 'unknown';
        res.status(403).json({
          error: `Account ${status}. Contact support for assistance.`,
          code: 'ACCOUNT_NOT_ACTIVE',
        });
        return;
      }
    } catch (killSwitchError) {
      // If Supabase is down, let the request through with a warning
      // to avoid blocking all users during an outage
      console.warn('Kill switch check failed (Supabase may be unavailable):', killSwitchError);
    }

    next();
  } catch (error) {
    // Handle JWT-specific errors
    // Note: TokenExpiredError extends JsonWebTokenError, so check it first
    if (error instanceof jwt.TokenExpiredError) {
      res.status(403).json({ error: 'Token expired' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    // Handle Zod validation errors or other unexpected errors
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
