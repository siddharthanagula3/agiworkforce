/**
 * @file Admin Authentication Middleware
 * @description Provides API key authentication for admin endpoints.
 *
 * @security
 * - Validates API key from Authorization header or X-API-Key header
 * - Uses constant-time comparison to prevent timing attacks
 * - Logs authentication failures for monitoring
 * - Rate limits authentication attempts
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { logger } from '../logger.js';

// =============================================================================
// Configuration
// =============================================================================

/** Admin API key from environment */
const ADMIN_API_KEY = process.env['ADMIN_API_KEY'];

/** Maximum failed auth attempts before temporary lockout */
const MAX_AUTH_FAILURES = Number(process.env['MAX_AUTH_FAILURES'] ?? 10);

/** Auth failure lockout duration in milliseconds (default: 15 minutes) */
const AUTH_LOCKOUT_DURATION_MS = Number(process.env['AUTH_LOCKOUT_DURATION_MS'] ?? 900_000);

/** Auth failure tracking window in milliseconds (default: 1 hour) */
const AUTH_FAILURE_WINDOW_MS = Number(process.env['AUTH_FAILURE_WINDOW_MS'] ?? 3600_000);

// =============================================================================
// Types
// =============================================================================

interface AuthFailureEntry {
  failures: number;
  firstFailure: number;
  lockedUntil: number | null;
}

// =============================================================================
// State
// =============================================================================

/** Track auth failures per IP */
const authFailures = new Map<string, AuthFailureEntry>();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Extract client IP from request
 */
function getClientIp(req: Request): string {
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

  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(a); // Compare a to itself
    timingSafeEqual(bufA, bufB);
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * Record an authentication failure
 */
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

/**
 * Check if IP is locked out
 */
function isLockedOut(ip: string): { locked: boolean; retryAfter?: number } {
  const entry = authFailures.get(ip);
  if (!entry || !entry.lockedUntil) {
    return { locked: false };
  }

  const now = Date.now();
  if (entry.lockedUntil <= now) {
    // Lockout expired, reset
    authFailures.delete(ip);
    return { locked: false };
  }

  return {
    locked: true,
    retryAfter: Math.ceil((entry.lockedUntil - now) / 1000),
  };
}

/**
 * Clear auth failure record on successful auth
 */
function clearAuthFailure(ip: string): void {
  authFailures.delete(ip);
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Admin authentication middleware
 *
 * Validates API key from:
 * 1. Authorization: Bearer <key>
 * 2. X-API-Key: <key>
 *
 * If ADMIN_API_KEY is not configured, all admin requests are denied.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);

  // Check for lockout
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

  // Check if admin API key is configured
  if (!ADMIN_API_KEY) {
    logger.warn({ ip }, 'Admin endpoint accessed but ADMIN_API_KEY not configured');
    res.status(503).json({
      error: 'ADMIN_NOT_CONFIGURED',
      message: 'Admin endpoints are not configured.',
    });
    return;
  }

  // Extract API key from headers
  let apiKey: string | undefined;

  // Check Authorization header (Bearer token)
  // Note: Using startsWith + slice instead of regex to avoid ReDoS vulnerability
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    apiKey = authHeader.slice(7).trim();
  }

  // Fall back to X-API-Key header
  if (!apiKey) {
    const xApiKey = req.headers['x-api-key'];
    if (xApiKey) {
      apiKey = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
    }
  }

  // Validate API key
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

  // Authentication successful
  clearAuthFailure(ip);
  next();
}

/**
 * Check if admin endpoints are enabled (API key configured)
 */
export function isAdminEnabled(): boolean {
  return Boolean(ADMIN_API_KEY);
}

/**
 * Get auth failure stats for monitoring
 */
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

/**
 * Cleanup old auth failure entries
 */
export function cleanupAuthFailures(): void {
  const now = Date.now();
  for (const [ip, entry] of authFailures.entries()) {
    if (now - entry.firstFailure > AUTH_FAILURE_WINDOW_MS) {
      if (!entry.lockedUntil || entry.lockedUntil <= now) {
        authFailures.delete(ip);
      }
    }
  }
}
