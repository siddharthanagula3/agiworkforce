/**
 * RT-05: GitHub webhook processReview uses Neon DB in background task
 *
 * Tests that:
 * - Background task queries Neon DB for installation record
 * - HMAC-verified webhook finds installation and posts review
 * - Missing/unverified installation -> no privileged external write
 * - Forged webhook (bad HMAC) rejected at route level
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

vi.mock('server-only', () => ({}));

vi.mock('@shared/utils/env', () => ({
  requireEnv: (_key: string) => '',
}));

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@agiworkforce/types', () => ({
  getTaskModelForProvider: () => 'claude-haiku-4-5-20251001',
  getProviderDefaultModel: () => 'claude-haiku-4-5-20251001',
}));

process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';

const { mockPostComment } = vi.hoisted(() => ({
  mockPostComment: vi.fn().mockResolvedValue(undefined),
}));
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Neon DB mock ─────────────────────────────────────────────────────────────
const mockNeonQuery = vi.fn();
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

// Hoist `createHmac` alongside the secret so the mock factory can verify
// signatures without a `require()` call (banned by no-require-imports).
const { WEBHOOK_SECRET, hoistedCreateHmac } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cryptoMod = require('node:crypto') as typeof import('node:crypto');
  return { WEBHOOK_SECRET: 'test-webhook-secret', hoistedCreateHmac: cryptoMod.createHmac };
});
vi.mock('@/lib/github-app', () => ({
  GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
  verifyGitHubWebhookSignature: (body: string, sig: string, secret: string) => {
    const expected = 'sha256=' + hoistedCreateHmac('sha256', secret).update(body).digest('hex');
    return sig === expected;
  },
  // Plain functions — vitest config `mockReset: true` clears vi.fn()
  // implementations between tests, returning undefined for everything after
  // the first.
  getInstallationAccessToken: async () => 'ghs_token_abc',
  getPrDiff: async () => '+ added line',
  postIssueComment: (...args: unknown[]) => mockPostComment(...args),
}));

import { POST } from '@/app/api/github/webhook/route';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function makeWebhookRequest(payload: unknown, overrideSig?: string): NextRequest {
  const body = JSON.stringify(payload);
  return new NextRequest('http://localhost/api/github/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'issue_comment',
      'x-hub-signature-256': overrideSig ?? sign(body),
    },
    body,
  });
}

const VALID_PAYLOAD = {
  action: 'created',
  comment: { body: '@agi-workforce please review' },
  sender: { type: 'User', login: 'contributor' },
  issue: { number: 1, pull_request: {} },
  installation: { id: 42 },
  repository: { full_name: 'owner/repo' },
};

async function waitForBackground(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
}

describe('RT-05: GitHub webhook uses Neon DB in background task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: installation found with pr_review_enabled
    mockNeonQuery.mockResolvedValue([
      { user_id: 'user-1', pr_review_enabled: true, review_model: null },
    ]);

    // Default: LLM succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'LGTM - no issues' }] }),
    });
  });

  it('queries Neon DB for installation lookup in background task', async () => {
    const req = makeWebhookRequest(VALID_PAYLOAD);
    await POST(req);
    await waitForBackground();

    // Neon DB query should have been called for the installation lookup
    expect(mockNeonQuery).toHaveBeenCalled();
    const [sql] = mockNeonQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('github_installations');
    expect(sql).toMatch(/ownership_verified_at is not null/i);
  });

  it('posts review comment when installation found and pr_review_enabled', async () => {
    const req = makeWebhookRequest(VALID_PAYLOAD);
    await POST(req);
    await waitForBackground();

    expect(mockPostComment).toHaveBeenCalledOnce();
    const callArgs = mockPostComment.mock.calls[0] as unknown[];
    expect(callArgs[4] as string).toContain('AGI Code Review');
  });

  it('posts no comment when a verified installation is not found', async () => {
    mockNeonQuery.mockResolvedValue([]); // No installation record
    const req = makeWebhookRequest(VALID_PAYLOAD);
    await POST(req);
    await waitForBackground();

    expect(mockPostComment).not.toHaveBeenCalled();
  });

  it('posts no comment when pr_review_enabled = false', async () => {
    mockNeonQuery.mockResolvedValue([
      { user_id: 'user-1', pr_review_enabled: false, review_model: null },
    ]);
    const req = makeWebhookRequest(VALID_PAYLOAD);
    await POST(req);
    await waitForBackground();

    expect(mockPostComment).not.toHaveBeenCalled();
  });

  it('rejects forged webhook (bad HMAC) before background task runs', async () => {
    const req = makeWebhookRequest(VALID_PAYLOAD, 'sha256=deadbeef0000');
    const res = await POST(req);
    expect(res.status).toBe(401);

    await waitForBackground();
    // Background task should NOT have run (DB not queried)
    expect(mockNeonQuery).not.toHaveBeenCalled();
    expect(mockPostComment).not.toHaveBeenCalled();
  });

  it('returns 200 immediately (fire-and-forget pattern)', async () => {
    const req = makeWebhookRequest(VALID_PAYLOAD);
    const res = await POST(req);
    // Must return 200 before background task completes
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  it('handles non-existent installation_id gracefully (no-op)', async () => {
    mockNeonQuery.mockResolvedValue([]); // No installation record for this id
    const req = makeWebhookRequest({ ...VALID_PAYLOAD, installation: { id: 9999 } });
    await POST(req);
    await waitForBackground();

    // No linked owner means no authority to write to the repository.
    expect(mockPostComment).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
