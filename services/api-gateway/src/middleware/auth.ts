import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '@clerk/backend';
import jwt from 'jsonwebtoken';
import {
  authenticatedUserSchema,
  type AuthenticatedRequestUser,
  type CloudSurfaceClass,
} from '../authenticated-user';
import { requireEnv } from '../env';
import {
  authDatabaseBreaker,
  clerkBreaker,
  isDependencyUnavailableError,
  retryAfterSeconds,
} from '../lib/dependencies';
import { getUserScopedClient, type CloudDbClient, type DbResult } from '../lib/neonClients';
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

    const claims = await clerkBreaker().execute(() => verifyToken(token, { secretKey }));
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

class AuthQueryError extends Error {
  constructor(readonly dbError: { message?: string } | null) {
    super(dbError?.message ?? 'auth query failed');
    this.name = 'AuthQueryError';
  }
}

// Runs an auth-path query behind the shared Neon breaker. The builder resolves
// `{ data, error }` instead of rejecting, so the error has to be rethrown or the
// breaker would score a failing database as healthy.
async function authDbQuery<T>(
  db: CloudDbClient,
  run: (client: CloudDbClient) => Promise<DbResult<T>>,
): Promise<T | null> {
  return authDatabaseBreaker().execute(async () => {
    const { data, error } = await run(db);
    if (error) throw new AuthQueryError(error);
    return data;
  });
}

/// The outcome of the two post-signature checks every authenticated entry point
/// owes: is this token revoked, and is this account still active. The WebSocket
/// path used to do neither, so a revoked token and a suspended account kept a
/// live socket for as long as they held it.
export type TokenUsability =
  | { ok: true }
  | { ok: false; reason: 'revoked'; code: 'TOKEN_REVOKED'; status: 401; message: string }
  | { ok: false; reason: 'inactive'; code: 'ACCOUNT_NOT_ACTIVE'; status: 403; message: string }
  | {
      ok: false;
      reason: 'unavailable';
      code: 'AUTH_CHECK_UNAVAILABLE';
      status: 503;
      message: string;
      error: unknown;
    };

export async function checkTokenUsable(
  jti: string | undefined,
  userId: string,
  db: () => CloudDbClient,
): Promise<TokenUsability> {
  if (typeof jti === 'string' && jti.length > 0) {
    const cached = revocationCache.get(jti);
    const cacheStale = !cached || Date.now() - cached.cachedAt > REVOCATION_CACHE_TTL_MS;
    if (cacheStale) {
      try {
        const revokedRow = await authDbQuery(db(), (client) =>
          client.from('revoked_jwts').select('jti').eq('jti', jti).maybeSingle(),
        );
        if (revokedRow) {
          return {
            ok: false,
            reason: 'revoked',
            code: 'TOKEN_REVOKED',
            status: 401,
            message: 'Token revoked',
          };
        }
        revocationCache.set(jti, { cachedAt: Date.now() });
      } catch (revocationCheckError) {
        logger.error(
          { error: revocationCheckError, jti },
          'Revocation check failed — failing closed',
        );
        return {
          ok: false,
          reason: 'unavailable',
          code: 'AUTH_CHECK_UNAVAILABLE',
          status: 503,
          message: 'Service temporarily unavailable. Please try again shortly.',
          error: revocationCheckError,
        };
      }
    }
  }

  let accountStatus = getCachedAccountStatus(userId);
  if (accountStatus === null) {
    try {
      const profile = await authDbQuery(db(), (client) =>
        client
          .from<{ account_status?: string }>('profiles')
          .select('account_status')
          .eq('id', userId)
          .single(),
      );
      const freshStatus = profile?.account_status ?? 'unknown';
      setCachedAccountStatus(userId, freshStatus);
      accountStatus = freshStatus;
    } catch (killSwitchError) {
      logger.error({ error: killSwitchError }, 'Kill switch DB check failed — failing closed');
      return {
        ok: false,
        reason: 'unavailable',
        code: 'AUTH_CHECK_UNAVAILABLE',
        status: 503,
        message: 'Service temporarily unavailable. Please try again shortly.',
        error: killSwitchError,
      };
    }
  }

  if (accountStatus !== 'active') {
    return {
      ok: false,
      reason: 'inactive',
      code: 'ACCOUNT_NOT_ACTIVE',
      status: 403,
      message: `Account ${accountStatus}. Contact support for assistance.`,
    };
  }

  return { ok: true };
}

function respondDependencyUnavailable(
  res: Response,
  error: unknown,
  code: 'IDENTITY_PROVIDER_UNAVAILABLE' | 'AUTH_CHECK_UNAVAILABLE',
): void {
  res.setHeader('Retry-After', String(retryAfterSeconds(error)));
  res.status(503).json({
    error: 'Service temporarily unavailable. Please try again shortly.',
    code,
  });
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

    let payload: jwt.JwtPayload;
    let surface: CloudSurfaceClass;
    try {
      ({ payload, surface } = await verifyGatewayOrClerkToken(token));
    } catch (verificationError) {
      if (isDependencyUnavailableError(verificationError)) {
        logger.error(
          { error: verificationError },
          'Identity provider unavailable — short-circuiting instead of waiting',
        );
        respondDependencyUnavailable(res, verificationError, 'IDENTITY_PROVIDER_UNAVAILABLE');
        return;
      }
      throw verificationError;
    }
    const authedUser = { ...authenticatedUserSchema.parse(payload), token, surface };
    req.user = authedUser;

    let dbClient: CloudDbClient | null = null;
    const db = (): CloudDbClient => (dbClient ??= getUserScopedClient(authedUser));

    const usability = await checkTokenUsable(
      typeof payload.jti === 'string' ? payload.jti : undefined,
      req.user.userId,
      db,
    );
    if (!usability.ok) {
      if (usability.reason === 'unavailable') {
        respondDependencyUnavailable(res, usability.error, usability.code);
        return;
      }
      res.status(usability.status).json({ error: usability.message, code: usability.code });
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
