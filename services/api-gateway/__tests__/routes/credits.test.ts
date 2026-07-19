import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler';
import { creditsRouter } from '../../src/routes/credits';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: 'user-123',
      email: 'test@example.com',
      deviceId: 'device-1',
      role: 'user',
      token: 'verified-token',
    };
    next();
  },
}));

vi.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../src/lib/neonClients', () => ({
  getUserScopedClient: vi.fn(() => ({ rpc: rpcMock })),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/credits', creditsRouter);
  app.use(errorHandler);
  return app;
}

describe('creditsRouter GET /balance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only percentage, reset, and availability metadata', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          account_id: 'account-private',
          credits_allocated_cents: 1_500,
          credits_used_cents: 500,
          credits_remaining_cents: 1_000,
          daily_limit_cents: 450,
          daily_used_cents: 100,
          daily_remaining_cents: 350,
          period_start: '2026-07-01T00:00:00.000Z',
          period_end: '2099-08-01T00:00:00.000Z',
          last_daily_reset_at: '2026-07-18T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const response = await request(createApp()).get('/api/credits/balance');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      usage_percentage: 33.33,
      reset_at: '2099-08-01T00:00:00.000Z',
      has_usage_remaining: true,
    });
    expect(response.body.seconds_until_reset).toBeGreaterThan(0);
    expect(Object.keys(response.body).sort()).toEqual([
      'has_usage_remaining',
      'reset_at',
      'seconds_until_reset',
      'usage_percentage',
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(/account|cents|allocated|remaining_cents/i);
  });

  it('returns a closed empty status when no active ledger exists', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          account_id: null,
          credits_allocated_cents: 0,
          credits_used_cents: 0,
          credits_remaining_cents: 0,
          period_end: null,
        },
      ],
      error: null,
    });

    const response = await request(createApp()).get('/api/credits/balance');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      usage_percentage: 0,
      reset_at: null,
      seconds_until_reset: 0,
      has_usage_remaining: false,
    });
  });
});

describe('legacy client-managed credit mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['/api/credits/check', '/api/credits/deduct'])(
    'retires %s without accepting or returning private ledger units',
    async (path) => {
      const response = await request(createApp()).post(path).send({
        amount_cents: 123,
        description: 'client-calculated usage',
      });

      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        error: 'Client-managed credit operations are no longer available',
        code: 'SERVER_MANAGED_BILLING_REQUIRED',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/cents|amount|remaining|limit/i);
      expect(rpcMock).not.toHaveBeenCalled();
    },
  );
});
