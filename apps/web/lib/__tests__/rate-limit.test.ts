import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// rate-limit.ts pulls in server-only + a logger + the security-audit sink.
// None are relevant to the in-memory bucketing logic under test.
vi.mock('server-only', () => ({}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../security-audit', () => ({
  logRateLimitExceeded: vi.fn(),
}));

// A minimal request stub. We always pass an explicit identifier so the header
// path in getRateLimitIdentifier is never exercised.
const req = { headers: new Headers() } as unknown as NextRequest;

describe('rate-limit in-memory bucketing', () => {
  beforeEach(() => {
    // Fresh module instance → fresh in-memory store per test. Ensure the Redis
    // path stays off so we exercise the in-memory fallback deterministically.
    vi.resetModules();
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['VERCEL_ENV'];
    // NODE_ENV is 'test' under vitest; the in-memory branch runs without the
    // production fail-closed short-circuit.
  });

  it('enforces a per-endpoint limit (chat-message: 20/min)', async () => {
    const { checkRateLimit } = await import('../rate-limit');
    const id = 'user:limit-enforced';

    for (let i = 0; i < 20; i++) {
      const r = await checkRateLimit(req, 'chat-message', id);
      expect(r.success).toBe(true);
    }
    // 21st request in the same window is blocked.
    const blocked = await checkRateLimit(req, 'chat-message', id);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("does not let one endpoint exhaust another endpoint's bucket (regression: shared-bucket 429 / lost assistant message)", async () => {
    const { checkRateLimit } = await import('../rate-limit');
    const id = 'user:cross-key-isolation';

    // Simulate normal page traffic: 25 requests to a high-limit endpoint
    // (`me` = 60/min). All succeed — well under its own budget.
    for (let i = 0; i < 25; i++) {
      const r = await checkRateLimit(req, 'me', id);
      expect(r.success).toBe(true);
    }

    // The chat-message endpoint (limit 20) for the SAME identifier must still
    // have its own fresh budget. Before the namespacing fix the shared counter
    // was already at 25 ≥ 20, so this returned success:false — which in the app
    // dropped the assistant-message persist POST (429) and lost the reply on
    // reload.
    const firstChatMessage = await checkRateLimit(req, 'chat-message', id);
    expect(firstChatMessage.success).toBe(true);
    expect(firstChatMessage.remaining).toBe(19);
  });

  it('keeps independent remaining counts per endpoint for the same identifier', async () => {
    const { checkRateLimit } = await import('../rate-limit');
    const id = 'user:independent-counts';

    const conv = await checkRateLimit(req, 'chat-conversation', id); // limit 60
    const msg = await checkRateLimit(req, 'chat-message', id); // limit 20

    expect(conv.limit).toBe(60);
    expect(conv.remaining).toBe(59);
    expect(msg.limit).toBe(20);
    expect(msg.remaining).toBe(19);
  });
});
