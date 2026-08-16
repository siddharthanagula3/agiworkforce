
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

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
  GITHUB_WEBHOOK_SECRET: 'test-webhook-secret-abc123',
}));

vi.mock('@agiworkforce/types', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
  return {
    ...actual,
    getTaskModelForProvider: () => 'fixture-model',
    getProviderDefaultModel: () => 'fixture-model',
  };
});

import { POST } from '@/app/api/github/webhook/route';

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

describe('POST /api/github/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockVerifySignature.mockReturnValue(true);

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

    await vi.waitFor(
      () => {
        expect(mockGetInstallationAccessToken).not.toHaveBeenCalled();
      },
      { timeout: 500 },
    );
  });

  it('skips LLM call and returns 200 when installation is over monthly quota', async () => {
    mockDbQuery
      .mockResolvedValueOnce([
        { user_id: 'u1', pr_review_enabled: true, review_model: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: '100' }]);

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
        expect(mockPostIssueComment).toHaveBeenCalledOnce();
        const commentBody = mockPostIssueComment.mock.calls[0]?.[4] as string;
        expect(commentBody).toMatch(/monthly review quota/i);

        expect(mockGetPrDiff).not.toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  it('skips processing when a pending attempt exists within debounce window', async () => {
    mockDbQuery
      .mockResolvedValueOnce([{ user_id: 'u1', pr_review_enabled: true, review_model: null }])
      .mockResolvedValueOnce([
        {
          id: 'attempt-999',
          attempted_at: new Date().toISOString(),
          status: 'pending',
        },
      ]);

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
        expect(mockDbExecute).toHaveBeenCalled();
        const insertCall = mockDbExecute.mock.calls.find(
          (c) => Array.isArray(c[1]) && (c[1] as unknown[]).includes('skipped_debounce'),
        );
        expect(insertCall).toBeDefined();

        expect(mockGetPrDiff).not.toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  it('ignores issue comments on plain issues (not PRs)', async () => {
    const payload = makeBotMentionPayload({
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
