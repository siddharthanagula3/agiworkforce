import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1', email: 'user@example.com' })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    execute: (...args: unknown[]) => mocks.execute(...args),
    query: (...args: unknown[]) => mocks.query(...args),
  }),
}));
vi.mock('@/lib/server/email-pseudonym', () => ({
  pseudonymizeEmail: vi.fn(() => 'email-hash'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from './route';

function request(plan: string) {
  return new NextRequest('https://agiworkforce.com/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, billingInterval: 'monthly', source: 'billing-upgrade' }),
  });
}

describe('POST /api/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue(1);
  });

  it.each(['basic', 'pro', 'max', 'max_15x', 'team'])(
    'records the %s paid-plan waitlist',
    async (plan) => {
      const response = await POST(request(plan));

      expect(response.status).toBe(200);
      expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('insert into waitlist'), [
        'user-1',
        'email-hash',
        plan,
        'monthly',
        'billing-upgrade',
        expect.any(String),
        expect.any(String),
      ]);
    },
  );

  it.each(['free', 'enterprise', 'unknown'])('rejects non-self-serve plan %s', async (plan) => {
    const response = await POST(request(plan));

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
