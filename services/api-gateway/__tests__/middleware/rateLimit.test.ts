/**
 * Rate Limiter Tests
 *
 * Tests for rate limiting middleware
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { createRateLimiter, rateLimitConfigs } from '../../src/middleware/rateLimit';

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
      // Standard headers (RFC 6585)
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should return 429 when rate limit is exceeded', async () => {
      const app = express();
      // Use credits-deduct which has max: 5
      app.use(createRateLimiter('credits-deduct'));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      // Make requests up to the limit
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => request(app).get('/test')),
      );

      // At least one should be rate limited
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThanOrEqual(1);

      // The rate limited response should have the error message
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
      // Use credits-deduct which has max: 5
      app.use(createRateLimiter('credits-deduct'));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      // Make 6 requests (limit is 5) — supertest uses ::ffff:127.0.0.1 by default
      const responses = [];
      for (let i = 0; i < 6; i++) {
        responses.push(await request(app).get('/test'));
      }

      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThanOrEqual(1);
    });
  });
});
