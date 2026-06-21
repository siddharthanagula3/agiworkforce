/**
 * SSRF guard tests for POST /api/agents/tool-executions (webhook integration).
 *
 * Covers:
 *   - Internal/link-local hosts (IMDS 169.254.169.254) are rejected: fetch is NEVER called.
 *   - Loopback hosts (127.0.0.1) are rejected: fetch is NEVER called.
 *   - Non-http/https schemes (file://) are rejected: fetch is NEVER called.
 *   - RFC-1918 private range (10.0.0.1) is rejected: fetch is NEVER called.
 *   - A valid https:// external host passes the guard and fetch IS called.
 *
 * Each blocking test FAILS without the SSRF fix (fetch would be called) and
 * PASSES with it (fetch is never called for internal hosts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks · must run before any imports ────────────────────────────────

const { mockNeonQuery, mockGetClerkAuthUser, mockRequireCsrf, mockWithRateLimit } = vi.hoisted(
  () => ({
    mockNeonQuery: vi.fn(),
    mockGetClerkAuthUser: vi.fn(),
    mockRequireCsrf: vi.fn().mockResolvedValue(null),
    mockWithRateLimit: vi.fn().mockResolvedValue(null),
  }),
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockRequireCsrf }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockWithRateLimit }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockGetClerkAuthUser }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
  })),
}));
// The route now uses the DNS-resolving guard assertResolvedPublicHostname. Mock it
// here (the route test asserts the route RESPECTS the guard; the guard's own DNS
// logic is covered end-to-end by lib/egress-policy.test.ts). The double mirrors the
// real reject set so the blocking tests keep their meaning: internal/loopback/
// link-local/private hosts throw; public hosts resolve.
vi.mock('@/lib/egress-policy', () => {
  class EgressPolicyError extends Error {}
  return {
    EgressPolicyError,
    assertResolvedPublicHostname: vi.fn(async (urlString: string) => {
      const host = new URL(urlString).hostname.toLowerCase();
      const internal =
        host === 'localhost' ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (internal) throw new EgressPolicyError(urlString);
    }),
  };
});

// Stub global fetch at module level so it is intercepted on first import.
// (vi.mockReset: true clears the implementation between tests; we restore it
// in beforeEach, following the pattern in gateway-prod-guard.test.ts.)
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Route import (after all vi.mock calls) ─────────────────────────────────────

import { POST } from '../route';

// ── Constants ──────────────────────────────────────────────────────────────────

// Must be a valid RFC 4122 UUID (version digit 1-8 at position 14).
const TOOL_ID = '59728d91-c92f-4ffc-b618-9094561beec6';
const USER_ID = 'user-test-1';

/** Minimal webhook-tool row returned by the first db.query (SELECT). */
const BASE_TOOL_ROW = {
  id: TOOL_ID,
  user_id: USER_ID,
  name: 'My Webhook',
  type: 'integration',
  integration_type: 'webhook',
  parameters: {},
  config: { webhookUrl: 'https://example.com/hook', method: 'POST' },
  is_active: true,
};

/** Execution row returned by the second db.query (INSERT … RETURNING). */
const EXECUTION_ROW = {
  id: 'exec-1',
  tool_id: TOOL_ID,
  user_id: USER_ID,
  parameters: {},
  result: null,
  success: false,
  error_message: 'blocked',
  duration_ms: 1,
  created_at: '2026-05-29T00:00:00Z',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest() {
  return new Request('http://localhost:3000/api/agents/tool-executions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'test' },
    body: JSON.stringify({ toolId: TOOL_ID, parameters: {} }),
  }) as never;
}

/** Wire the two db.query calls needed by the route for any webhook URL. */
function setupDbForWebhookUrl(webhookUrl: string) {
  const toolRow = { ...BASE_TOOL_ROW, config: { webhookUrl, method: 'POST' } };
  // First call: SELECT tool; second call: INSERT execution returning.
  mockNeonQuery.mockResolvedValueOnce([toolRow]).mockResolvedValueOnce([EXECUTION_ROW]);
}

// ── beforeEach ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  // mockReset: true (vitest.config.ts) clears mock implementations between tests.
  // Re-register all implementations here, following gateway-prod-guard.test.ts.
  mockGetClerkAuthUser.mockResolvedValue({ userId: USER_ID });
  mockRequireCsrf.mockResolvedValue(null);
  mockWithRateLimit.mockResolvedValue(null);
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
    status: 200,
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('POST /api/agents/tool-executions · SSRF guard (webhook)', () => {
  it('IMDS link-local (169.254.169.254) is blocked · fetch is never called', async () => {
    setupDbForWebhookUrl('http://169.254.169.254/latest/meta-data/iam/security-credentials/');

    await POST(makeRequest());

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loopback IPv4 (127.0.0.1) is blocked · fetch is never called', async () => {
    setupDbForWebhookUrl('http://127.0.0.1:8080/internal');

    await POST(makeRequest());

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('non-http/https scheme (file://) is blocked · fetch is never called', async () => {
    setupDbForWebhookUrl('file:///etc/passwd');

    await POST(makeRequest());

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('RFC-1918 private range (10.0.0.1) is blocked · fetch is never called', async () => {
    setupDbForWebhookUrl('http://10.0.0.1/admin');

    await POST(makeRequest());

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('valid https external host passes the guard · fetch IS called', async () => {
    setupDbForWebhookUrl('https://hooks.example.com/webhook');

    await POST(makeRequest());

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.example.com/webhook',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fetch is issued with redirect: "manual" (no auto-follow)', async () => {
    setupDbForWebhookUrl('https://hooks.example.com/webhook');

    await POST(makeRequest());

    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.example.com/webhook',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('a 3xx redirect (e.g. -> IMDS) is rejected and NOT followed', async () => {
    setupDbForWebhookUrl('https://hooks.example.com/webhook');
    // The initial host passes the guard, but the response is a redirect to an
    // internal host. With redirect:"manual" the route must refuse, not follow.
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: { get: () => 'http://169.254.169.254/latest/meta-data/' },
      json: async () => ({}),
    });

    await POST(makeRequest());

    // Only the initial request is made; the redirect target is never fetched.
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
