import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type NextServerModule = typeof import('next/server');

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<NextServerModule>()),
  after: (task: unknown) => {
    void task;
  },
}));
vi.mock('@shared/utils/env', () => ({
  requireEnv: (_key: string) => '',
  getOptionalEnv: (_key: string) => undefined,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));

const mocks = vi.hoisted(() => ({
  secret: 'test-webhook-secret',
  query: vi.fn(),
  transaction: vi.fn(),
  hmac: (secret: string, body: string): string => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cryptoMod = require('node:crypto') as typeof import('node:crypto');
    return 'sha256=' + cryptoMod.createHmac('sha256', secret).update(body).digest('hex');
  },
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: vi.fn(),
    transaction: (...args: unknown[]) => mocks.transaction(...args),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  }),
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({ createClaimedUserScopedDb: () => ({}) }));
vi.mock('@/lib/server/side-call-training-policy', () => ({
  sideCallTrainingOptOut: async () => false,
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  resolveEntitledPlanTier: async () => 'pro',
}));
vi.mock('@/lib/services/organization-policy-code-gate', () => ({
  assertWorkspaceCodeAccess: async () => ({ allowed: true, code: 'allowed', reason: '' }),
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  evaluateActiveWorkspacePolicy: async () => ({ allowed: true, code: 'allowed', reason: '' }),
}));
vi.mock('@/lib/managed-compute-gate', () => ({ isManagedComputePrivateBetaEnabled: () => true }));
vi.mock('@/lib/triggers/trigger-ingest', () => ({ ingestTriggerEvent: async () => [] }));
vi.mock('@/lib/github-app', () => ({
  GITHUB_WEBHOOK_SECRET: mocks.secret,
  verifyGitHubWebhookSignature: (body: string, sig: string, secret: string) =>
    sig === mocks.hmac(secret, body),
  getInstallationAccessToken: async () => 'ghs_token',
  getPrReviewSnapshot: vi.fn(),
  getPrHeadSha: vi.fn(),
  listPrReviewCommentBodies: async () => [],
  postIssueComment: vi.fn(),
  postPrReview: vi.fn(),
  getGitHubIssue: vi.fn(async () => null),
  getGitHubPullRequestForTask: vi.fn(async () => null),
  listGitHubFailedChecks: vi.fn(async () => []),
}));

import { POST } from '@/app/api/github/webhook/route';

const DELIVERY_ID = 'delivery-installation-deleted-1';

function deletedInstallation(): NextRequest {
  const body = JSON.stringify({ action: 'deleted', installation: { id: 42 } });
  return new NextRequest('http://localhost/api/github/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'installation',
      'x-github-delivery': DELIVERY_ID,
      'x-hub-signature-256': mocks.hmac(mocks.secret, body),
    },
    body,
  });
}

function releasedReceipts(): unknown[] {
  return mocks.query.mock.calls
    .filter(([sql]) => String(sql).startsWith('delete from github_webhook_deliveries'))
    .map(([, params]) => (params as unknown[])[0]);
}

describe('a webhook receipt is kept only for a delivery that was fully handled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) =>
      String(sql).startsWith('insert into github_webhook_deliveries') ? [{ id: 'receipt-1' }] : [],
    );
  });

  it('releases the receipt when the installation cleanup fails, so a redelivery is processed', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await POST(deletedInstallation());

    expect(response.status).toBe(500);
    expect(releasedReceipts()).toEqual([DELIVERY_ID]);
  });

  it('keeps the receipt once the installation cleanup committed', async () => {
    mocks.transaction.mockResolvedValueOnce(undefined);

    const response = await POST(deletedInstallation());

    expect(response.status).toBe(200);
    expect(releasedReceipts()).toEqual([]);
  });

  it('does not release a receipt that belongs to an earlier delivery of the same id', async () => {
    mocks.query.mockImplementation(async () => []);
    mocks.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await POST(deletedInstallation());

    expect(response.status).toBe(200);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(releasedReceipts()).toEqual([]);
  });
});
