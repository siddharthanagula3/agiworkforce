import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticatedUserSchema, type AuthenticatedUser } from '../authenticated-user';
import { requireEnv } from '../env';
import { getServiceClient } from '../lib/supabaseClients';
import { logger } from '../lib/logger';

const JWT_SECRET = requireEnv('JWT_SECRET');

// In-memory cache for account_status to prevent fail-open when Supabase is unavailable.
// TTL is intentionally short (60s) so suspensions take effect quickly.
// On DB error with no cached entry: fail closed (503). With a cached entry: use it.
const ACCOUNT_STATUS_CACHE_TTL_MS = 60_000;

// SECURITY (H7, redteam-services 2026-05-04): per-jti revocation cache.
// The check itself is one indexed PK lookup so we keep the TTL short — 5
// seconds is enough that we make at most ~1 lookup per active session per
// 5s. The cache only stores positive non-revoked answers; revoked tokens
// always re-check (defense in depth).
const REVOCATION_CACHE_TTL_MS = 5_000;
interface RevocationCacheEntry {
  cachedAt: number;
}
const revocationCache = new Map<string, RevocationCacheEntry>();
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

// Periodic cleanup of expired cache entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of accountStatusCache) {
    if (now - entry.cachedAt > ACCOUNT_STATUS_CACHE_TTL_MS) {
      accountStatusCache.delete(userId);
    }
  }
  // SECURITY (H7): also flush the revocation positive-cache.
  for (const [jti, entry] of revocationCache) {
    if (now - entry.cachedAt > REVOCATION_CACHE_TTL_MS) {
      revocationCache.delete(jti);
    }
  }
}, 300_000);

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
    }) as jwt.JwtPayload;
    req.user = authenticatedUserSchema.parse(payload);

    // SECURITY (H7, redteam-services 2026-05-04): per-jti revocation check.
    // Tokens issued before the H7 fix do not carry `jti` — accept them so
    // the rollout is non-breaking but log so we can track residual risk.
    if (typeof payload.jti === 'string' && payload.jti.length > 0) {
      const jti = payload.jti;
      const cached = revocationCache.get(jti);
      const cacheStale = !cached || Date.now() - cached.cachedAt > REVOCATION_CACHE_TTL_MS;

      if (cacheStale) {
        try {
          // Wave 1.5+ singleton sweep: revocation lookup happens DURING JWT
          // verification, so we don't yet have a verified user JWT to bind
          // to the client. Service-role is the correct client here — it's
          // bypassing RLS for a security-critical lookup that must
          // succeed-or-fail-closed, not a user-data read.
          const { data: revokedRow, error: revokedError } = await getServiceClient()
            .from('revoked_jwts')
            .select('jti')
            .eq('jti', jti)
            .maybeSingle();

          if (revokedError) {
            // DB outage on revocation check: fail closed for defense in
            // depth — a stolen token must not slip through during an outage.
            logger.error({ error: revokedError, jti }, 'Revocation DB check failed');
            res.status(503).json({
              error: 'Service temporarily unavailable. Please try again shortly.',
              code: 'AUTH_CHECK_UNAVAILABLE',
            });
            return;
          }

          if (revokedRow) {
            res.status(401).json({ error: 'Token revoked', code: 'TOKEN_REVOKED' });
            return;
          }

          revocationCache.set(jti, { cachedAt: Date.now() });
        } catch (revocationCheckError) {
          logger.error(
            { error: revocationCheckError, jti },
            'Revocation check threw — failing closed',
          );
          res.status(503).json({
            error: 'Service temporarily unavailable. Please try again shortly.',
            code: 'AUTH_CHECK_UNAVAILABLE',
          });
          return;
        }
      }
    }

    // P0 Kill Switch: Check account status. Fail closed — never fail open.
    // Uses a short-TTL in-memory cache so brief DB outages don't block active users.
    // On DB error with no cached entry we return 503 (fail closed).
    const userId = req.user.userId;
    let accountStatus = getCachedAccountStatus(userId);

    if (accountStatus === null) {
      try {
        // Wave 1.5+ singleton sweep: kill-switch check during auth
        // verification — service-role is correct here for the same reason
        // as the revocation lookup above.
        const { data: profile, error: profileError } = await getServiceClient()
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
        logger.error({ error: killSwitchError }, 'Kill switch DB check failed — failing closed');
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
