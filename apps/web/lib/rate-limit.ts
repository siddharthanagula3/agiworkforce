import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';
import { logRateLimitExceeded } from './security-audit';

// Initialize Redis client (falls back to in-memory if not configured)
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// AUDIT-008-016: Rate limit configurations per endpoint
// failClosed: true = block requests when Redis unavailable (security-sensitive endpoints)
// failClosed: false = allow requests when Redis unavailable (business-critical endpoints)
// In production serverless environments, in-memory rate limiting is ineffective as each
// function instance has its own memory space. For security-sensitive endpoints, we fail
// closed (block requests) when Redis is unavailable to prevent abuse.
export const rateLimitConfigs = {
  checkout: {
    limit: 15,
    window: '1 m', // 15 requests per minute (allows retries and page refreshes)
    failClosed: false, // Allow checkout even if Redis fails - business critical
  },
  'credit-topup': {
    limit: 15,
    window: '1 m', // 15 top-up checkout sessions per minute (allows retries)
    failClosed: false, // Allow topup even if Redis fails - business critical
  },
  'device-link': {
    limit: 10,
    window: '1 m', // 10 device codes per minute (prevents abuse)
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'device-poll': {
    limit: 10,
    window: '1 s', // 10 requests per second
    failClosed: false,
  },
  'claim-offer': {
    limit: 3,
    window: '1 h', // 3 requests per hour
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  me: {
    limit: 60,
    window: '1 m', // 60 requests per minute
    failClosed: false,
  },
  'credits-balance': {
    limit: 60,
    window: '1 m', // 60 requests per minute (same as /me endpoint)
    failClosed: false,
  },
  'sync-subscription': {
    limit: 10,
    window: '1 m', // 10 requests per minute (increased for payment success polling)
    failClosed: false,
  },
  portal: {
    limit: 10,
    window: '1 m', // 10 portal requests per minute
    failClosed: false,
  },
  'health-check': {
    limit: 30,
    window: '1 m', // 30 requests per minute to prevent enumeration
    failClosed: false,
  },
  download: {
    limit: 30,
    window: '1 m', // 30 download requests per minute per IP
    failClosed: false,
  },
  'download-beta': {
    limit: 10,
    window: '1 m', // 10 beta download requests per minute per IP
    failClosed: false,
  },
  // Release check endpoints - generous limits for auto-update checks
  'release-check': {
    limit: 60,
    window: '1 m', // 60 update checks per minute per IP
    failClosed: false,
  },
  'release-latest': {
    limit: 60,
    window: '1 m', // 60 manifest fetches per minute per IP
    failClosed: false,
  },
  // Authentication endpoints - stricter limits to prevent brute force
  'auth-login': {
    limit: 5,
    window: '15 m', // 5 login attempts per 15 minutes per IP
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'auth-signup': {
    limit: 3,
    window: '1 h', // 3 signup attempts per hour per IP (prevent mass account creation)
    failClosed: true,
  },
  'auth-password-reset': {
    limit: 3,
    window: '1 h', // 3 password reset attempts per hour
    failClosed: true,
  },
  'auth-verify': {
    limit: 10,
    window: '1 m', // 10 verification attempts per minute
    failClosed: true,
  },
  // API key operations - critical security endpoints
  'api-key-create': {
    limit: 5,
    window: '1 h', // 5 API key creations per hour
    failClosed: true,
  },
  'api-key-revoke': {
    limit: 10,
    window: '1 m', // 10 revocations per minute (allow cleanup)
    failClosed: true,
  },
  // GDPR endpoints - sensitive data operations
  'user-data-delete': {
    limit: 3,
    window: '1 h', // 3 deletion requests per hour - irreversible operation
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  'user-data-export': {
    limit: 5,
    window: '1 h', // 5 export requests per hour - data portability
    failClosed: true, // Security-sensitive: block if Redis fails
  },
  // Chat API endpoints
  'chat-conversation': {
    limit: 60,
    window: '1 m', // 60 conversation operations per minute
    failClosed: false,
  },
  'chat-message': {
    limit: 20,
    window: '1 m', // 20 messages per minute (to prevent API abuse)
    failClosed: false,
  },
  // LLM completion endpoints - critical for cost control and abuse prevention
  'llm-completion': {
    limit: 30,
    window: '1 m', // 30 LLM requests per minute per user
    failClosed: true, // Security-sensitive: LLM API calls are expensive
  },
  'llm-streaming': {
    limit: 20,
    window: '1 m', // 20 streaming requests per minute (more intensive)
    failClosed: true, // Security-sensitive: streaming is resource-intensive
  },
  // Media generation endpoints - expensive operations
  'image-generation': {
    limit: 10,
    window: '1 m', // 10 image generation requests per minute (expensive operation)
    failClosed: true, // Security-sensitive: AI image generation is costly
  },
  'video-generation': {
    limit: 5,
    window: '1 m', // 5 video generation requests per minute (very expensive)
    failClosed: true, // Security-sensitive: AI video generation is very costly
  },
  'video-status': {
    limit: 30,
    window: '1 m', // 30 status poll requests per minute (allow frequent polling)
    failClosed: false, // Not sensitive: just querying status
  },
  default: {
    limit: 100,
    window: '1 m', // 100 requests per minute
    failClosed: false,
  },
} as const;

// In-memory rate limit store for fallback (not suitable for distributed systems)
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

// Configuration for in-memory store limits
const IN_MEMORY_MAX_ENTRIES = 10000; // Prevent unbounded memory growth under attack
const IN_MEMORY_CLEANUP_INTERVAL_MS = 60000; // Clean up every minute
let lastCleanupTime = Date.now();

// Log warning at startup if Redis is not configured in production
if (process.env.NODE_ENV === 'production' && !redis) {
  logger.error(
    {},
    'SECURITY WARNING: Redis not configured in production environment. ' +
      'In-memory rate limiting is NOT effective in serverless/distributed deployments. ' +
      'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.',
  );
}

/**
 * Parse window string to milliseconds
 */
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 60000; // Default 1 minute
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60000;
  }
}

/**
 * Clean up expired entries from the in-memory store.
 * Also enforces max entries limit to prevent memory exhaustion.
 */
function cleanupInMemoryStore(): void {
  const now = Date.now();

  // Remove expired entries (use Array.from for ES5 compatibility)
  const entries = Array.from(inMemoryStore.entries());
  for (const [k, v] of entries) {
    if (v.resetTime < now) {
      inMemoryStore.delete(k);
    }
  }

  // If still over limit after cleanup, remove oldest entries
  if (inMemoryStore.size > IN_MEMORY_MAX_ENTRIES) {
    const sortedEntries = Array.from(inMemoryStore.entries()).sort(
      (a, b) => a[1].resetTime - b[1].resetTime,
    );

    const toRemove = sortedEntries.length - IN_MEMORY_MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      inMemoryStore.delete(sortedEntries[i][0]);
    }

    logger.warn(
      { removed: toRemove, remaining: inMemoryStore.size },
      'In-memory rate limit store exceeded max entries, removed oldest entries',
    );
  }

  lastCleanupTime = now;
}

/**
 * In-memory rate limiter for development/fallback
 * Note: This is per-process and won't work correctly in distributed deployments
 */
function inMemoryRateLimit(
  id: string,
  limit: number,
  windowMs: number,
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const key = id;
  const entry = inMemoryStore.get(key);

  // Perform periodic cleanup (deterministic, time-based instead of random)
  if (now - lastCleanupTime > IN_MEMORY_CLEANUP_INTERVAL_MS) {
    cleanupInMemoryStore();
  }

  if (!entry || entry.resetTime < now) {
    // First request or window expired
    const resetTime = now + windowMs;
    inMemoryStore.set(key, { count: 1, resetTime });
    return { success: true, remaining: limit - 1, reset: resetTime };
  }

  if (entry.count >= limit) {
    // Rate limit exceeded
    return { success: false, remaining: 0, reset: entry.resetTime };
  }

  // Increment count
  entry.count++;
  return { success: true, remaining: limit - entry.count, reset: entry.resetTime };
}

type RateLimitKey = keyof typeof rateLimitConfigs;

/**
 * Module-level cache for rate limiter instances.
 * This prevents creating new Ratelimit instances on every request,
 * which significantly improves performance by reusing Redis connections.
 *
 * PERFORMANCE OPTIMIZATION: Ratelimit instances are expensive to create
 * because they set up Redis connection handlers. Caching them reduces
 * overhead from ~5-10ms per request to near-zero for subsequent requests.
 */
const rateLimiterCache = new Map<RateLimitKey, Ratelimit>();

/**
 * Get or create a rate limiter instance (only called when Redis is available)
 * Uses module-level caching to reuse instances across requests.
 */
function getRateLimiter(key: RateLimitKey): Ratelimit {
  // Return cached instance if available
  const cached = rateLimiterCache.get(key);
  if (cached) {
    return cached;
  }

  const config = rateLimitConfigs[key];

  if (!redis) {
    // This shouldn't be called when Redis is unavailable
    // but provide a safe fallback just in case
    throw new Error('Redis not configured for rate limiting');
  }

  // Create new instance and cache it
  const rateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
  });

  rateLimiterCache.set(key, rateLimiter);

  logger.info(
    { key, cacheSize: rateLimiterCache.size },
    'Created and cached new rate limiter instance',
  );

  return rateLimiter;
}

/**
 * Get identifier for rate limiting (user ID, IP, device ID, etc.)
 */
function getRateLimitIdentifier(request: NextRequest, identifier?: string): string {
  if (identifier) {
    return identifier;
  }

  // Try to get user ID from headers (set by middleware)
  const userId = request.headers.get('x-user-id');
  if (userId) {
    return `user:${userId}`;
  }

  // Fallback to IP address
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `ip:${ip}`;
}

/**
 * Rate limit info returned by check
 */
export interface RateLimitInfo {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  headers: Record<string, string>;
}

/**
 * Check rate limit without requiring handler wrapper
 * Useful for adding rate-limit headers to successful responses
 */
export async function checkRateLimit(
  request: NextRequest,
  key: RateLimitKey,
  identifier?: string,
): Promise<RateLimitInfo> {
  const config = rateLimitConfigs[key];
  const id = getRateLimitIdentifier(request, identifier);

  // Use in-memory rate limiting if Redis is not configured
  if (!redis) {
    const isProduction = process.env.NODE_ENV === 'production';

    // AUDIT-008-016: Fail-closed behavior for security-sensitive endpoints when Redis unavailable
    if (isProduction) {
      logger.error(
        { key, failClosed: config.failClosed },
        'SECURITY: Redis not configured in production - in-memory rate limiting is ineffective in distributed/serverless deployments',
      );

      // For security-sensitive endpoints (failClosed: true), block all requests when
      // Redis isn't available in production. In-memory rate limiting doesn't work across
      // serverless instances/edge functions because each instance has isolated memory.
      // This is a critical security measure to prevent brute force attacks.
      if (config.failClosed) {
        logger.warn(
          { key, identifier },
          'AUDIT-008-016: Blocking request to security-sensitive endpoint - Redis not configured in production',
        );
        return {
          success: false,
          limit: config.limit,
          remaining: 0,
          reset: Date.now() + 60000,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Error': 'rate-limiter-unavailable',
          },
        };
      }
    }

    const windowMs = parseWindow(config.window);
    const result = inMemoryRateLimit(id, config.limit, windowMs);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': config.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': new Date(result.reset).toISOString(),
    };

    if (!result.success) {
      headers['Retry-After'] = Math.ceil((result.reset - Date.now()) / 1000).toString();
    }

    return {
      success: result.success,
      limit: config.limit,
      remaining: result.remaining,
      reset: result.reset,
      headers,
    };
  }

  const rateLimiter = getRateLimiter(key);

  try {
    const { success, limit, remaining, reset } = await rateLimiter.limit(id);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(reset).toISOString(),
    };

    if (!success) {
      headers['Retry-After'] = Math.ceil((reset - Date.now()) / 1000).toString();
    }

    return {
      success,
      limit,
      remaining,
      reset,
      headers,
    };
  } catch (error) {
    logger.error({ error, key, identifier }, 'Rate limiting check error');

    // For security-sensitive endpoints, fail closed (block request)
    if (config.failClosed) {
      logger.warn(
        { key, identifier },
        'Rate limit check failed for security-sensitive endpoint, blocking request',
      );
      return {
        success: false,
        limit: config.limit,
        remaining: 0,
        reset: Date.now() + 60000,
        headers: {
          'Retry-After': '60',
        },
      };
    }

    // For non-sensitive endpoints, fail open with warning
    logger.warn({ key, identifier }, 'Rate limit check failed, allowing request (fail-open)');
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit,
      reset: Date.now() + 60000,
      headers: {},
    };
  }
}

/**
 * Rate limiting middleware
 */
export async function withRateLimit(
  request: NextRequest,
  key: RateLimitKey,
  identifier?: string,
): Promise<NextResponse | null> {
  const info = await checkRateLimit(request, key, identifier);

  if (!info.success) {
    logger.warn(
      {
        key,
        limit: info.limit,
        remaining: info.remaining,
        reset: info.reset,
      },
      'Rate limit exceeded',
    );

    // Log to security audit table
    const userId = request.headers.get('x-user-id') || undefined;
    await logRateLimitExceeded(request, identifier || key, userId);

    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Please try again after ${new Date(info.reset).toISOString()}`,
        },
        rateLimit: {
          limit: info.limit,
          remaining: 0,
          reset: new Date(info.reset).toISOString(),
        },
      },
      {
        status: 429,
        headers: info.headers,
      },
    );
  }

  // Return null to continue (rate limit headers added via checkRateLimit)
  return null;
}

/**
 * Wrapper for API route handlers with rate limiting
 */
export function withRateLimitHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  key: RateLimitKey,
  getIdentifier?: (request: NextRequest) => string | undefined,
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest;
    const identifier = getIdentifier?.(request);

    const rateLimitResponse = await withRateLimit(request, key, identifier);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return handler(...args);
  };
}
