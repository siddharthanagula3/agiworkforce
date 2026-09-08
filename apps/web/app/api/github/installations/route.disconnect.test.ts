import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  execute: vi.fn<(...args: unknown[]) => Promise<number>>(),
  deleteInstallation: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  recordAuditEvent: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute(...args),
    },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...args),
}));
vi.mock('@/lib/github-app', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isGitHubInstallationLinkingAvailable: () => true,
  deleteGitHubAppInstallation: (...args: unknown[]) => mocks.deleteInstallation(...args),
}));

import { DELETE } from './route';

const INSTALLATION_ID = 987654;

function disconnectRequest(installationId: unknown = INSTALLATION_ID) {
  return new NextRequest('http://localhost:3000/api/github/installations', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installationId }),
  });
}

function ownedRow() {
  return [
    {
      id: 'row-1',
      installation_id: String(INSTALLATION_ID),
      account_login: 'acme-org',
      account_type: 'Organization',
    },
  ];
}

describe('DELETE /api/github/installations revokes the installation at GitHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue(ownedRow());
    mocks.execute.mockResolvedValue(1);
    mocks.deleteInstallation.mockResolvedValue({ status: 'deleted' });
  });

  it('asks GitHub to delete the installation, not only our row', async () => {
    const response = await DELETE(disconnectRequest());

    expect(response.status).toBe(200);
    expect(mocks.deleteInstallation).toHaveBeenCalledWith(INSTALLATION_ID);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('delete from github_installations'),
      [INSTALLATION_ID, 'user-1'],
    );
  });

  it('revokes at GitHub before it forgets the row, so a failure is still recoverable', async () => {
    const order: string[] = [];
    mocks.deleteInstallation.mockImplementation(async () => {
      order.push('github');
      return { status: 'deleted' };
    });
    mocks.execute.mockImplementation(async () => {
      order.push('local');
      return 1;
    });

    await DELETE(disconnectRequest());

    expect(order).toEqual(['github', 'local']);
  });

  it('refuses an installation the caller does not own, before calling GitHub', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await DELETE(disconnectRequest());

    expect(response.status).toBe(404);
    expect(mocks.deleteInstallation).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('treats an installation GitHub no longer has as disconnected', async () => {
    mocks.deleteInstallation.mockResolvedValue({ status: 'already-absent' });

    const response = await DELETE(disconnectRequest());

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalled();
  });

  it('keeps the row and reports a retryable partial state when GitHub refuses', async () => {
    mocks.deleteInstallation.mockResolvedValue({
      status: 'failed',
      reason: 'GitHub returned 503',
    });

    const response = await DELETE(disconnectRequest());

    expect(response.status).toBe(502);
    expect(mocks.execute).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.retryable).toBe(true);
    expect(String(body.error)).toMatch(/still installed/i);
  });

  it('never reports success when the app is not configured to revoke', async () => {
    mocks.deleteInstallation.mockResolvedValue({
      status: 'unavailable',
      reason: 'GitHub App credentials not configured',
    });

    const response = await DELETE(disconnectRequest());

    expect(response.status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('audits the disconnection and records a failed revocation as a failure', async () => {
    await DELETE(disconnectRequest());
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'connector_removed',
        outcome: 'success',
        detail: expect.objectContaining({ resourceType: 'github_installation' }),
      }),
    );

    vi.clearAllMocks();
    mocks.query.mockResolvedValue(ownedRow());
    mocks.deleteInstallation.mockResolvedValue({ status: 'failed', reason: 'GitHub returned 500' });

    await DELETE(disconnectRequest());
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'connector_removed', outcome: 'failure' }),
    );
  });
});
