import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  bankAccountsUnavailableReason: vi.fn(),
  sensitiveDataRegionRefusal: vi.fn(),
  evaluateConnectorPolicyForUser: vi.fn(),
  recordAuditEvent: vi.fn(),
  createBankAccountsLinkToken: vi.fn(),
  db: { query: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/free-chat-surface-policy', () => ({ resolveCloudChatSurface: () => 'web' }));
vi.mock('@/lib/connectors/bank-accounts', () => ({
  bankAccountsUnavailableReason: mocks.bankAccountsUnavailableReason,
  createBankAccountsLinkToken: mocks.createBankAccountsLinkToken,
}));
vi.mock('@/lib/connectors/sensitive-data-connectors', () => ({
  sensitiveDataRegionRefusal: mocks.sensitiveDataRegionRefusal,
}));
vi.mock('@/lib/services/connector-policy-gate', () => ({
  evaluateConnectorPolicyForUser: mocks.evaluateConnectorPolicyForUser,
}));

import { createError } from '@/lib/errors';
import { POST } from '../route';

function request(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/connectors/bank-accounts/link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getUserScopedDb.mockResolvedValue({
    db: mocks.db,
    userId: 'user-1',
    organizationId: 'org-1',
  });
  mocks.bankAccountsUnavailableReason.mockReturnValue(null);
  mocks.sensitiveDataRegionRefusal.mockReturnValue(null);
  mocks.evaluateConnectorPolicyForUser.mockResolvedValue({ allowed: true });
  mocks.createBankAccountsLinkToken.mockResolvedValue({
    linkToken: 'link-sandbox-1',
    expiration: '2026-09-28T12:00:00Z',
  });
});

describe('POST /api/connectors/bank-accounts/link', () => {
  it('returns the CSRF refusal', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.getUserScopedDb).not.toHaveBeenCalled();
  });

  it('rejects a signed-out caller with 401', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('answers 503 when bank connections are not configured', async () => {
    mocks.bankAccountsUnavailableReason.mockReturnValue('Bank accounts are not available yet.');

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect((await response.json()).error.message).toBe('Bank accounts are not available yet.');
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('refuses a region where sensitive financial connectors are not offered', async () => {
    mocks.sensitiveDataRegionRefusal.mockReturnValue('Not available in your region.');

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.sensitiveDataRegionRefusal).toHaveBeenCalledWith(
      'bank-accounts',
      expect.anything(),
    );
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('refuses when workspace connector policy blocks bank accounts', async () => {
    mocks.evaluateConnectorPolicyForUser.mockResolvedValue({
      allowed: false,
      reason: 'Your workspace blocks this connector.',
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe('Your workspace blocks this connector.');
    expect(mocks.evaluateConnectorPolicyForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        db: mocks.db,
        userId: 'user-1',
        organizationId: 'org-1',
        connectorId: 'bank-accounts',
        surface: 'web',
      }),
    );
    expect(mocks.createBankAccountsLinkToken).not.toHaveBeenCalled();
  });

  it('creates a link token for the caller and audits the start', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      linkToken: 'link-sandbox-1',
      expiration: '2026-09-28T12:00:00Z',
    });
    expect(mocks.createBankAccountsLinkToken).toHaveBeenCalledWith('user-1');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'connector_authorization_started',
        detail: expect.objectContaining({ connectorId: 'bank-accounts' }),
      }),
    );
  });
});
