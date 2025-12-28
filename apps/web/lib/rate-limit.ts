import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';

// Initialize Redis client (falls back to in-memory if not configured)
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Rate limit configurations per endpoint
export const rateLimitConfigs = {
  checkout: {
    limit: 5,
    window: '1 m', // 5 requests per minute
    failClosed: true, // Security-sensitive: block if Redis fails
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
  'sync-subscription': {
    limit: 10,
    window: '1 m', // 10 requests per minute (increased for payment success polling)
    failClosed: false,
  },
  default: {
    limit: 100,
    window: '1 m', // 100 requests per minute
    failClosed: false,
  },
} as const;

// In-memory rate limit store for fallback (not suitable for distributed systems)
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

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

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    for (const [k, v] of inMemoryStore.entries()) {
      if (v.resetTime < now) {
        inMemoryStore.delete(k);
      }
    }
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
 * Create a rate limiter instance (only called when Redis is available)
 */
function createRateLimiter(key: RateLimitKey) {
  const config = rateLimitConfigs[key];

  if (!redis) {
    // This shouldn't be called when Redis is unavailable
    // but provide a safe fallback just in case
    throw new Error('Redis not configured for rate limiting');
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    analytics: true,
  });
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
    if (process.env.NODE_ENV === 'production') {
      logger.warn({ key }, 'Redis not configured in production, using in-memory rate limiting');
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

  const rateLimiter = createRateLimiter(key);

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
