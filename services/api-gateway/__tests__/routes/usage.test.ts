import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler';
import { usageRouter } from '../../src/routes/usage';

const { usageRows } = vi.hoisted(() => ({
  usageRows: [
    {
      id: 'evt-1',
      user_id: 'user-123',
      created_at: '2026-03-18T12:00:00.000Z',
      event_type: 'llm_completion',
      prompt_tokens: 120,
      completion_tokens: 80,
      total_cost: 0.42,
      model: 'gpt-5.4',
      conversation_id: 'conv-1',
      metadata: {},
    },
    {
      id: 'evt-2',
      user_id: 'user-123',
      created_at: '2026-03-19T08:30:00.000Z',
      event_type: 'llm_completion',
      metadata: {
        input_tokens: 40,
        output_tokens: 10,
        estimated_cost: 0.08,
        model: 'claude-opus-4.6',
        conversation_id: 'conv-2',
      },
    },
  ],
}));

// Wave 1.5+ task #17 (2026-05-08): legacy `lib/supabase` singleton deleted.
// middleware/auth.ts kill-switch now uses `getServiceClient()` for the
// profiles lookup; routes/usage.ts uses `getUserScopedClient(userId)` for
// usage_events. Mock both helpers separately so each call site sees the
// right chain (profile mock for kill-switch, usage mock for usage routes).
vi.mock('../../src/lib/supabaseClients', () => {
  const usageQuery = {
    eq: vi.fn(() => usageQuery),
    gte: vi.fn(() => usageQuery),
    lte: vi.fn(() => usageQuery),
    order: vi.fn().mockResolvedValue({ data: usageRows, error: null }),
    range: vi.fn().mockResolvedValue({ data: usageRows, error: null }),
  };

  const profileQuery = {
    eq: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: { account_status: 'active' },
        error: null,
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  };

  const serviceClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => profileQuery),
    })),
  };

  const userClient = {
    from: vi.fn(() => ({
      select: vi.fn(() => usageQuery),
    })),
  };

  return {
    getServiceClient: vi.fn(() => serviceClient),
    getUserClient: vi.fn(() => userClient),
    getUserScopedClient: vi.fn(() => userClient),
    mintSupabaseJwt: vi.fn(() => 'mock-supabase-jwt'),
    _resetSupabaseJwtCacheForTests: vi.fn(),
  };
});

function createToken(userId = 'user-123'): string {
  return jwt.sign(
    {
      userId,
      email: 'test@example.com',
      deviceId: 'device-1',
      role: 'user',
    },
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
  app.use(express.json());
  app.use('/api/v1/usage', usageRouter);
  app.use(errorHandler);
  return app;
}

describe('usageRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the desktop usage summary shape', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/api/v1/usage')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.message_count).toBe(2);
    expect(response.body.token_count).toBe(250);
    expect(response.body.cost_usd).toBe(0.5);
  });

  it('returns the mobile usage summary shape', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/api/v1/usage/summary')
      .set('Authorization', `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.totalInputTokens).toBe(160);
    expect(response.body.totalOutputTokens).toBe(90);
    expect(response.body.totalTokens).toBe(250);
    expect(response.body.totalCost).toBe(0.5);
    expect(response.body.conversationCount).toBe(2);
    expect(response.body.modelBreakdown).toHaveLength(2);
    expect(response.body.dailyUsage).toHaveLength(7);
  });
});
