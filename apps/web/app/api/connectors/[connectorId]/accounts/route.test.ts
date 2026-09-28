import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  listConnectorAccounts: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  listConnectorAccounts: (...args: unknown[]) => mocks.listConnectorAccounts(...args),
}));

import { GET } from './route';

const USER = 'user-1';
const context = { params: Promise.resolve({ connectorId: 'gmail' }) };
const ACCOUNTS = [
  { accountKey: 'default', accountLabel: 'me@example.com', needsReauthorization: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: USER, organizationId: null });
  mocks.listConnectorAccounts.mockResolvedValue(ACCOUNTS);
});

describe('GET /api/connectors/[connectorId]/accounts', () => {
  it('lists the caller own connected account', async () => {
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/connectors/gmail/accounts'),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.listConnectorAccounts).toHaveBeenCalledWith(USER, 'gmail');
    expect(body).toEqual({ connectorId: 'gmail', accounts: ACCOUNTS });
  });

  it('refuses a connector id that is not a reference', async () => {
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/connectors/x/accounts'),
      { params: Promise.resolve({ connectorId: '../etc' }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.listConnectorAccounts).not.toHaveBeenCalled();
  });
});
