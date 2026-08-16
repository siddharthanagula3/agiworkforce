import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import jwt from 'jsonwebtoken';
import {
  authenticatedUserSchema,
  type AuthenticatedRequestUser,
  type CloudSurfaceClass,
} from '../authenticated-user';
import { requireEnv } from '../env';
import { getUserScopedClient } from '../lib/neonClients';
import { logger } from '../lib/logger';

const JWT_SECRET = requireEnv('JWT_SECRET');

const ACCOUNT_STATUS_CACHE_TTL_MS = 60_000;

const REVOCATION_CACHE_TTL_MS = 5_000;
interface RevocationCacheEntry {
  cachedAt: number;
}
const revocationCache = new Map<string, RevocationCacheEntry>();

export function evictRevocationCache(jti: string): void {
  revocationCache.delete(jti);
}

interface AccountStatusEntry {
  status: string;
  cachedAt: number;
}
const accountStatusCache = new Map<string, AccountStatusEntry>();

interface VerifiedPrincipal {
  payload: jwt.JwtPayload;
  surface: CloudSurfaceClass;
}

async function verifyGatewayOrClerkToken(token: string): Promise<VerifiedPrincipal> {
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
      payload: {
        userId: claims.sub,
        email: emailClaim,
        sub: claims.sub,
      },
      surface: 'app',
    };
  }

  const payload = jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'agiworkforce-api-gateway',
    audience: 'agiworkforce',
  }) as jwt.JwtPayload;

  const claimedSurface = typeof payload['surface'] === 'string' ? payload['surface'] : null;
  return { payload, surface: claimedSurface === 'app' ? 'app' : 'developer' };
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

setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of accountStatusCache) {
    if (now - entry.cachedAt > ACCOUNT_STATUS_CACHE_TTL_MS) {
      accountStatusCache.delete(userId);
    }
  }
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
    const parts = authHeader?.split(' ');
    const token = parts?.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : undefined;

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const { payload, surface } = await verifyGatewayOrClerkToken(token);
    req.user = { ...authenticatedUserSchema.parse(payload), token, surface };

    if (typeof payload.jti === 'string' && payload.jti.length > 0) {
      const jti = payload.jti;
      const cached = revocationCache.get(jti);
      const cacheStale = !cached || Date.now() - cached.cachedAt > REVOCATION_CACHE_TTL_MS;

      if (cacheStale) {
        try {
          const { data: revokedRow, error: revokedError } = await getUserScopedClient(req.user)
            .from('revoked_jwts')
            .select('jti')
            .eq('jti', jti)
            .maybeSingle();

          if (revokedError) {
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

    const userId = req.user.userId;
    let accountStatus = getCachedAccountStatus(userId);

    if (accountStatus === null) {
      try {
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
    if (error instanceof jwt.TokenExpiredError) {
      res.status(403).json({ error: 'Token expired' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
