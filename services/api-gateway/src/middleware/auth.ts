import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import jwt from 'jsonwebtoken';
import { authenticatedUserSchema, type AuthenticatedRequestUser } from '../authenticated-user';
import { requireEnv } from '../env';
import { getUserScopedClient } from '../lib/neonClients';
import { logger } from '../lib/logger';

const JWT_SECRET = requireEnv('JWT_SECRET');

// In-memory cache for account_status to prevent fail-open when Neon is unavailable.
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

// SECURITY (P1-GW-REVOKE): evict a jti from the positive-cache so a freshly
// revoked token is rejected immediately instead of riding the 5s cache window.
// /auth/logout calls this right after writing the revocation row.
export function evictRevocationCache(jti: string): void {
  revocationCache.delete(jti);
}

interface AccountStatusEntry {
  status: string;
  cachedAt: number;
}
const accountStatusCache = new Map<string, AccountStatusEntry>();

async function verifyGatewayOrClerkToken(token: string): Promise<jwt.JwtPayload> {
  const decoded = jwt.decode(token);
  const issuer =
    decoded && typeof decoded === 'object' && typeof decoded.iss === 'string' ? decoded.iss : null;

  if (issuer && issuer !== 'agiworkforce-api-gateway') {
    const secretKey = process.env['CLERK_SECRET_KEY'];
    if (!secretKey) {
      throw new jwt.JsonWebTokenError('Invalid token issuer');
    }

    const claims = await verifyToken(token, { secretKey });
    const emailClaim =
      typeof (claims as Record<string, unknown>)['email'] === 'string'
        ? ((claims as Record<string, unknown>)['email'] as string)
        : '';

    return {
      userId: claims.sub,
      email: emailClaim,
      sub: claims.sub,
    };
  }

  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'agiworkforce-api-gateway',
    audience: 'agiworkforce',
  }) as jwt.JwtPayload;
}

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
      user?: AuthenticatedRequestUser;
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

    const payload = await verifyGatewayOrClerkToken(token);
    // `token` is the raw, already-verified bearer string (verified just above
    // via Clerk verifyToken() or jwt.verify(..., JWT_SECRET)). Attaching it
    // lets the user-scoped database client bind Postgres RLS via
    // NeonDatabaseAdapter.withUser(token) for the handful of call sites that
    // have real policy coverage — see UserAuth's doc comment there.
    req.user = { ...authenticatedUserSchema.parse(payload), token };

    // SECURITY (H7, redteam-services 2026-05-04): per-jti revocation check.
    // Tokens issued before the H7 fix do not carry `jti` — accept them so
    // the rollout is non-breaking but log so we can track residual risk.
    if (typeof payload.jti === 'string' && payload.jti.length > 0) {
      const jti = payload.jti;
      const cached = revocationCache.get(jti);
      const cacheStale = !cached || Date.now() - cached.cachedAt > REVOCATION_CACHE_TTL_MS;

      if (cacheStale) {
        try {
          // Revocation lookup happens during token verification and must
          // succeed-or-fail-closed.
          const { data: revokedRow, error: revokedError } = await getUserScopedClient(req.user)
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
        // Kill-switch check during auth verification. It must fail closed.
        const { data: profile, error: profileError } = await getUserScopedClient(req.user)
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
