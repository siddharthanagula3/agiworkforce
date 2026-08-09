import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { getPlanMaxConcurrentTurns } from '@agiworkforce/types';

// rate-limit.ts pulls in server-only + a logger + the security-audit sink.
// None are relevant to the in-memory bucketing logic under test.
vi.mock('server-only', () => ({}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../security-audit', () => ({
  logRateLimitExceeded: vi.fn(),
}));

// A minimal request stub. We always pass an explicit identifier so neither the
// verified-user path nor the trusted-proxy header path in
// resolveRateLimitIdentifier is exercised here.
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

describe('tier-aware ceilings', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['VERCEL_ENV'];
  });

  it('gives a paid tier more headroom than free on metered endpoints', async () => {
    const { resolveTierRateLimit } = await import('../rate-limit');

    for (const key of ['llm-completion', 'chat-message'] as const) {
      expect(resolveTierRateLimit(key, 'max_15x')).toBeGreaterThan(
        resolveTierRateLimit(key, 'free'),
      );
      expect(resolveTierRateLimit(key, 'pro')).toBeGreaterThan(resolveTierRateLimit(key, 'basic'));
    }
  });

  it('scales every metered ceiling with the concurrency the plan advertises', async () => {
    const { resolveTierRateLimit, rateLimitConfigs } = await import('../rate-limit');

    for (const tier of ['free', 'basic', 'pro', 'max', 'max_15x', 'team'] as const) {
      const advertised = getPlanMaxConcurrentTurns(tier);
      expect(advertised).not.toBeNull();

      for (const key of ['chat-message', 'llm-completion'] as const) {
        const ceiling = resolveTierRateLimit(key, tier);
        // The ceiling must clear the concurrency the plan page sells...
        expect(ceiling).toBeGreaterThanOrEqual(advertised!);
        // ...and every one of those turns must get the base budget, not a
        // share of one flat budget sized for a single-turn Free user.
        expect(ceiling).toBeGreaterThanOrEqual(rateLimitConfigs[key].limit * advertised!);
      }
    }
  });

  it('leaves the base ceiling in place for an absent or unknown tier', async () => {
    const { resolveTierRateLimit, rateLimitConfigs } = await import('../rate-limit');

    expect(resolveTierRateLimit('chat-message')).toBe(rateLimitConfigs['chat-message'].limit);
    expect(resolveTierRateLimit('chat-message', 'hobby')).toBe(
      rateLimitConfigs['chat-message'].limit,
    );
  });

  it('does not widen security or pre-auth limits for paid tiers', async () => {
    const { resolveTierRateLimit, rateLimitConfigs } = await import('../rate-limit');

    for (const key of ['auth-login', 'llm-completion-ip', 'api-key-create'] as const) {
      expect(resolveTierRateLimit(key, 'max_15x')).toBe(rateLimitConfigs[key].limit);
    }
  });

  it('enforces the tier ceiling, not the base one, when a tier is supplied', async () => {
    const { checkRateLimit, resolveTierRateLimit, rateLimitConfigs } =
      await import('../rate-limit');
    const id = 'user:tier-enforced';
    const ceiling = resolveTierRateLimit('chat-message', 'max_15x');
    expect(ceiling).toBeGreaterThan(rateLimitConfigs['chat-message'].limit);

    // The base ceiling (20) must no longer be the cutoff for this caller.
    for (let i = 0; i < ceiling; i++) {
      const r = await checkRateLimit(req, 'chat-message', id, 'max_15x');
      expect(r.success).toBe(true);
      expect(r.limit).toBe(ceiling);
    }

    const blocked = await checkRateLimit(req, 'chat-message', id, 'max_15x');
    expect(blocked.success).toBe(false);
  });
});
