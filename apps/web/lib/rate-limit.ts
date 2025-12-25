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
  },
  'device-poll': {
    limit: 10,
    window: '1 s', // 10 requests per second
  },
  'claim-offer': {
    limit: 3,
    window: '1 h', // 3 requests per hour
  },
  me: {
    limit: 60,
    window: '1 m', // 60 requests per minute
  },
  'sync-subscription': {
    limit: 5,
    window: '1 m', // 5 requests per minute
  },
  default: {
    limit: 100,
    window: '1 m', // 100 requests per minute
  },
} as const;

type RateLimitKey = keyof typeof rateLimitConfigs;

/**
 * Create a rate limiter instance
 */
function createRateLimiter(key: RateLimitKey) {
  const config = rateLimitConfigs[key];

  if (!redis) {
    // Fallback to in-memory rate limiting for development
    logger.warn(
      'Redis not configured, using in-memory rate limiting (not recommended for production)',
    );
    return new Ratelimit({
      redis: {
        sadd: async () => 0,
        smembers: async () => [],
        srem: async () => 0,
        eval: async () => [Date.now(), 0] as [number, number],
      } as any,
      limiter: Ratelimit.slidingWindow(config.limit, config.window),
      analytics: false,
    });
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
 * Rate limiting middleware
 */
export async function withRateLimit(
  request: NextRequest,
  key: RateLimitKey,
  identifier?: string,
): Promise<NextResponse | null> {
  // Skip rate limiting if Redis is not configured and we're in development
  if (!redis && process.env.NODE_ENV === 'development') {
    return null;
  }

  const rateLimiter = createRateLimiter(key);
  const id = getRateLimitIdentifier(request, identifier);

  try {
    const { success, limit, remaining, reset } = await rateLimiter.limit(id);

    if (!success) {
      logger.warn(
        {
          key,
          identifier: id,
          limit,
          remaining,
          reset,
        },
        'Rate limit exceeded',
      );

      return NextResponse.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Please try again after ${new Date(reset).toISOString()}`,
          },
          rateLimit: {
            limit,
            remaining: 0,
            reset: new Date(reset).toISOString(),
          },
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(reset).toISOString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        },
      );
    }

    // Add rate limit headers to successful responses
    return null;
  } catch (error) {
    logger.error({ error, key, identifier: id }, 'Rate limiting error');
    // Don't block requests if rate limiting fails
    return null;
  }
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
