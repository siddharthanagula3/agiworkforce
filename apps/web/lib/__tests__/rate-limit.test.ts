import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { getPlanMaxConcurrentTurns } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../security-audit', () => ({
  logRateLimitExceeded: vi.fn(),
}));

const req = { headers: new Headers() } as unknown as NextRequest;

describe('rate-limit in-memory bucketing', () => {
  beforeEach(() => {
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
    const blocked = await checkRateLimit(req, 'chat-message', id);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("does not let one endpoint exhaust another endpoint's bucket (regression: shared-bucket 429 / lost assistant message)", async () => {
    const { checkRateLimit } = await import('../rate-limit');
    const id = 'user:cross-key-isolation';

    for (let i = 0; i < 25; i++) {
      const r = await checkRateLimit(req, 'me', id);
      expect(r.success).toBe(true);
    }

    const firstChatMessage = await checkRateLimit(req, 'chat-message', id);
    expect(firstChatMessage.success).toBe(true);
    expect(firstChatMessage.remaining).toBe(19);
  });

  it('keeps independent remaining counts per endpoint for the same identifier', async () => {
    const { checkRateLimit } = await import('../rate-limit');
    const id = 'user:independent-counts';

    const conv = await checkRateLimit(req, 'chat-conversation', id);
    const msg = await checkRateLimit(req, 'chat-message', id);

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
        expect(ceiling).toBeGreaterThanOrEqual(advertised!);
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

    for (let i = 0; i < ceiling; i++) {
      const r = await checkRateLimit(req, 'chat-message', id, 'max_15x');
      expect(r.success).toBe(true);
      expect(r.limit).toBe(ceiling);
    }

    const blocked = await checkRateLimit(req, 'chat-message', id, 'max_15x');
    expect(blocked.success).toBe(false);
  });
});
