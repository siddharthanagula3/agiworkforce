/**
 * RT-05: GitHub webhook processReview uses anon Supabase client in background task
 *
 * Tests that:
 * - Background task uses service-role client (not anon)
 * - HMAC-verified webhook finds installation and posts review
 * - Missing installation -> graceful "connect your account" comment
 * - Forged webhook (bad HMAC) rejected at route level
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

vi.mock('server-only', () => ({}));

vi.mock('@/utils/env', () => ({
  requireEnv: (key: string) => {
    const map: Record<string, string> = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc-role-key-12345',
    };
    return map[key] ?? '';
  },
}));

const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@agiworkforce/types', () => ({
  getTaskModelForProvider: vi.fn().mockReturnValue('claude-haiku-4-5'),
  getProviderDefaultModel: vi.fn().mockReturnValue('claude-haiku-4-5'),
}));

process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';

// Track which Supabase clients were created
interface SupabaseClientCall {
  url: string;
  key: string;
}
const supabaseClientCalls: SupabaseClientCall[] = [];

// Track what the mock DB returns for installation lookups
let mockInstallationData: unknown = {
  user_id: 'user-1',
  pr_review_enabled: true,
  review_model: null,
};

const mockPostComment = vi.fn().mockResolvedValue(undefined);
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string) => {
    supabaseClientCalls.push({ url, key });
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockInstallationData,
          error: null,
        }),
      }),
    };
  }),
}));

const WEBHOOK_SECRET = 'test-webhook-secret';
vi.mock('@/lib/github-app', () => ({
  GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
  verifyGitHubWebhookSignature: (body: string, sig: string, secret: string) => {
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    return sig === expected;
  },
  getInstallationAccessToken: vi.fn().mockResolvedValue('ghs_token_abc'),
  getPrDiff: vi.fn().mockResolvedValue('+ added line'),
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
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

describe('RT-05: GitHub webhook uses service-role client in background task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseClientCalls.length = 0;
    mockInstallationData = { user_id: 'user-1', pr_review_enabled: true, review_model: null };

    // Default: LLM succeeds
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'LGTM - no issues' }] }),
    });
  });

  it('uses service-role client (not anon) for installation lookup', async () => {
    const req = makeWebhookRequest(VALID_PAYLOAD);
    await POST(req);
    await waitForBackground();

    // Find Supabase client calls — at least one must use the service role key
    const usedServiceRole = supabaseClientCalls.some((c) => c.key === 'svc-role-key-12345');
    expect(usedServiceRole).toBe(true);

    // Must NOT use the anon key for any lookup
    const usedAnonKey = supabaseClientCalls.some((c) => c.key.includes('anon'));
    expect(usedAnonKey).toBe(false);
  });

  it('posts review comment when installation found and pr_review_enabled', async () => {
    const req = makeWebhookRequest(VALID_PAYLOAD);
    await POST(req);
    await waitForBackground();

    expect(mockPostComment).toHaveBeenCalledOnce();
    const callArgs = mockPostComment.mock.calls[0] as unknown[];
    expect(callArgs[4] as string).toContain('AGI Workforce Code Review');
  });

  it('posts "connect your account" when installation not found', async () => {
    mockInstallationData = null; // No installation record
    const req = makeWebhookRequest(VALID_PAYLOAD);
    await POST(req);
    await waitForBackground();

    expect(mockPostComment).toHaveBeenCalledOnce();
    const callArgs = mockPostComment.mock.calls[0] as unknown[];
    expect(callArgs[4] as string).toContain('connect your GitHub account');
  });

  it('posts no comment when pr_review_enabled = false', async () => {
    mockInstallationData = { user_id: 'user-1', pr_review_enabled: false, review_model: null };
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
    // No Supabase client should have been created (no background task)
    expect(supabaseClientCalls.length).toBe(0);
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
    mockInstallationData = null;
    const req = makeWebhookRequest({ ...VALID_PAYLOAD, installation: { id: 9999 } });
    await POST(req);
    await waitForBackground();

    // Should post the "connect your account" message, not crash
    expect(mockPostComment).toHaveBeenCalledOnce();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
