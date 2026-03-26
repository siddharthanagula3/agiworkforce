/**
 * @file Rate Limiting Middleware for API Gateway
 * @security
 * - Prevents abuse and DoS attacks on API endpoints
 * - Uses express-rate-limit with in-memory store (suitable for single-instance deployments)
 * - For distributed deployments, consider using Redis store
 *
 * Rate limit rationale (OWASP compliant):
 * - Financial endpoints (credits): Strictest limits (5-10/min) to prevent abuse
 * - Device registration: Moderate limits (10/min) to prevent enumeration attacks
 * - Operational endpoints: Higher limits (30-60/min) for normal usage
 * - Heartbeat: High limits (600/min = 10/sec) for real-time status
 * - Health checks: Moderate limits (100/min) for monitoring
 */

import rateLimit, { type Options, ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler, Request } from 'express';
import { logger } from '../lib/logger';

/**
 * Rate limit configurations per endpoint category.
 * Each configuration specifies:
 * - windowMs: Time window in milliseconds
 * - max: Maximum requests allowed within the window
 */
export const rateLimitConfigs = {
  // Credit endpoints: strictest limits - financial operations are high-value targets
  // SECURITY: 5 deductions per minute prevents rapid credit drain attacks
  'credits-deduct': { windowMs: 60_000, max: 5 },
  // SECURITY: 10 balance/check requests per minute - read operations, slightly less strict
  'credits-balance': { windowMs: 60_000, max: 10 },
  'credits-check': { windowMs: 60_000, max: 10 },

  // Device registration: moderate limits - prevents device enumeration attacks
  // SECURITY: 10 registrations per minute limits fake device creation
  'device-register': { windowMs: 60_000, max: 10 },
  // SECURITY: Status checks are read-only, allow 60/min for responsive UX
  'device-status': { windowMs: 60_000, max: 60 },
  // SECURITY: Commands are actions, limit to 30/min to prevent automation abuse
  'device-command': { windowMs: 60_000, max: 30 },
  // SECURITY: Device listing is read-only, allow 30/min
  'device-list': { windowMs: 60_000, max: 30 },
  // SECURITY: Device deletion is destructive, limit to 10/min
  'device-delete': { windowMs: 60_000, max: 10 },

  // Heartbeat: high limit - needed for real-time status updates
  // SECURITY: 600/min (10/sec) allows frequent heartbeats without abuse
  heartbeat: { windowMs: 60_000, max: 600 },

  // Sync endpoints: moderate limits for batch operations
  // SECURITY: Batch operations can be resource-intensive, limit to 30/min
  'sync-batch': { windowMs: 60_000, max: 30 },
  // SECURITY: Polling for updates, allow 60/min for responsive sync
  'sync-updates': { windowMs: 60_000, max: 60 },
  // SECURITY: Conflict resolution is rare, limit to 20/min
  'sync-resolve': { windowMs: 60_000, max: 20 },
  // SECURITY: Status checks are lightweight, allow 60/min
  'sync-status': { windowMs: 60_000, max: 60 },
  // SECURITY: Legacy sync endpoints, moderate limit
  'sync-legacy': { windowMs: 60_000, max: 30 },

  // Pairing code: strict - prevents enumeration attacks on pairing codes
  // SECURITY: 10 pairing requests per minute limits brute-force attempts
  'pairing-code': { windowMs: 60_000, max: 10 },

  // Mobile endpoints
  // SECURITY: Push token updates are infrequent, 30/min is sufficient
  'mobile-push-token': { windowMs: 60_000, max: 30 },
  // SECURITY: Agent status is read-only polling, allow 60/min for responsive dashboard
  'mobile-agent-status': { windowMs: 60_000, max: 60 },
  // SECURITY: Feedback submission is infrequent, 10/min prevents spam
  'mobile-feedback': { windowMs: 60_000, max: 10 },

  // MCP endpoints: moderate limits for tool interactions
  // SECURITY: Listing tools is read-only, allow 30/min
  'mcp-list': { windowMs: 60_000, max: 30 },
  // SECURITY: Calling tools can be resource-intensive, limit to 20/min
  'mcp-call': { windowMs: 60_000, max: 20 },

  // Cloud chat endpoints
  // SECURITY: Listing conversations is read-only, allow 60/min
  'cloud-chat-list': { windowMs: 60_000, max: 60 },
  // SECURITY: Creating conversations is a write operation, limit to 30/min
  'cloud-chat-create': { windowMs: 60_000, max: 30 },
  // SECURITY: Getting a single conversation is read-only, allow 60/min
  'cloud-chat-get': { windowMs: 60_000, max: 60 },
  // SECURITY: Deleting conversations is destructive, limit to 10/min
  'cloud-chat-delete': { windowMs: 60_000, max: 10 },
  // SECURITY: Patching conversation metadata is a moderate write, limit to 30/min
  'cloud-chat-patch': { windowMs: 60_000, max: 30 },
  // SECURITY: Sending messages is action-based, limit to 30/min
  'cloud-chat-send': { windowMs: 60_000, max: 30 },

  // Usage endpoints: read-only billing data
  // SECURITY: 30/min allows dashboard polling without undue DB load
  'usage-summary': { windowMs: 60_000, max: 30 },
  // SECURITY: History is a heavier aggregate; restrict to 10/min to protect DB
  'usage-history': { windowMs: 60_000, max: 10 },

  // LLM proxy: tier-aware limit (enforced at 30/min baseline; pro users get higher via plan gate)
  // SECURITY: 30/min prevents runaway API cost from compromised tokens
  'llm-completions': { windowMs: 60_000, max: 30 },

  // Health/default: lenient for monitoring
  // SECURITY: Health checks from monitoring systems, allow 100/min
  health: { windowMs: 60_000, max: 100 },
  // SECURITY: Status checks (database connectivity) are read-only, allow 100/min
  status: { windowMs: 60_000, max: 100 },
  // Dotfile config endpoints: read-only, allow 60/min
  // SECURITY: Dotfile reads are unauthenticated config lookups, moderate limit
  'dotfile-read': { windowMs: 60_000, max: 60 },

  // SECURITY: Default fallback for unlisted endpoints
  default: { windowMs: 60_000, max: 100 },
} as const;
// TODO(scaling): When deploying multiple API gateway instances behind a load balancer,
// migrate to a Redis-backed store using `rate-limit-redis` to enforce global rate limits:
//   import RedisStore from 'rate-limit-redis';
//   import { createClient } from 'redis';
//   const client = createClient({ url: process.env.REDIS_URL });
//   store: new RedisStore({ sendCommand: (...args) => client.sendCommand(args) })

export type RateLimitKey = keyof typeof rateLimitConfigs;

/**
 * Extract identifier for rate limiting.
 * Uses user ID from JWT if available, otherwise falls back to IP address.
 * This prevents authenticated users from being blocked by other users on the same IP.
 */
function keyGenerator(req: Request): string {
  // Prefer user ID from authenticated request
  const userId = req.user?.userId;
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address for unauthenticated requests
  // Use ipKeyGenerator to normalize IPv6 addresses (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  const ip = req.ip || 'unknown';
  return `ip:${ipKeyGenerator(ip)}`;
}

/**
 * Create a rate limiter middleware for a specific endpoint category.
 *
 * @param key - The rate limit configuration key
 * @returns Express middleware that enforces rate limiting
 *
 * @example
 * // Apply to a route
 * router.post('/deduct', createRateLimiter('credits-deduct'), handler);
 */
export function createRateLimiter(key: RateLimitKey): RequestHandler {
  const config = rateLimitConfigs[key];

  const options: Partial<Options> = {
    windowMs: config.windowMs,
    max: config.max,
    // Return rate limit info in standard headers (RFC 6585)
    standardHeaders: true,
    // Disable deprecated X-RateLimit-* headers
    legacyHeaders: false,
    // Custom key generator for user-based rate limiting
    keyGenerator,
    // Custom response for rate limit exceeded
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Please try again after ${Math.ceil(config.windowMs / 1000)} seconds.`,
      retryAfter: Math.ceil(config.windowMs / 1000),
    },
    handler: (req, res, _next, _optionsUsed) => {
      const userId = req.user?.userId ?? null;
      const ip = req.ip || 'unknown';

      logger.warn(
        {
          event: 'rate_limit_exceeded',
          limiterKey: key,
          method: req.method,
          path: req.path,
          userId,
          ip,
          correlationId: req.headers['x-correlation-id'],
          retryAfterSeconds: Math.ceil(config.windowMs / 1000),
        },
        'Rate limit exceeded',
      );

      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please try again after ${Math.ceil(config.windowMs / 1000)} seconds.`,
        retryAfter: Math.ceil(config.windowMs / 1000),
      });
    },
    // Skip rate limiting for internal health checks from localhost in development
    skip: (req: Request) => {
      if (process.env.NODE_ENV === 'development' && key === 'health') {
        const ip = req.ip || '';
        return ip === '127.0.0.1' || ip === '::1';
      }
      return false;
    },
  };

  return rateLimit(options);
}

// Note: Express Request.user type is declared in auth.ts via AuthenticatedUser
