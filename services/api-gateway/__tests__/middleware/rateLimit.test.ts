import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ipKeyGenerator, type Store } from 'express-rate-limit';
import { getPlanMaxConcurrentTurns } from '@agiworkforce/types';
import {
  RATE_LIMIT_OUTAGE_POLICY_ENV,
  createRateLimiter,
  limiterFailsClosed,
  rateLimitConfigs,
  resolveRateLimitOutagePolicy,
  resolveRateLimitRedisUrl,
  resolveTierRateLimitMax,
} from '../../src/middleware/rateLimit';

describe('Rate Limiter Middleware', () => {
  describe('rateLimitConfigs', () => {
    it('should have all expected endpoint configurations', () => {
      expect(rateLimitConfigs).toHaveProperty('credits-deduct');
      expect(rateLimitConfigs).toHaveProperty('credits-balance');
      expect(rateLimitConfigs).toHaveProperty('device-register');
      expect(rateLimitConfigs).toHaveProperty('heartbeat');
      expect(rateLimitConfigs).toHaveProperty('health');
      expect(rateLimitConfigs).toHaveProperty('default');
    });

    it('should have proper structure for each config', () => {
      Object.entries(rateLimitConfigs).forEach(([_key, config]) => {
        expect(config).toHaveProperty('windowMs');
        expect(config).toHaveProperty('max');
        expect(typeof config.windowMs).toBe('number');
        expect(typeof config.max).toBe('number');
        expect(config.windowMs).toBeGreaterThan(0);
        expect(config.max).toBeGreaterThan(0);
      });
    });

    it('should have stricter limits for financial endpoints', () => {
      expect(rateLimitConfigs['credits-deduct'].max).toBeLessThanOrEqual(
        rateLimitConfigs['health'].max,
      );
    });
  });

  describe('createRateLimiter', () => {
    it('should create middleware for valid rate limit key', () => {
      const limiter = createRateLimiter('health');
      expect(typeof limiter).toBe('function');
    });

    it('should allow requests within rate limit', async () => {
      const app = express();
      app.use(createRateLimiter('health'));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('should include rate limit headers', async () => {
      const app = express();
      app.use(createRateLimiter('health'));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const app = express();
      app.use(createRateLimiter('credits-deduct'));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const responses = await Promise.all(
        Array.from({ length: 6 }, () => request(app).get('/test')),
      );

      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThanOrEqual(1);

      if (rateLimited[0]) {
        expect(rateLimited[0].body).toHaveProperty('error', 'RATE_LIMIT_EXCEEDED');
      }
    });
  });

  describe('ipKeyGenerator', () => {
    it('uses the IP string as the rate-limit key for IPv4', () => {
      const key = ipKeyGenerator('203.0.113.5');
      expect(key).toBe('203.0.113.5');
    });

    it('returns the IP string unchanged for IPv4 addresses', () => {
      const key1 = ipKeyGenerator('198.51.100.1');
      const key2 = ipKeyGenerator('198.51.100.2');
      expect(key1).toBe('198.51.100.1');
      expect(key2).toBe('198.51.100.2');
      expect(key1).not.toBe(key2);
    });

    it('should rate limit IPv6 addresses correctly', async () => {
      const app = express();
      app.use(createRateLimiter('credits-deduct'));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const responses = [];
      for (let i = 0; i < 6; i++) {
        responses.push(await request(app).get('/test'));
      }

      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resolveTierRateLimitMax', () => {
    it('gives a paid tier more headroom than free on metered endpoints', () => {
      for (const key of ['llm-completions', 'cloud-chat-send'] as const) {
        expect(resolveTierRateLimitMax(key, 'max_15x')).toBeGreaterThan(
          resolveTierRateLimitMax(key, 'free'),
        );
        expect(resolveTierRateLimitMax(key, 'pro')).toBeGreaterThan(
          resolveTierRateLimitMax(key, 'basic'),
        );
      }
    });

    it('scales every metered ceiling with the concurrency the plan advertises', () => {
      for (const tier of ['free', 'basic', 'pro', 'max', 'max_15x', 'team'] as const) {
        const advertised = getPlanMaxConcurrentTurns(tier);
        expect(advertised).not.toBeNull();

        for (const key of ['llm-completions', 'cloud-chat-send'] as const) {
          const ceiling = resolveTierRateLimitMax(key, tier);
          expect(ceiling).toBeGreaterThanOrEqual(advertised!);
          expect(ceiling).toBeGreaterThanOrEqual(rateLimitConfigs[key].max * advertised!);
        }
      }
    });

    it('leaves the base ceiling in place for an absent or unknown tier', () => {
      expect(resolveTierRateLimitMax('llm-completions', undefined)).toBe(
        rateLimitConfigs['llm-completions'].max,
      );
      expect(resolveTierRateLimitMax('llm-completions', 'hobby')).toBe(
        rateLimitConfigs['llm-completions'].max,
      );
    });

    it('does not widen financial or device limits for paid tiers', () => {
      for (const key of ['credits-deduct', 'device-register', 'heartbeat'] as const) {
        expect(resolveTierRateLimitMax(key, 'max_15x')).toBe(rateLimitConfigs[key].max);
      }
    });

    it('applies the tier ceiling to the live limiter when the plan gate resolved a tier', async () => {
      const app = express();
      app.use((req, _res, next) => {
        req.planTier = 'max_15x';
        next();
      });
      app.use(createRateLimiter('cloud-chat-send'));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(Number(response.headers['ratelimit-limit'])).toBe(
        resolveTierRateLimitMax('cloud-chat-send', 'max_15x'),
      );
      expect(Number(response.headers['ratelimit-limit'])).toBeGreaterThan(
        rateLimitConfigs['cloud-chat-send'].max,
      );
    });
  });

  describe('resolveRateLimitRedisUrl', () => {
    it('accepts a redis wire-protocol URL', () => {
      expect(resolveRateLimitRedisUrl({ RATE_LIMIT_REDIS_URL: 'rediss://host:6379' })).toEqual({
        url: 'rediss://host:6379',
        reason: 'ok',
      });
    });

    it('refuses the Upstash REST URL instead of handing it to ioredis', () => {
      expect(resolveRateLimitRedisUrl({ UPSTASH_REDIS_REST_URL: 'https://db.upstash.io' })).toEqual(
        { url: null, reason: 'rest-url-only' },
      );

      expect(resolveRateLimitRedisUrl({ RATE_LIMIT_REDIS_URL: 'https://db.upstash.io' })).toEqual({
        url: null,
        reason: 'not-a-redis-url',
      });
    });

    it('reports an unset variable distinctly from a misconfigured one', () => {
      expect(resolveRateLimitRedisUrl({})).toEqual({ url: null, reason: 'unset' });
    });
  });

  describe('resolveRateLimitOutagePolicy', () => {
    it('defaults to fail-closed wherever Redis is configured or production is running', () => {
      expect(resolveRateLimitOutagePolicy({ RATE_LIMIT_REDIS_URL: 'rediss://host:6379' })).toBe(
        'fail-closed',
      );
      expect(resolveRateLimitOutagePolicy({ NODE_ENV: 'production' })).toBe('fail-closed');
    });

    it('leaves a Redis-less development box fail-open', () => {
      expect(resolveRateLimitOutagePolicy({ NODE_ENV: 'development' })).toBe('fail-open');
    });

    it('honours an explicit operator choice and refuses to guess from a typo', () => {
      expect(
        resolveRateLimitOutagePolicy({
          [RATE_LIMIT_OUTAGE_POLICY_ENV]: 'fail-open',
          RATE_LIMIT_REDIS_URL: 'rediss://host:6379',
        }),
      ).toBe('fail-open');
      expect(resolveRateLimitOutagePolicy({ [RATE_LIMIT_OUTAGE_POLICY_ENV]: 'FAIL-CLOSED' })).toBe(
        'fail-closed',
      );
      expect(resolveRateLimitOutagePolicy({ [RATE_LIMIT_OUTAGE_POLICY_ENV]: 'maybe' })).toBe(
        'fail-closed',
      );
    });

    it('scopes fail-closed to metered ceilings', () => {
      const env = { [RATE_LIMIT_OUTAGE_POLICY_ENV]: 'fail-closed' };
      expect(limiterFailsClosed('llm-completions', env)).toBe(true);
      expect(limiterFailsClosed('cloud-chat-send', env)).toBe(true);
      expect(limiterFailsClosed('credits-deduct', env)).toBe(true);
      expect(limiterFailsClosed('health', env)).toBe(false);
      expect(limiterFailsClosed('llm-completions', { NODE_ENV: 'development' })).toBe(false);
    });
  });

  describe('metered ceilings when the shared store is unavailable', () => {
    afterEach(() => {
      delete process.env[RATE_LIMIT_OUTAGE_POLICY_ENV];
    });

    const countingStore = (): Store => {
      const hits = new Map<string, number>();
      return {
        increment: async (key: string) => {
          const totalHits = (hits.get(key) ?? 0) + 1;
          hits.set(key, totalHits);
          return { totalHits, resetTime: new Date(Date.now() + 60_000) };
        },
        decrement: async (key: string) => {
          hits.set(key, Math.max(0, (hits.get(key) ?? 0) - 1));
        },
        resetKey: async (key: string) => {
          hits.delete(key);
        },
      };
    };

    const brokenStore = (): Store => ({
      increment: async () => {
        throw new Error('redis unavailable');
      },
      decrement: async () => {},
      resetKey: async () => {},
    });

    const appWith = (handler: express.RequestHandler) => {
      const app = express();
      app.use(handler);
      app.get('/test', (_req, res) => res.json({ ok: true }));
      return app;
    };

    it('serves and still enforces the ceiling while the store answers', async () => {
      process.env[RATE_LIMIT_OUTAGE_POLICY_ENV] = 'fail-closed';
      const app = appWith(createRateLimiter('credits-deduct', countingStore()));

      const statuses: number[] = [];
      for (let i = 0; i < rateLimitConfigs['credits-deduct'].max + 1; i++) {
        statuses.push((await request(app).get('/test')).status);
      }

      expect(statuses.filter((status) => status === 200)).toHaveLength(
        rateLimitConfigs['credits-deduct'].max,
      );
      expect(statuses.at(-1)).toBe(429);
    });

    it('refuses a metered request when the store errors', async () => {
      process.env[RATE_LIMIT_OUTAGE_POLICY_ENV] = 'fail-closed';
      const app = appWith(createRateLimiter('llm-completions', brokenStore()));

      const response = await request(app).get('/test');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error', 'RATE_LIMITER_UNAVAILABLE');
      expect(response.headers['retry-after']).toBe('30');
    });

    it('refuses a metered request when no shared store exists at all', async () => {
      process.env[RATE_LIMIT_OUTAGE_POLICY_ENV] = 'fail-closed';
      const app = appWith(createRateLimiter('llm-completions'));

      const response = await request(app).get('/test');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error', 'RATE_LIMITER_UNAVAILABLE');
    });

    it('admits on a store error only when an operator configured fail-open', async () => {
      process.env[RATE_LIMIT_OUTAGE_POLICY_ENV] = 'fail-open';
      const app = appWith(createRateLimiter('llm-completions', brokenStore()));

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('keeps unmetered endpoints available when the store errors', async () => {
      process.env[RATE_LIMIT_OUTAGE_POLICY_ENV] = 'fail-closed';
      const app = appWith(createRateLimiter('health', brokenStore()));

      const response = await request(app).get('/test');

      expect(response.status).toBe(200);
    });
  });
});
