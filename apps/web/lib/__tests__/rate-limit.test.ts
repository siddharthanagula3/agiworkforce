import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextRequest } from 'next/server';
import { getPlanMaxConcurrentTurns } from '@agiworkforce/types';
import { KEY_VALUE_PROVIDER_ENV } from '@agiworkforce/key-value';

const NO_SHARED_STORE = 'none';

const upstash = vi.hoisted(() => ({
  client: {
    zremrangebyscore: vi.fn(async () => 0),
    zcard: vi.fn(async () => 0),
    zadd: vi.fn(async () => 1),
    zrem: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    evalsha: vi.fn(async () => [1, 0]),
    eval: vi.fn(async () => [1, 0]),
    scriptLoad: vi.fn(async () => 'sha'),
  },
}));

vi.mock('@upstash/redis', () => ({
  Redis: function RedisMock() {
    return upstash.client;
  },
}));

vi.mock('server-only', () => ({}));

const clerk = vi.hoisted(() => ({ verifyToken: vi.fn() }));
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => clerk.verifyToken(...args),
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null }),
}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../security-audit', () => ({
  logRateLimitExceeded: vi.fn(),
  BLOCK_APPEAL_PATH: '/support',
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

describe('managed concurrent-turn ceiling', () => {
  const POLICY_ENV = 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY';
  const PAID_TIER = 'pro';
  const paidCeiling = getPlanMaxConcurrentTurns(PAID_TIER)!;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    upstash.client.zremrangebyscore.mockResolvedValue(0);
    upstash.client.zcard.mockResolvedValue(0);
    upstash.client.zadd.mockResolvedValue(1);
    upstash.client.expire.mockResolvedValue(1);
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.invalid';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token';
    process.env[KEY_VALUE_PROVIDER_ENV] = 'upstash';
    delete process.env[POLICY_ENV];
    delete process.env['VERCEL_ENV'];
  });

  afterEach(() => {
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    process.env[KEY_VALUE_PROVIDER_ENV] = NO_SHARED_STORE;
    delete process.env[POLICY_ENV];
  });

  it('admits and records a turn while Redis answers', async () => {
    const { acquireManagedTurnSlot } = await import('../rate-limit');

    const result = await acquireManagedTurnSlot({
      userId: 'user-redis-up',
      planTier: PAID_TIER,
      turnId: 'turn-1',
    });

    expect(result.admitted).toBe(true);
    expect(result.limit).toBe(paidCeiling);
    expect(upstash.client.zadd).toHaveBeenCalledTimes(1);
  });

  it('refuses a turn once the plan ceiling is full', async () => {
    upstash.client.zcard.mockResolvedValue(paidCeiling);
    const { acquireManagedTurnSlot } = await import('../rate-limit');

    const result = await acquireManagedTurnSlot({
      userId: 'user-at-ceiling',
      planTier: PAID_TIER,
      turnId: 'turn-2',
    });

    expect(result.admitted).toBe(false);
    expect(result.denial).toBe('ceiling-reached');
    expect(upstash.client.zadd).not.toHaveBeenCalled();
  });

  it('refuses the turn when Redis fails, instead of removing the ceiling', async () => {
    upstash.client.zcard.mockRejectedValue(new Error('redis unavailable'));
    const { acquireManagedTurnSlot } = await import('../rate-limit');

    const result = await acquireManagedTurnSlot({
      userId: 'user-redis-down',
      planTier: PAID_TIER,
      turnId: 'turn-3',
    });

    expect(result.admitted).toBe(false);
    expect(result.denial).toBe('limiter-unavailable');
    expect(result.slot).toBeNull();
  });

  it('admits the turn when the shared store reports its monthly quota exhausted', async () => {
    upstash.client.zremrangebyscore.mockRejectedValue(
      new Error('Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500002.'),
    );
    const { acquireManagedTurnSlot } = await import('../rate-limit');

    const result = await acquireManagedTurnSlot({
      userId: 'user-quota-exhausted',
      planTier: PAID_TIER,
      turnId: 'turn-quota',
    });

    expect(result.admitted).toBe(true);
    expect(result.denial).toBeUndefined();
  });

  it('limits per instance instead of blocking a fail-closed endpoint when the shared store quota is exhausted', async () => {
    const quota = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500002.',
    );
    upstash.client.evalsha.mockRejectedValue(quota);
    upstash.client.eval.mockRejectedValue(quota);
    const { checkRateLimit } = await import('../rate-limit');
    const id = 'user:quota-exhausted';

    const first = await checkRateLimit(req, 'llm-completion', id);
    expect(first.success).toBe(true);
    expect(first.headers['X-RateLimit-Degraded']).toBe('shared-store-quota');

    let blocked = first;
    for (let i = 0; i < first.limit; i++) blocked = await checkRateLimit(req, 'llm-completion', id);
    expect(blocked.success).toBe(false);
  });

  it('refuses the turn when Redis is configured away entirely under a fail-closed policy', async () => {
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    process.env[KEY_VALUE_PROVIDER_ENV] = NO_SHARED_STORE;
    process.env[POLICY_ENV] = 'fail-closed';
    const { acquireManagedTurnSlot } = await import('../rate-limit');

    const result = await acquireManagedTurnSlot({
      userId: 'user-no-redis',
      planTier: PAID_TIER,
      turnId: 'turn-4',
    });

    expect(result.admitted).toBe(false);
    expect(result.denial).toBe('limiter-unavailable');
  });

  it('admits on a Redis failure only when an operator configured fail-open', async () => {
    process.env[POLICY_ENV] = 'fail-open';
    upstash.client.zcard.mockRejectedValue(new Error('redis unavailable'));
    const { acquireManagedTurnSlot } = await import('../rate-limit');

    const result = await acquireManagedTurnSlot({
      userId: 'user-fail-open',
      planTier: PAID_TIER,
      turnId: 'turn-5',
    });

    expect(result.admitted).toBe(true);
    expect(result.slot).not.toBeNull();
  });

  it('keeps a Redis-less dev box working without an explicit policy', async () => {
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    process.env[KEY_VALUE_PROVIDER_ENV] = NO_SHARED_STORE;
    const { acquireManagedTurnSlot } = await import('../rate-limit');

    const result = await acquireManagedTurnSlot({
      userId: 'user-dev',
      planTier: PAID_TIER,
      turnId: 'turn-6',
    });

    expect(result.admitted).toBe(true);
  });
});

describe('rate-limit failure policy', () => {
  const POLICY_ENV = 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY';

  beforeEach(() => {
    vi.resetModules();
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['VERCEL_ENV'];
    delete process.env[POLICY_ENV];
  });

  afterEach(() => {
    delete process.env[POLICY_ENV];
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
  });

  it('defaults to fail-closed wherever Redis is configured', async () => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.invalid';
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token';
    const { resolveRedisOutagePolicy } = await import('../rate-limit');
    expect(resolveRedisOutagePolicy()).toBe('fail-closed');
  });

  it('leaves a Redis-less dev box fail-open', async () => {
    const { resolveRedisOutagePolicy } = await import('../rate-limit');
    expect(resolveRedisOutagePolicy()).toBe('fail-open');
  });

  it('honours an explicit choice and refuses to guess from a typo', async () => {
    process.env[POLICY_ENV] = 'fail-closed';
    const { resolveRedisOutagePolicy } = await import('../rate-limit');
    expect(resolveRedisOutagePolicy()).toBe('fail-closed');

    process.env[POLICY_ENV] = 'whatever';
    expect(resolveRedisOutagePolicy()).toBe('fail-closed');

    process.env[POLICY_ENV] = 'FAIL-OPEN';
    expect(resolveRedisOutagePolicy()).toBe('fail-open');
  });

  it('blocks a fail-closed endpoint when the shared limiter is gone', async () => {
    process.env[POLICY_ENV] = 'fail-closed';
    const { checkRateLimit } = await import('../rate-limit');

    const blocked = await checkRateLimit(req, 'llm-completion', 'user:no-limiter');
    expect(blocked.success).toBe(false);
    expect(blocked.headers['X-RateLimit-Error']).toBe('rate-limiter-unavailable');

    const allowed = await checkRateLimit(req, 'me', 'user:no-limiter');
    expect(allowed.success).toBe(true);
  });
});

describe('BILL-33, an automated block is auditable and appealable', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['VERCEL_ENV'];
  });

  it('names the rule that blocked the caller and the page they can appeal on', async () => {
    const { withRateLimit } = await import('../rate-limit');
    const { logRateLimitExceeded } = await import('../security-audit');
    const request = {
      headers: new Headers(),
      url: 'https://agiworkforce.com/api/chat',
    } as unknown as NextRequest;

    let blocked: Response | null = null;
    for (let i = 0; i < 40 && blocked === null; i++) {
      blocked = await withRateLimit(request, 'chat-message', 'user:appeal-path');
    }

    expect(blocked).not.toBeNull();
    const body = await (blocked as Response).json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.reason).toBe('rate_limit:chat-message');
    expect(body.error.appeal_path).toBe('/support');
    expect(logRateLimitExceeded).toHaveBeenCalledWith(
      request,
      'user:appeal-path',
      'appeal-path',
      'rate_limit:chat-message',
    );
  });
});

describe('verified-user bucketing binds Clerk tokens to an authorized party', () => {
  const savedAppUrl = process.env['NEXT_PUBLIC_APP_URL'];
  const savedParties = process.env['CLERK_AUTHORIZED_PARTIES'];

  beforeEach(() => {
    vi.resetModules();
    clerk.verifyToken.mockReset();
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['VERCEL_ENV'];
    delete process.env['CLERK_AUTHORIZED_PARTIES'];
    process.env['CLERK_SECRET_KEY'] = 'sk_test_rate_limit';
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.agiworkforce.test';
  });

  afterEach(() => {
    if (savedAppUrl === undefined) delete process.env['NEXT_PUBLIC_APP_URL'];
    else process.env['NEXT_PUBLIC_APP_URL'] = savedAppUrl;
    if (savedParties === undefined) delete process.env['CLERK_AUTHORIZED_PARTIES'];
    else process.env['CLERK_AUTHORIZED_PARTIES'] = savedParties;
  });

  function bearerRequest(token: string): NextRequest {
    return {
      headers: new Headers({ authorization: `Bearer ${token}` }),
      url: 'https://agiworkforce.com/api/chat',
    } as unknown as NextRequest;
  }

  it('passes the deployment origin as authorizedParties when CLERK_AUTHORIZED_PARTIES is unset', async () => {
    clerk.verifyToken.mockResolvedValue({ sub: 'user_rl_1' });
    const { checkRateLimit } = await import('../rate-limit');

    const result = await checkRateLimit(bearerRequest('a.clerk.jwt'), 'chat-message');

    expect(result.identifier).toBe('user:user_rl_1');
    expect(clerk.verifyToken).toHaveBeenCalledWith('a.clerk.jwt', {
      secretKey: 'sk_test_rate_limit',
      authorizedParties: ['https://app.agiworkforce.test'],
    });
  });

  it('passes the configured allowlist when CLERK_AUTHORIZED_PARTIES is set', async () => {
    process.env['CLERK_AUTHORIZED_PARTIES'] = 'https://app.example.com, https://admin.example.com';
    clerk.verifyToken.mockResolvedValue({ sub: 'user_rl_2' });
    const { checkRateLimit } = await import('../rate-limit');

    await checkRateLimit(bearerRequest('b.clerk.jwt'), 'chat-message');

    expect(clerk.verifyToken).toHaveBeenCalledWith('b.clerk.jwt', {
      secretKey: 'sk_test_rate_limit',
      authorizedParties: ['https://app.example.com', 'https://admin.example.com'],
    });
  });

  it('does not verify the token at all when no authorized party can be resolved', async () => {
    delete process.env['NEXT_PUBLIC_APP_URL'];
    clerk.verifyToken.mockResolvedValue({ sub: 'user_rl_3' });
    const { checkRateLimit } = await import('../rate-limit');

    const result = await checkRateLimit(bearerRequest('c.clerk.jwt'), 'chat-message');

    expect(clerk.verifyToken).not.toHaveBeenCalled();
    expect(result.identifier).not.toBe('user:user_rl_3');
  });
});

describe('run-following has a bucket of its own', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['UPSTASH_REDIS_REST_URL'];
    delete process.env['UPSTASH_REDIS_REST_TOKEN'];
    delete process.env['VERCEL_ENV'];
  });

  // Run-following polls once every few seconds for the whole length of a turn.
  // Sharing the 30/min `llm-completion` bucket meant one dropped stream refused
  // the reconnect AND the user's next message, so a single user could lock
  // themselves out of chat by having a stream drop once.
  it('does not share the chat-send ceiling', async () => {
    const { rateLimitConfigs } = await import('../rate-limit');

    expect(rateLimitConfigs['agent-run-follow'].limit).toBeGreaterThan(
      rateLimitConfigs['llm-completion'].limit,
    );
  });

  it('fails open, because refusing a reconnect strands a run that is still going', async () => {
    const { rateLimitConfigs } = await import('../rate-limit');

    expect(rateLimitConfigs['agent-run-follow'].failClosed).toBe(false);
  });

  it('counts separately from the chat-send bucket for one identifier', async () => {
    const { checkRateLimit } = await import('../rate-limit');

    for (let call = 0; call < 30; call++) {
      await checkRateLimit(req, 'llm-completion', 'user:follow-1');
    }
    const follow = await checkRateLimit(req, 'agent-run-follow', 'user:follow-1');

    expect(follow.success).toBe(true);
  });
});

describe('non-production rate-limit scale', () => {
  const SCALE_ENV = 'AGI_RATE_LIMIT_SCALE';
  const SCALE = 50;
  const PRODUCTION_ENV = {
    VERCEL_ENV: 'production',
    UPSTASH_REDIS_REST_URL: 'https://redis.invalid',
    UPSTASH_REDIS_REST_TOKEN: 'token',
  };

  function clearEnv(): void {
    delete process.env[SCALE_ENV];
    for (const name of Object.keys(PRODUCTION_ENV)) delete process.env[name];
  }

  beforeEach(() => {
    vi.resetModules();
    clearEnv();
  });

  afterEach(clearEnv);

  it('widens a tier-scaled and a flat ceiling alike outside production', async () => {
    const unscaled = await import('../rate-limit');
    const tiered = unscaled.resolveTierRateLimit('chat-message', 'free');
    const flat = unscaled.resolveTierRateLimit('me');

    vi.resetModules();
    process.env[SCALE_ENV] = String(SCALE);
    const scaled = await import('../rate-limit');

    expect(scaled.resolveTierRateLimit('chat-message', 'free')).toBe(tiered * SCALE);
    expect(scaled.resolveTierRateLimit('me')).toBe(flat * SCALE);
  });

  it('lets a scaled ceiling absorb a burst the configured one refuses', async () => {
    process.env[SCALE_ENV] = String(SCALE);
    const { checkRateLimit, rateLimitConfigs } = await import('../rate-limit');
    const id = 'user:scaled-burst';

    for (let i = 0; i < rateLimitConfigs['chat-message'].limit + 1; i++) {
      const result = await checkRateLimit(req, 'chat-message', id);
      expect(result.success).toBe(true);
    }
  });

  it('ignores the scale under a production runtime', async () => {
    Object.assign(process.env, PRODUCTION_ENV);
    const unscaled = await import('../rate-limit');
    const tiered = unscaled.resolveTierRateLimit('chat-message', 'free');
    const flat = unscaled.resolveTierRateLimit('me');

    vi.resetModules();
    Object.assign(process.env, PRODUCTION_ENV);
    process.env[SCALE_ENV] = String(SCALE);
    const scaled = await import('../rate-limit');

    expect(scaled.resolveTierRateLimit('chat-message', 'free')).toBe(tiered);
    expect(scaled.resolveTierRateLimit('me')).toBe(flat);
  });

  it('falls back to the configured ceilings for a value that is not a positive integer', async () => {
    const unscaled = await import('../rate-limit');
    const flat = unscaled.resolveTierRateLimit('me');

    for (const value of ['', 'abc', '0', '-5', '2.5', '10x']) {
      vi.resetModules();
      process.env[SCALE_ENV] = value;
      const { resolveTierRateLimit } = await import('../rate-limit');
      expect(resolveTierRateLimit('me')).toBe(flat);
    }
  });
});

describe('managed turn slot age-out', () => {
  // A slot is normally released by the stream pipe's `finally`. Nothing runs a
  // `finally` when the platform kills the function at its maxDuration, so the
  // age-out is the only thing that frees the slot, and at 15 minutes it locked
  // a free user out of chat six times longer than a turn can legally run.
  it('ages out just above the chat route maxDuration, not minutes later', async () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), 'app/api/llm/v1/chat/completions/route.ts'),
      'utf8',
    );
    const routeMaxDurationSeconds = Number(
      /export const maxDuration = (\d+)/.exec(routeSource)?.[1],
    );
    const limiterSource = readFileSync(resolve(process.cwd(), 'lib/rate-limit.ts'), 'utf8');
    const ttlSeconds = Number(
      /const MANAGED_TURN_SLOT_TTL_SECONDS = (\d+)/.exec(limiterSource)?.[1],
    );

    expect(routeMaxDurationSeconds).toBeGreaterThan(0);
    expect(ttlSeconds).toBeGreaterThan(routeMaxDurationSeconds);
    expect(ttlSeconds).toBeLessThan(routeMaxDurationSeconds * 2);
  });
});
