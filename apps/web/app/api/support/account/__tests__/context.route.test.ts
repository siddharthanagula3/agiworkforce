import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  withRateLimit: vi.fn(),
  resolveContext: vi.fn(),
}));

vi.hoisted(() => {
  process.env['NEXT_PUBLIC_APP_URL'] = 'https://agiworkforce.com';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/support/account/context-resolver', async () => {
  const actual = await vi.importActual<typeof import('@/lib/support/account/context-resolver')>(
    '@/lib/support/account/context-resolver',
  );
  return {
    ...actual,
    resolveSupportAccountContext: mocks.resolveContext,
  };
});

import { createError } from '@/lib/errors';
import { GET } from '../context/route';

function get(url = 'https://agiworkforce.com/api/support/account/context'): NextRequest {
  return new NextRequest(url);
}

const CONTEXT = {
  plan: {
    tier: 'pro',
    effectiveTier: 'pro',
    displayName: 'Pro',
    status: 'active',
    currentPeriodEnd: null,
    subscriptionSource: 'stripe' as const,
  },
  usage: null,
  connectors: [{ id: 'row-1', connectorId: 'slack', source: 'user' as const, connectedAt: null }],
  apiKeys: { activeCount: 1, atCeiling: false },
  email: { present: true, verified: 'verified' as const },
  resolvedAt: '2026-08-05T00:00:00.000Z',
};

describe('GET /api/support/account/context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.scopedDb,
      userId: 'session_user',
      organizationId: null,
    });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.resolveContext.mockResolvedValue(CONTEXT);
  });

  it('401s a signed-out caller and resolves nothing', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await GET(get());
    expect(response.status).toBe(401);
    expect(mocks.resolveContext).not.toHaveBeenCalled();
  });

  it('resolves the SESSION user and ignores a userId in the query string', async () => {
    const response = await GET(
      get('https://agiworkforce.com/api/support/account/context?userId=victim_user'),
    );
    expect(response.status).toBe(200);
    expect(mocks.resolveContext).toHaveBeenCalledTimes(1);
    expect(mocks.resolveContext).toHaveBeenCalledWith(mocks.scopedDb, 'session_user');
  });

  it('returns the model-safe projection alongside the full context', async () => {
    const response = await GET(get());
    const body = (await response.json()) as {
      context: unknown;
      facts: Record<string, unknown>;
      citations: { href: string }[];
    };

    expect(body.facts).not.toHaveProperty('connectors');
    expect(body.facts['connector_ids']).toEqual(['slack']);
    expect(body.facts['plan_tier']).toBe('pro');
    expect(Object.keys(body.facts)).not.toContain('email');
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.citations.every((c) => c.href.startsWith('/'))).toBe(true);
  });

  it('rate limits before resolving anything', async () => {
    mocks.withRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ error: 'slow down' }), { status: 429 }),
    );
    const response = await GET(get());
    expect(response.status).toBe(429);
    expect(mocks.resolveContext).not.toHaveBeenCalled();
  });
});
