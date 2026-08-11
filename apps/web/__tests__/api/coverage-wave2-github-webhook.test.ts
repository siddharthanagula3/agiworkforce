/**
 * Unit tests: POST /api/github/webhook
 *
 * Coverage targets:
 * - Missing or invalid HMAC-SHA256 signature → 401
 * - Event type !== issue_comment → no-op 200
 * - Bot self-reply guard skips processing
 * - Installation over monthly quota → 200 without calling LLM
 * - Valid mention within debounce window (pending status) is skipped
 * - Valid signed request with bot mention triggers processReview (non-PR → no-op)
 *
 * The route fires processReview() asynchronously (fire-and-forget) after
 * immediately returning 200. For spend-cap and debounce tests we need to
 * observe the DB calls made by processReview. We use vi.waitFor to let the
 * micro-task queue drain before asserting on mock calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

// ── Boundary mocks ────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Rate limit: always pass through
vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

// ── DB mock: query/execute controlled per-test ────────────────────────────────

const mockDbQuery = vi.fn();
const mockDbExecute = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockDbQuery(...args),
    execute: (...args: unknown[]) => mockDbExecute(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  })),
}));

// ── GitHub App library mocks ──────────────────────────────────────────────────

// Use a hoisting-safe literal — vi.mock factories are hoisted to the top of
// the module before any const declarations, so referencing a variable defined
// below the factory causes a TDZ ReferenceError.  The literal below is the
// shared secret used both in the mock export and in the signPayload helper.
const SECRET = 'test-webhook-secret-abc123';

const mockVerifySignature = vi.fn();
const mockGetInstallationAccessToken = vi.fn();
const mockGetPrDiff = vi.fn();
const mockPostIssueComment = vi.fn();

vi.mock('@/lib/github-app', () => ({
  verifyGitHubWebhookSignature: (...args: unknown[]) => mockVerifySignature(...args),
  getInstallationAccessToken: (...args: unknown[]) => mockGetInstallationAccessToken(...args),
  getPrDiff: (...args: unknown[]) => mockGetPrDiff(...args),
  postIssueComment: (...args: unknown[]) => mockPostIssueComment(...args),
  // Export the same literal so the route's module-level GITHUB_WEBHOOK_SECRET
  // matches what signPayload() uses to produce valid signatures in tests.
  GITHUB_WEBHOOK_SECRET: 'test-webhook-secret-abc123',
}));

// ── Types catalog mock (model ID lookups) ────────────────────────────────────

vi.mock('@agiworkforce/types', () => ({
  getProviderDefaultModel: vi.fn(() => 'fixture-model'),
  getTaskModelForProvider: vi.fn(() => 'fixture-model'),
}));

// Route under test — imported AFTER all vi.mock() calls
import { POST } from '@/app/api/github/webhook/route';

// ── Helpers ───────────────────────────────────────────────────────────────────

function signPayload(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

interface WebhookPayload {
  action?: string;
  comment?: { body: string };
  sender?: { type?: string; login?: string };
  issue?: { pull_request?: object; number?: number };
  installation?: { id: number };
  repository?: { full_name: string };
}

function makeRequest(payload: WebhookPayload, options?: { signature?: string }): NextRequest {
  const body = JSON.stringify(payload);
  const sig = options?.signature ?? signPayload(body, SECRET);
  return new NextRequest('http://localhost/api/github/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': sig,
      'x-github-event': payload.action === undefined ? 'push' : 'issue_comment',
    },
    body,
  });
}

function makeBotMentionPayload(overrides?: Partial<WebhookPayload>): WebhookPayload {
  return {
    action: 'created',
    comment: { body: 'Hey @agi-workforce please review this PR' },
    sender: { type: 'User', login: 'some-human' },
    issue: { pull_request: {}, number: 42 },
    installation: { id: 999 },
    repository: { full_name: 'acme-corp/my-repo' },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/github/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: signature verification passes
    mockVerifySignature.mockReturnValue(true);

    // Default: installation found and PR review enabled
    mockDbQuery.mockResolvedValue([{ user_id: 'u1', pr_review_enabled: true, review_model: null }]);
    mockDbExecute.mockResolvedValue(undefined);
    mockDbTransaction.mockImplementation(
      async (callback: (tx: { execute: typeof mockDbExecute }) => Promise<unknown>) =>
        callback({ execute: mockDbExecute }),
    );
    mockGetInstallationAccessToken.mockResolvedValue('ghs_access_token');
    mockGetPrDiff.mockResolvedValue('diff --git a/foo.ts b/foo.ts\n+const x = 1;');
    mockPostIssueComment.mockResolvedValue(undefined);
  });

  // ── 1. Missing signature → 401 ───────────────────────────────────────────

  it('returns 401 when x-hub-signature-256 header is absent', async () => {
    mockVerifySignature.mockReturnValue(false);

    const payload = makeBotMentionPayload();
    const body = JSON.stringify(payload);
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'issue_comment',
        // No x-hub-signature-256 header
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const json = (await response.json()) as { error: string };
    expect(json.error).toMatch(/invalid signature/i);
  });

  // ── 2. Wrong/tampered signature → 401 ────────────────────────────────────

  it('returns 401 when signature does not match payload', async () => {
    mockVerifySignature.mockReturnValue(false);

    const request = makeRequest(makeBotMentionPayload(), {
      signature: 'sha256=badc0de',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const json = (await response.json()) as { error: string };
    expect(json.error).toMatch(/invalid signature/i);
  });

  // ── 3. Non-issue_comment event → no-op 200 ───────────────────────────────

  it('returns 200 immediately for non-issue_comment events without processing', async () => {
    const pushPayload = { ref: 'refs/heads/main', commits: [] };
    const body = JSON.stringify(pushPayload);
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'push',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { received: boolean };
    expect(json.received).toBe(true);

    // No downstream calls should be made for non-comment events
    expect(mockGetInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('acknowledges GitHub webhook setup pings through the event router', async () => {
    const body = JSON.stringify({ zen: 'Keep it logically awesome.' });
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'ping',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, event: 'ping' });
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it('atomically removes a GitHub installation after an uninstall event', async () => {
    const body = JSON.stringify({ action: 'deleted', installation: { id: 999 } });
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'installation',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      event: 'installation.deleted',
    });
    expect(mockDbTransaction).toHaveBeenCalledOnce();
    expect(mockDbExecute).toHaveBeenCalledTimes(2);
    expect(mockDbExecute.mock.calls[0]?.[0]).toContain('github_pr_review_attempts');
    expect(mockDbExecute.mock.calls[1]?.[0]).toContain('github_installations');
    expect(mockDbExecute.mock.calls[0]?.[1]).toEqual([999]);
    expect(mockDbExecute.mock.calls[1]?.[1]).toEqual([999]);
    expect(mockGetInstallationAccessToken).not.toHaveBeenCalled();
  });

  it('returns a retryable failure when installation cleanup cannot commit', async () => {
    mockDbTransaction.mockRejectedValueOnce(new Error('database unavailable'));
    const body = JSON.stringify({ action: 'deleted', installation: { id: 999 } });
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'installation',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(response.headers.get('retry-after')).toBe('10');
    expect(mockGetInstallationAccessToken).not.toHaveBeenCalled();
  });

  // ── 4. Bot self-reply guard skips processing ──────────────────────────────

  it('returns 200 without invoking LLM when sender is the bot itself', async () => {
    const payload = makeBotMentionPayload({
      sender: { type: 'Bot', login: 'agi-workforce[bot]' },
    });
    const body = JSON.stringify(payload);
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'issue_comment',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Let the async processReview fire-and-forget micro-task drain
    await vi.waitFor(
      () => {
        // Bot guard fires before token retrieval — no installation token call
        expect(mockGetInstallationAccessToken).not.toHaveBeenCalled();
      },
      { timeout: 500 },
    );
  });

  // ── 5. Monthly quota exceeded → 200, LLM skipped ─────────────────────────

  it('skips LLM call and returns 200 when installation is over monthly quota', async () => {
    // DB setup:
    //   1st call (debounce check): no recent pending attempt for this PR
    //   2nd call (quota check): count = 100 (at cap)
    mockDbQuery
      .mockResolvedValueOnce([
        // installation record
        { user_id: 'u1', pr_review_enabled: true, review_model: null },
      ])
      .mockResolvedValueOnce([]) // debounce: no in-flight attempt
      .mockResolvedValueOnce([{ cnt: '100' }]); // quota: at cap (default = 100)

    const payload = makeBotMentionPayload();
    const body = JSON.stringify(payload);
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'issue_comment',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Wait for the background processReview task to complete
    await vi.waitFor(
      () => {
        // Quota exceeded path posts a comment explaining the cap
        // postIssueComment(token, owner, repo, issueNumber, body) — body is at index 4
        expect(mockPostIssueComment).toHaveBeenCalledOnce();
        const commentBody = mockPostIssueComment.mock.calls[0]?.[4] as string;
        expect(commentBody).toMatch(/monthly review quota/i);

        // LLM fetch (getPrDiff) must NOT have been called
        expect(mockGetPrDiff).not.toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  // ── 6. Debounce: pending attempt in flight → skip ─────────────────────────

  it('skips processing when a pending attempt exists within debounce window', async () => {
    // DB setup:
    //   installation query returns enabled record
    //   debounce query returns a 'pending' row (in-flight)
    mockDbQuery
      .mockResolvedValueOnce([{ user_id: 'u1', pr_review_enabled: true, review_model: null }])
      .mockResolvedValueOnce([
        {
          id: 'attempt-999',
          attempted_at: new Date().toISOString(),
          status: 'pending',
        },
      ]); // debounce: another attempt is in flight

    const payload = makeBotMentionPayload();
    const body = JSON.stringify(payload);
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'issue_comment',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    await vi.waitFor(
      () => {
        // Debounce path inserts a 'skipped_debounce' record.
        // The SQL uses a $5 placeholder; 'skipped_debounce' is in the params array (c[1]).
        expect(mockDbExecute).toHaveBeenCalled();
        const insertCall = mockDbExecute.mock.calls.find(
          (c) => Array.isArray(c[1]) && (c[1] as unknown[]).includes('skipped_debounce'),
        );
        expect(insertCall).toBeDefined();

        // LLM and upstream GitHub diff must not be fetched
        expect(mockGetPrDiff).not.toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  // ── 7. issue_comment without pull_request key is ignored ─────────────────

  it('ignores issue comments on plain issues (not PRs)', async () => {
    const payload = makeBotMentionPayload({
      // No pull_request key on the issue → plain issue, not a PR
      issue: { number: 10 }, // no pull_request property
    });
    const body = JSON.stringify(payload);
    const request = new NextRequest('http://localhost/api/github/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signPayload(body, SECRET),
        'x-github-event': 'issue_comment',
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    await vi.waitFor(
      () => {
        expect(mockGetInstallationAccessToken).not.toHaveBeenCalled();
        expect(mockGetPrDiff).not.toHaveBeenCalled();
      },
      { timeout: 500 },
    );
  });
});
