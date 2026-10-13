import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type RlsDbModule = typeof import('@/lib/server/rls-db');

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  ownRowsQuery: vi.fn(),
  upgradesOpen: vi.fn(),
}));

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
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.ownRowsQuery(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/feature-flags/billing-upgrade-gate', () => ({
  readBillingUpgradesOpen: (...args: unknown[]) => mocks.upgradesOpen(...args),
}));
vi.mock('@/lib/server/email-pseudonym', () => ({
  pseudonymizeEmail: vi.fn(() => 'email-hash'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET, POST } from './route';

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

describe('GET /api/waitlist', () => {
  function get() {
    return new NextRequest('https://agiworkforce.com/api/waitlist');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '');
    mocks.query.mockResolvedValue([{ plan: 'pro' }, { plan: 'not-a-plan' }]);
    mocks.ownRowsQuery.mockResolvedValue([{ granted: false }]);
    mocks.upgradesOpen.mockResolvedValue(false);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('tells a gated account the gate is on and which plans it already joined', async () => {
    const response = await GET(get());

    await expect(response.json()).resolves.toEqual({
      joinedPlans: ['pro'],
      upgradeGateEnabled: true,
    });
    expect(mocks.upgradesOpen).toHaveBeenCalledWith('user-1');
  });

  it('tells an account that redeemed a code the gate is off for it', async () => {
    mocks.ownRowsQuery.mockResolvedValue([{ granted: true }]);

    const response = await GET(get());

    await expect(response.json()).resolves.toMatchObject({ upgradeGateEnabled: false });
    expect(mocks.ownRowsQuery).toHaveBeenCalledWith(expect.stringContaining('beta_redemptions'), [
      'user-1',
    ]);
  });

  it('reports the gate off for everyone once the operator switch is open', async () => {
    mocks.upgradesOpen.mockResolvedValue(true);

    const response = await GET(get());

    await expect(response.json()).resolves.toMatchObject({ upgradeGateEnabled: false });
    expect(mocks.ownRowsQuery).not.toHaveBeenCalled();
  });

  it('reports the gate off when the environment forces upgrades open', async () => {
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');

    const response = await GET(get());

    await expect(response.json()).resolves.toMatchObject({ upgradeGateEnabled: false });
    expect(mocks.upgradesOpen).not.toHaveBeenCalled();
  });

  it('keeps reporting the gate on when access cannot be read', async () => {
    mocks.ownRowsQuery.mockRejectedValue(new Error('connection refused'));

    const response = await GET(get());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ upgradeGateEnabled: true });
  });
});
