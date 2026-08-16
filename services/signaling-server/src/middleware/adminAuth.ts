
import type { Request, Response, NextFunction } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { logger } from '../logger.js';

const ADMIN_API_KEY = process.env['ADMIN_API_KEY'];

const MAX_AUTH_FAILURES = Number(process.env['MAX_AUTH_FAILURES'] ?? 10);

const AUTH_LOCKOUT_DURATION_MS = Number(process.env['AUTH_LOCKOUT_DURATION_MS'] ?? 900_000);

const AUTH_FAILURE_WINDOW_MS = Number(process.env['AUTH_FAILURE_WINDOW_MS'] ?? 3600_000);

interface AuthFailureEntry {
  failures: number;
  firstFailure: number;
  lockedUntil: number | null;
}

const authFailures = new Map<string, AuthFailureEntry>();

function getClientIp(req: Request): string {
  const trustProxy =
    req.app.get('trust proxy') === true ||
    process.env['TRUST_PROXY'] === 'true' ||
    process.env['TRUST_PROXY'] === '1';

  if (trustProxy) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
      const ip = ips?.trim();
      if (ip) return ip;
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? (realIp[0] ?? 'unknown') : realIp;
    }
  }

  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

const COMPARE_KEY = randomBytes(32);

function secureCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHmac('sha256', COMPARE_KEY).update(a).digest();
  const hb = createHmac('sha256', COMPARE_KEY).update(b).digest();
  return timingSafeEqual(ha, hb);
}

function recordAuthFailure(ip: string): void {
  const now = Date.now();
  let entry = authFailures.get(ip);

  if (!entry || now - entry.firstFailure > AUTH_FAILURE_WINDOW_MS) {
    entry = {
      failures: 1,
      firstFailure: now,
      lockedUntil: null,
    };
  } else {
    entry.failures++;

    if (entry.failures >= MAX_AUTH_FAILURES && !entry.lockedUntil) {
      entry.lockedUntil = now + AUTH_LOCKOUT_DURATION_MS;
      logger.warn({ ip, failures: entry.failures }, 'IP locked out due to auth failures');
    }
  }

  authFailures.set(ip, entry);
}

function isLockedOut(ip: string): { locked: boolean; retryAfter?: number } {
  const entry = authFailures.get(ip);
  if (!entry || !entry.lockedUntil) {
    return { locked: false };
  }

  const now = Date.now();
  if (entry.lockedUntil <= now) {
    authFailures.delete(ip);
    return { locked: false };
  }

  return {
    locked: true,
    retryAfter: Math.ceil((entry.lockedUntil - now) / 1000),
  };
}

function clearAuthFailure(ip: string): void {
  authFailures.delete(ip);
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);

  const lockoutStatus = isLockedOut(ip);
  if (lockoutStatus.locked) {
    res.setHeader('Retry-After', String(lockoutStatus.retryAfter));
    res.status(429).json({
      error: 'TOO_MANY_AUTH_FAILURES',
      message: 'Too many authentication failures. Please try again later.',
      retryAfter: lockoutStatus.retryAfter,
    });
    return;
  }

  if (!ADMIN_API_KEY) {
    logger.warn({ ip }, 'Admin endpoint accessed but ADMIN_API_KEY not configured');
    res.status(503).json({
      error: 'ADMIN_NOT_CONFIGURED',
      message: 'Admin endpoints are not configured.',
    });
    return;
  }

  let apiKey: string | undefined;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    apiKey = authHeader.slice(7).trim();
  }

  if (!apiKey) {
    const xApiKey = req.headers['x-api-key'];
    if (xApiKey) {
      apiKey = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
    }
  }

  if (!apiKey) {
    recordAuthFailure(ip);
    logger.warn({ ip }, 'Admin auth failed: no API key provided');
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'API key required. Use Authorization: Bearer <key> or X-API-Key header.',
    });
    return;
  }

  if (!secureCompare(apiKey, ADMIN_API_KEY)) {
    recordAuthFailure(ip);
    logger.warn({ ip }, 'Admin auth failed: invalid API key');
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid API key.',
    });
    return;
  }

  clearAuthFailure(ip);
  next();
}

export function isAdminEnabled(): boolean {
  return Boolean(ADMIN_API_KEY);
}

export function getAuthStats(): {
  trackedIps: number;
  lockedOutIps: number;
} {
  let lockedOutIps = 0;
  const now = Date.now();

  for (const entry of authFailures.values()) {
    if (entry.lockedUntil && entry.lockedUntil > now) {
      lockedOutIps++;
    }
  }

  return {
    trackedIps: authFailures.size,
    lockedOutIps,
  };
}

export function cleanupAuthFailures(): void {
  const now = Date.now();
  for (const [ip, entry] of authFailures.entries()) {
    if (now - entry.firstFailure > AUTH_FAILURE_WINDOW_MS) {
      if (!entry.lockedUntil || entry.lockedUntil <= now) {
        authFailures.delete(ip);
      }
    }
  }

  if (authFailures.size > 10_000) {
    const entries = [...authFailures.entries()].sort(
      (a, b) => a[1].firstFailure - b[1].firstFailure,
    );
    const excess = entries.slice(0, authFailures.size - 5_000);
    for (const [ip] of excess) {
      authFailures.delete(ip);
    }
  }
}
