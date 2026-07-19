import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler';
import { usageRouter } from '../../src/routes/usage';

vi.mock('../../src/lib/neonClients', () => ({
  getUserScopedClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { account_status: 'active' }, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  })),
}));

function createToken(): string {
  return jwt.sign(
    { userId: 'user-123', email: 'test@example.com' },
    process.env['JWT_SECRET'] as string,
    {
      algorithm: 'HS256',
      issuer: 'agiworkforce-api-gateway',
      audience: 'agiworkforce',
    },
  );
}

function createApp() {
  const app = express();
  app.use('/api/v1/usage', usageRouter);
  app.use(errorHandler);
  return app;
}

describe('retired raw usage routes', () => {
  it.each(['', '/summary', '/history'])(
    'returns no private ledger data from GET /api/v1/usage%s',
    async (path) => {
      const response = await request(createApp())
        .get(`/api/v1/usage${path}`)
        .set('Authorization', `Bearer ${createToken()}`);

      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        error: 'Detailed usage history is no longer available',
        code: 'PERCENTAGE_USAGE_REQUIRED',
        usage_url: '/api/credits/balance',
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /token|cost|usd|event|metadata|conversation|session|model/i,
      );
    },
  );
});
