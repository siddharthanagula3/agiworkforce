
import rateLimit, { type Options, type Store, ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler, Request } from 'express';
import { BILLING_PLAN_PRODUCT_LIMITS, getPlanMaxConcurrentTurns } from '@agiworkforce/types';
import { logger } from '../lib/logger';

let _sharedStore: Store | undefined;
let _storeInitialized = false;

export type RateLimitRedisResolution =
  | { url: string; reason: 'ok' }
  | { url: null; reason: 'unset' | 'not-a-redis-url' | 'rest-url-only' };

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RedisStore } = require('rate-limit-redis');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('ioredis');
    const client = new Redis(resolved.url);
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

export const rateLimitConfigs = {
  'credits-deduct': { windowMs: 60_000, max: 5 },
  'credits-balance': { windowMs: 60_000, max: 10 },
  'credits-check': { windowMs: 60_000, max: 10 },

  'device-register': { windowMs: 60_000, max: 10 },
  'device-status': { windowMs: 60_000, max: 60 },
  'device-command': { windowMs: 60_000, max: 30 },
  'device-list': { windowMs: 60_000, max: 30 },
  'device-delete': { windowMs: 60_000, max: 10 },

  heartbeat: { windowMs: 60_000, max: 600 },

  'sync-batch': { windowMs: 60_000, max: 30 },
  'sync-updates': { windowMs: 60_000, max: 60 },
  'sync-resolve': { windowMs: 60_000, max: 20 },
  'sync-status': { windowMs: 60_000, max: 60 },
  'sync-legacy': { windowMs: 60_000, max: 30 },

  'pairing-code': { windowMs: 60_000, max: 10 },

  'mobile-push-token': { windowMs: 60_000, max: 30 },
  'mobile-agent-status': { windowMs: 60_000, max: 60 },
  'mobile-feedback': { windowMs: 60_000, max: 10 },

  'mcp-list': { windowMs: 60_000, max: 30 },
  'mcp-call': { windowMs: 60_000, max: 20 },

  'cloud-chat-list': { windowMs: 60_000, max: 60 },
  'cloud-chat-create': { windowMs: 60_000, max: 30 },
  'cloud-chat-get': { windowMs: 60_000, max: 60 },
  'cloud-chat-delete': { windowMs: 60_000, max: 10 },
  'cloud-chat-patch': { windowMs: 60_000, max: 30 },
  'cloud-chat-send': { windowMs: 60_000, max: 30 },

  'usage-summary': { windowMs: 60_000, max: 30 },
  'usage-history': { windowMs: 60_000, max: 10 },

  'enterprise-organizations': { windowMs: 60_000, max: 30 },
  'enterprise-policy': { windowMs: 60_000, max: 30 },
  'enterprise-audit-events': { windowMs: 60_000, max: 10 },
  'enterprise-usage-ledger': { windowMs: 60_000, max: 10 },
  'enterprise-support-case': { windowMs: 60_000, max: 5 },

  'llm-completions': { windowMs: 60_000, max: 30 },

  health: { windowMs: 60_000, max: 100 },
  status: { windowMs: 60_000, max: 100 },
  default: { windowMs: 60_000, max: 100 },
} as const;

let _multiInstanceWarned = false;
export function warnIfMultiInstanceWithoutRedis(): void {
  if (_multiInstanceWarned) return;
  _multiInstanceWarned = true;

  const flyAppName = process.env['FLY_APP_NAME'];
  const flyMachineCount = Number(process.env['FLY_MACHINE_COUNT'] ?? '0');
  const numInstancesHint = Number(process.env['NUM_INSTANCES'] ?? '0');
  const explicitMulti = process.env['RATE_LIMIT_MULTI_INSTANCE'] === '1';
  const redisConfigured = resolveRateLimitRedisUrl().reason === 'ok';

  const looksMultiInstance =
    explicitMulti ||
    flyMachineCount > 1 ||
    numInstancesHint > 1 ||
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

const TIER_SCALED_KEYS: ReadonlySet<RateLimitKey> = new Set<RateLimitKey>([
  'llm-completions',
  'cloud-chat-list',
  'cloud-chat-create',
  'cloud-chat-get',
  'cloud-chat-patch',
  'cloud-chat-send',
]);

const MAX_TIER_CONCURRENCY = Math.max(
  1,
  ...Object.values(BILLING_PLAN_PRODUCT_LIMITS).map((limits) =>
    typeof limits.maxConcurrentTurns === 'number' ? limits.maxConcurrentTurns : 0,
  ),
);

function tierConcurrency(planTier: string | null | undefined): number {
  if (!planTier) return 1;
  const advertised = getPlanMaxConcurrentTurns(planTier);
  if (advertised === null) return MAX_TIER_CONCURRENCY;
  return advertised > 0 ? advertised : 1;
}

export function resolveTierRateLimitMax(
  key: RateLimitKey,
  planTier: string | null | undefined,
): number {
  const base = rateLimitConfigs[key].max;
  if (!TIER_SCALED_KEYS.has(key)) return base;
  const concurrency = tierConcurrency(planTier);
  return Math.max(base * concurrency, concurrency);
}

function keyGenerator(req: Request): string {
  const userId = req.user?.userId;
  if (userId) {
    return `user:${userId}`;
  }

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
    max: tierScaled ? (req: Request) => resolveTierRateLimitMax(key, req.planTier) : config.max,
    ...(store ? { store } : {}),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
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

