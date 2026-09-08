import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  csrf: vi.fn<(...args: unknown[]) => Promise<Response | null>>(async () => null),
  recordAuditEvent: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: (...args: unknown[]) => mocks.csrf(...args) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.query(...args),
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
  deleteGitHubAppInstallation: vi.fn(),
}));

import { PATCH } from './route';

const INSTALLATION_ID = 987654;

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/github/installations', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(null);
  mocks.query.mockResolvedValue([
    { installation_id: String(INSTALLATION_ID), pr_review_enabled: true, account_login: 'acme' },
  ]);
});

/**
 * pr_review_enabled defaults to false and nothing wrote it, so the webhook's
 * pull-request review branch could never run for anyone.
 */
describe('PATCH /api/github/installations, pull request review setting', () => {
  it('turns the setting on for the caller installation', async () => {
    const response = await PATCH(
      patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: true }),
    );

    expect(response.status).toBe(200);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/update github_installations/i);
    expect(sql).toMatch(/pr_review_enabled = \$1/);
    expect(params).toEqual([true, INSTALLATION_ID, 'user-1']);
    await expect(response.json()).resolves.toMatchObject({ prReviewEnabled: true });
  });

  it('turns it back off', async () => {
    mocks.query.mockResolvedValue([
      {
        installation_id: String(INSTALLATION_ID),
        pr_review_enabled: false,
        account_login: 'acme',
      },
    ]);

    const response = await PATCH(
      patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: false }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ prReviewEnabled: false });
  });

  it('only ever writes rows the caller owns and has proven ownership of', async () => {
    await PATCH(patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: true }));

    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/user_id = \$3/);
    expect(sql).toMatch(/ownership_verified_at is not null/i);
  });

  it('refuses an installation the caller does not own', async () => {
    mocks.query.mockResolvedValue([]);

    const response = await PATCH(
      patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: true }),
    );

    expect(response.status).toBe(404);
  });

  it('requires a csrf token before it writes anything', async () => {
    mocks.csrf.mockResolvedValue(
      new Response(JSON.stringify({ error: 'csrf' }), { status: 403 }) as never,
    );

    const response = await PATCH(
      patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: true }),
    );

    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a body that is not an installation id and a boolean', async () => {
    for (const body of [
      { installationId: 'not-a-number', prReviewEnabled: true },
      { installationId: INSTALLATION_ID, prReviewEnabled: 'yes' },
      { installationId: -1, prReviewEnabled: true },
      { installationId: 1.5, prReviewEnabled: true },
      { prReviewEnabled: true },
      { installationId: INSTALLATION_ID },
    ]) {
      const response = await PATCH(patchRequest(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('never writes the review model, which the webhook resolves from the catalog', async () => {
    await PATCH(
      patchRequest({
        installationId: INSTALLATION_ID,
        prReviewEnabled: true,
        reviewModel: 'anything',
      }),
    );

    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/review_model/);
  });

  it('records the change on the audit trail as a connector setting, with no secret', async () => {
    await PATCH(patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: true }));

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'connector_setting_changed',
        severity: 'warning',
        detail: expect.objectContaining({
          resourceType: 'github_installation',
          resourceId: String(INSTALLATION_ID),
          connectorId: 'github',
          changedKeys: ['prReviewEnabled'],
          status: 'enabled',
        }),
      }),
    );
    expect(JSON.stringify(mocks.recordAuditEvent.mock.calls)).not.toMatch(/gh[pousr]_/);
  });

  it('records turning it off as plainly as turning it on', async () => {
    mocks.query.mockResolvedValue([
      {
        installation_id: String(INSTALLATION_ID),
        pr_review_enabled: false,
        account_login: 'acme',
      },
    ]);

    await PATCH(patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: false }));

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ status: 'disabled' }),
      }),
    );
  });

  it('writes no audit row when the installation is not the caller own', async () => {
    mocks.query.mockResolvedValue([]);

    await PATCH(patchRequest({ installationId: INSTALLATION_ID, prReviewEnabled: true }));

    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
