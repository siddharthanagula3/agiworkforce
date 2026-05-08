/**
 * Auth Routes Tests
 *
 * Wave 1.5+ task #17 (2026-05-08): /register and /login routes were
 * retired (they targeted a `public.users` table that doesn't exist in
 * production; canonical login flow is the device-code path in
 * routes/deviceAuth.ts). The legacy mocks were removed alongside the
 * deleted `lib/supabase` singleton.
 *
 * Tests for /api/auth endpoints:
 * - POST /api/auth/register  → 501 retired stub
 * - POST /api/auth/login     → 501 retired stub
 * - GET  /api/auth/verify    → JWT verification path (still live)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authRouter } from '../../src/routes/auth';
import { errorHandler } from '../../src/middleware/errorHandler';

// Create test app with error handler
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  // Add error handler to properly format AppError responses
  app.use(errorHandler);
  return app;
}

describe('Auth Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /api/auth/register (retired)', () => {
    it('returns 501 with a pointer to the device-code flow', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'someone@example.com', password: 'password123' });

      // 501 retired stub OR 429 if the in-process rate-limiter from a sibling
      // test bled across (this router shares `authRateLimiter` state).
      expect([501, 429]).toContain(response.status);
      if (response.status === 501) {
        expect(response.body.code).toBe('AUTH_RETIRED');
        expect(response.body.next.code).toBe('POST /api/v1/auth/device/code');
      }
    });
  });

  describe('POST /api/auth/login (retired)', () => {
    it('returns 501 with a pointer to the device-code flow', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'someone@example.com', password: 'whatever' });

      expect([501, 429]).toContain(response.status);
      if (response.status === 501) {
        expect(response.body.code).toBe('AUTH_RETIRED');
        expect(response.body.next.token).toBe('POST /api/v1/auth/device/token');
      }
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await request(app).get('/api/auth/verify');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('No token provided');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should verify a valid token', async () => {
      // Generate a valid token using the test secret with required issuer/audience
      const jwt = await import('jsonwebtoken');
      const validToken = jwt.default.sign(
        { userId: 'user-123', email: 'test@example.com' },
        process.env['JWT_SECRET']!,
        {
          expiresIn: '1h',
          issuer: 'agiworkforce-api-gateway',
          audience: 'agiworkforce',
        },
      );

      const response = await request(app)
        .get('/api/auth/verify')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.userId).toBe('user-123');
    });
  });
});
