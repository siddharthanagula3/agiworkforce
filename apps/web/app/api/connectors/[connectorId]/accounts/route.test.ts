import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  listConnectorAccounts: vi.fn(),
  setDefaultConnectorAccount: vi.fn(),
  revokeConnectorOAuthGrant: vi.fn(),
  disconnectConnectorOAuthGrant: vi.fn(),
  recordAuditEvent: vi.fn(),
  evictConnectorOAuthCaches: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cors', () => ({ handleCorsPreflightRequest: vi.fn(() => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mocks.getUserScopedDb(...args),
}));
vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...args),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  evictConnectorOAuthCaches: (...args: unknown[]) => mocks.evictConnectorOAuthCaches(...args),
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  getUserConnectorOAuthGrantSummaries: vi.fn(async () => []),
  listConnectorAccounts: (...args: unknown[]) => mocks.listConnectorAccounts(...args),
  setDefaultConnectorAccount: (...args: unknown[]) => mocks.setDefaultConnectorAccount(...args),
  revokeConnectorOAuthGrant: (...args: unknown[]) => mocks.revokeConnectorOAuthGrant(...args),
  listRevocableConnectorTokens: vi.fn(async () => []),
  getConnectorOAuthGrant: vi.fn(async () => null),
  updateConnectorOAuthGrantTokens: vi.fn(),
  ConnectorGrantDecryptionError: class extends Error {},
}));
vi.mock('@/lib/connectors/oauth-access', () => ({
  disconnectConnectorOAuthGrant: (...args: unknown[]) =>
    mocks.disconnectConnectorOAuthGrant(...args),
  resolveConnectorAccessToken: vi.fn(async () => ({ status: 'not-connected' })),
}));

import { DELETE, GET, PATCH } from './route';

const USER = 'user-1';
const context = { params: Promise.resolve({ connectorId: 'gmail' }) };

function patch(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/connectors/gmail/accounts', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: {}, userId: USER, organizationId: null });
  mocks.listConnectorAccounts.mockResolvedValue([
    { accountKey: 'b', label: 'Second', isDefault: false, kind: 'user' },
    { accountKey: 'a', label: 'First', isDefault: true, kind: 'user' },
  ]);
  mocks.setDefaultConnectorAccount.mockResolvedValue(true);
  mocks.disconnectConnectorOAuthGrant.mockResolvedValue(true);
});

describe('GET /api/connectors/[connectorId]/accounts', () => {
  it('lists the caller own accounts with the default first', async () => {
    const response = await GET(
      new NextRequest('https://agiworkforce.com/api/connectors/gmail/accounts'),
      context,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.listConnectorAccounts).toHaveBeenCalledWith(USER, 'gmail');
    expect(body.accounts.map((a: { accountKey: string }) => a.accountKey)).toEqual(['a', 'b']);
    expect(typeof body.supportsMultipleAccounts).toBe('boolean');
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

describe('PATCH /api/connectors/[connectorId]/accounts', () => {
  it('makes the named account the default for this user only', async () => {
    const response = await PATCH(patch({ accountKey: 'b' }), context);
    expect(response.status).toBe(200);
    expect(mocks.setDefaultConnectorAccount).toHaveBeenCalledWith(USER, 'gmail', 'b');
  });

  it('answers 404 when the account is not one of the caller own', async () => {
    mocks.setDefaultConnectorAccount.mockResolvedValue(false);
    const response = await PATCH(patch({ accountKey: 'nope' }), context);
    expect(response.status).toBe(404);
  });

  it('refuses a body without an account key', async () => {
    const response = await PATCH(patch({}), context);
    expect(response.status).toBe(400);
    expect(mocks.setDefaultConnectorAccount).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/connectors/[connectorId]/accounts', () => {
  function del(query: string): NextRequest {
    return new NextRequest(`https://agiworkforce.com/api/connectors/gmail/accounts${query}`, {
      method: 'DELETE',
    });
  }

  it('hands the credential back to the provider, not only to the local row', async () => {
    const response = await DELETE(del('?accountKey=work'), context);

    expect(response.status).toBe(200);
    expect(mocks.disconnectConnectorOAuthGrant).toHaveBeenCalledWith(USER, 'gmail', 'work');
    expect(mocks.revokeConnectorOAuthGrant).not.toHaveBeenCalled();
    expect(mocks.evictConnectorOAuthCaches).toHaveBeenCalledWith(USER, 'gmail');
  });

  it('answers 404 when the account is not one of the caller own', async () => {
    mocks.disconnectConnectorOAuthGrant.mockResolvedValue(false);
    const response = await DELETE(del('?accountKey=nope'), context);
    expect(response.status).toBe(404);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a request without an account key', async () => {
    const response = await DELETE(del(''), context);
    expect(response.status).toBe(400);
    expect(mocks.disconnectConnectorOAuthGrant).not.toHaveBeenCalled();
  });
});
