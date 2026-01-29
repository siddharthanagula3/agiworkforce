/**
 * Rate Limiter Tests
 *
 * Tests for rate limiting middleware
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
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
});
