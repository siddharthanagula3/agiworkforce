import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticatedUserSchema, type AuthenticatedUser } from '../authenticated-user';
import { requireEnv } from '../env';
import { supabase } from '../lib/supabase';

const JWT_SECRET = requireEnv('JWT_SECRET');

// In-memory cache for account_status to prevent fail-open when Supabase is unavailable.
// TTL is intentionally short (60s) so suspensions take effect quickly.
// On DB error with no cached entry: fail closed (503). With a cached entry: use it.
const ACCOUNT_STATUS_CACHE_TTL_MS = 60_000;
interface AccountStatusEntry {
  status: string;
  cachedAt: number;
}
const accountStatusCache = new Map<string, AccountStatusEntry>();

function getCachedAccountStatus(userId: string): string | null {
  const entry = accountStatusCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ACCOUNT_STATUS_CACHE_TTL_MS) {
    accountStatusCache.delete(userId);
    return null;
  }
  return entry.status;
}

function setCachedAccountStatus(userId: string, status: string): void {
  accountStatusCache.set(userId, { status, cachedAt: Date.now() });
}

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

    // P0 Kill Switch: Check account status. Fail closed — never fail open.
    // Uses a short-TTL in-memory cache so brief DB outages don't block active users.
    // On DB error with no cached entry we return 503 (fail closed).
    const userId = req.user.userId;
    let accountStatus = getCachedAccountStatus(userId);

    if (accountStatus === null) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('account_status')
          .eq('id', userId)
          .single();

        if (profileError) {
          throw profileError;
        }

        const freshStatus = profile?.account_status ?? 'unknown';
        setCachedAccountStatus(userId, freshStatus);
        accountStatus = freshStatus;
      } catch (killSwitchError) {
        console.error('Kill switch DB check failed — failing closed:', killSwitchError);
        res.status(503).json({
          error: 'Service temporarily unavailable. Please try again shortly.',
          code: 'AUTH_CHECK_UNAVAILABLE',
        });
        return;
      }
    }

    if (accountStatus !== 'active') {
      res.status(403).json({
        error: `Account ${accountStatus}. Contact support for assistance.`,
        code: 'ACCOUNT_NOT_ACTIVE',
      });
      return;
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
