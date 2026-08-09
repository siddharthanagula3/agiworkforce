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

import rateLimit, { type Options, type Store, ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler, Request } from 'express';
import { BILLING_PLAN_PRODUCT_LIMITS, getPlanMaxConcurrentTurns } from '@agiworkforce/types';
import { logger } from '../lib/logger';

let _sharedStore: Store | undefined;
let _storeInitialized = false;

export type RateLimitRedisResolution =
  | { url: string; reason: 'ok' }
  | { url: null; reason: 'unset' | 'not-a-redis-url' | 'rest-url-only' };

/**
 * Resolve the URL the ioredis-backed store may use.
 *
 * `ioredis` speaks the Redis wire protocol, so only a `redis://`/`rediss://`
 * URL can produce a working client. `UPSTASH_REDIS_REST_URL` is an HTTPS REST
 * endpoint for a different client (`@upstash/redis`) and carries no password,
 * so the previous `??` fallback handed `new Redis()` a URL it can never
 * connect with: the store construction looked successful, every command then
 * failed, and the gateway silently ran per-instance memory limits on a deploy
 * whose env vars said Redis was configured. Refuse the REST URL instead, and
 * say which variable to set.
 */
export function resolveRateLimitRedisUrl(
  env: NodeJS.ProcessEnv = process.env,
): RateLimitRedisResolution {
  const configured = env['RATE_LIMIT_REDIS_URL']?.trim();
  if (configured) {
    if (/^rediss?:\/\//i.test(configured)) return { url: configured, reason: 'ok' };
    return { url: null, reason: 'not-a-redis-url' };
  }
  if (env['UPSTASH_REDIS_REST_URL']?.trim()) return { url: null, reason: 'rest-url-only' };
  return { url: null, reason: 'unset' };
}

const REDIS_SETUP_HINT =
  'Set RATE_LIMIT_REDIS_URL to a rediss:// endpoint (Upstash exposes one alongside its REST URL).';

function getOrCreateStore(): Store | undefined {
  if (_storeInitialized) return _sharedStore;
  _storeInitialized = true;

  const resolved = resolveRateLimitRedisUrl();
  if (resolved.reason !== 'ok') {
    // A misconfigured variable is worth saying out loud everywhere; a simply
    // absent one only matters in production.
    if (resolved.reason !== 'unset' || process.env.NODE_ENV === 'production') {
      logger.warn(
        { reason: resolved.reason },
        'Rate limiter has no usable Redis URL — using in-memory rate limiting (P1-23). ' +
          'This is NOT suitable for multi-instance production deployments. ' +
          REDIS_SETUP_HINT,
      );
    }
    return undefined;
  }

  try {
    // Dynamic import at init-time to keep ioredis + rate-limit-redis optional.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RedisStore } = require('rate-limit-redis');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('ioredis');
    const client = new Redis(resolved.url);
    // ioredis rethrows connection errors as uncaught exceptions when nothing
    // listens, which would take the gateway down for a degraded limiter.
    client.on('error', (error: unknown) => {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Rate limit Redis connection error — limits degrade to per-instance counts.',
      );
    });
    _sharedStore = new RedisStore({
      sendCommand: (...args: string[]) => client.call(...args),
    });
    logger.info('Rate limiter using Redis store — global limits enforced across instances.');
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Failed to initialize Redis rate limit store — falling back to in-memory.',
    );
  }
  return _sharedStore;
}

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

  // Enterprise control-plane endpoints
  // SECURITY: Organization and policy reads are admin dashboard operations.
  'enterprise-organizations': { windowMs: 60_000, max: 30 },
  'enterprise-policy': { windowMs: 60_000, max: 30 },
  // SECURITY: Audit and usage ledgers can be heavier DB reads.
  'enterprise-audit-events': { windowMs: 60_000, max: 10 },
  'enterprise-usage-ledger': { windowMs: 60_000, max: 10 },
  // SECURITY: Support case creation is write/spam-sensitive.
  'enterprise-support-case': { windowMs: 60_000, max: 5 },

  // LLM proxy: base ceiling. Scaled by plan via TIER_SCALED_KEYS wherever the
  // route resolves `req.planTier` before the limiter runs.
  // SECURITY: 30/min prevents runaway API cost from compromised tokens
  'llm-completions': { windowMs: 60_000, max: 30 },

  // Health/default: lenient for monitoring
  // SECURITY: Health checks from monitoring systems, allow 100/min
  health: { windowMs: 60_000, max: 100 },
  // SECURITY: Status checks (database connectivity) are read-only, allow 100/min
  status: { windowMs: 60_000, max: 100 },
  // SECURITY: Default fallback for unlisted endpoints
  default: { windowMs: 60_000, max: 100 },
} as const;
// Redis store is now wired via getOrCreateStore(). Set RATE_LIMIT_REDIS_URL or
// UPSTASH_REDIS_REST_URL to enable global rate limiting across instances.
// Without Redis the library falls back to its built-in MemoryStore (per-instance).

/**
 * Multi-instance gap (P1-23, audit 2026-05-08).
 *
 * `express-rate-limit` defaults to an in-memory `MemoryStore`, which means
 * each gateway instance counts its own requests. With N instances behind a
 * load balancer the effective limit per user is N × max. That makes the
 * limits above mostly cosmetic in any horizontally-scaled deployment.
 *
 * Until Redis migration ships, surface this gap loudly at startup if the
 * deploy environment hints at multi-instance scaling (Fly.io with >1 VM,
 * a literal NUM_INSTANCES env override, or a generic `RATE_LIMIT_REDIS_URL`
 * being unset while a hint variable is present). The warning is non-fatal
 * — the service still starts — but it lands in the structured log so
 * ops sees it on the first request after deploy.
 *
 * Call this once from `index.ts` before mounting routes. Idempotent.
 */
let _multiInstanceWarned = false;
export function warnIfMultiInstanceWithoutRedis(): void {
  if (_multiInstanceWarned) return;
  _multiInstanceWarned = true;

  const flyAppName = process.env['FLY_APP_NAME'];
  const flyMachineCount = Number(process.env['FLY_MACHINE_COUNT'] ?? '0');
  const numInstancesHint = Number(process.env['NUM_INSTANCES'] ?? '0');
  const explicitMulti = process.env['RATE_LIMIT_MULTI_INSTANCE'] === '1';
  // Ask the same resolver the store uses: a REST-only or malformed URL makes
  // the variable present but the store per-instance, which is exactly the
  // situation this alarm exists to surface.
  const redisConfigured = resolveRateLimitRedisUrl().reason === 'ok';

  const looksMultiInstance =
    explicitMulti ||
    flyMachineCount > 1 ||
    numInstancesHint > 1 ||
    // Fly.io scales by region; even a single FLY_APP_NAME with no count
    // hint commonly runs >=2 machines for HA. Don't trigger on FLY_APP_NAME
    // alone — the count/explicit hints are the signal.
    false;

  if (!looksMultiInstance) return;

  if (redisConfigured) return;

  logger.warn(
    {
      flyAppName,
      flyMachineCount: flyMachineCount > 0 ? flyMachineCount : undefined,
      numInstancesHint: numInstancesHint > 0 ? numInstancesHint : undefined,
      explicitMulti,
      redisConfigured,
    },
    'rateLimit: multi-instance deployment detected without RATE_LIMIT_REDIS_URL — limits are per-instance only. Per-user effective limit is N × max where N = instance count. See P1-23 in services audit; migrate to rate-limit-redis before paid-tier launch.',
  );
}

export type RateLimitKey = keyof typeof rateLimitConfigs;

/**
 * Per-user ceilings that must scale with the plan the caller bought.
 *
 * Every `max` above is flat, so a Max 15x subscriber sold 12 concurrent
 * managed turns was handed the same 30 completions/min as a Free user — the
 * paid concurrency is unreachable through the limiter sitting in front of it.
 * Only per-user, post-authentication keys belong here: pre-auth and
 * IP-bucketed limits have no trustworthy tier to read, and security limits
 * (credits, device, auth) must not widen just because someone spends more.
 *
 * Scaling only takes effect where the tier is already resolved before the
 * limiter runs — `requireManagedChatPlan` sets `req.planTier` on the cloud-chat
 * router. Keys whose routes resolve the tier later fall back to the base
 * ceiling rather than guessing.
 */
const TIER_SCALED_KEYS: ReadonlySet<RateLimitKey> = new Set<RateLimitKey>([
  'llm-completions',
  'cloud-chat-list',
  'cloud-chat-create',
  'cloud-chat-get',
  'cloud-chat-patch',
  'cloud-chat-send',
]);

/**
 * Highest concurrency any tier advertises. Tiers that declare themselves
 * uncapped ('unlimited'/'custom') still need a request ceiling, so they borrow
 * this one instead of going unbounded.
 *
 * The `1` is not decoration. Without it, a catalog in which no tier states a
 * NUMERIC concurrency reduces this to 0, and Enterprise — whose 'custom' value
 * lands on exactly this branch — would resolve to a ceiling of zero requests
 * and be locked out of the product entirely. That is the same
 * contract-collapses-to-zero failure the limit conversion is written to avoid;
 * an uncapped tier must never be MORE restricted than a capped one.
 */
const MAX_TIER_CONCURRENCY = Math.max(
  1,
  ...Object.values(BILLING_PLAN_PRODUCT_LIMITS).map((limits) =>
    typeof limits.maxConcurrentTurns === 'number' ? limits.maxConcurrentTurns : 0,
  ),
);

/** The catalog's advertised concurrency for `planTier`, as a usable multiplier. */
function tierConcurrency(planTier: string | null | undefined): number {
  if (!planTier) return 1;
  const advertised = getPlanMaxConcurrentTurns(planTier);
  if (advertised === null) return MAX_TIER_CONCURRENCY;
  // 0 means the catalog did not recognise the tier; stay on the base ceiling.
  return advertised > 0 ? advertised : 1;
}

/**
 * Ceiling for `key` under `planTier`. The billing catalog is the single source
 * of truth for how much more a paid tier may do, so the multiplier IS the
 * tier's advertised concurrency; the floor guarantees a tier can always drive
 * the turns it was sold even if a base ceiling is later lowered below it.
 */
export function resolveTierRateLimitMax(
  key: RateLimitKey,
  planTier: string | null | undefined,
): number {
  const base = rateLimitConfigs[key].max;
  if (!TIER_SCALED_KEYS.has(key)) return base;
  const concurrency = tierConcurrency(planTier);
  return Math.max(base * concurrency, concurrency);
}

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

  const store = getOrCreateStore();

  const tierScaled = TIER_SCALED_KEYS.has(key);

  const options: Partial<Options> = {
    windowMs: config.windowMs,
    // Resolved per request so a route that establishes `req.planTier` upstream
    // (planGate) gets the tier ceiling without re-declaring its limiter.
    max: tierScaled ? (req: Request) => resolveTierRateLimitMax(key, req.planTier) : config.max,
    ...(store ? { store } : {}),
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
