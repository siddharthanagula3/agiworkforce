import type * as KeyValueModule from '@agiworkforce/key-value';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KEY_VALUE_PROVIDER_ENV,
  readUpstashCredentials,
  UPSTASH_REST_URL_ENV_NAMES,
  UPSTASH_REST_TOKEN_ENV_NAMES,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';

beforeEach(() => {
  for (const name of [...UPSTASH_REST_URL_ENV_NAMES, ...UPSTASH_REST_TOKEN_ENV_NAMES]) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

vi.mock('server-only', () => ({}));

const redisMocks = vi.hoisted(() => {
  const unexpectedCommand = () => {
    throw new Error('unexpected Redis command');
  };
  return {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    incrby: vi.fn(unexpectedCommand),
    expire: vi.fn(unexpectedCommand),
    hset: vi.fn(unexpectedCommand),
    hgetall: vi.fn(unexpectedCommand),
    sadd: vi.fn(unexpectedCommand),
    srem: vi.fn(unexpectedCommand),
    scard: vi.fn(unexpectedCommand),
    zadd: vi.fn(unexpectedCommand),
    zrem: vi.fn(unexpectedCommand),
    zremrangebyscore: vi.fn(unexpectedCommand),
    zcard: vi.fn(unexpectedCommand),
    scan: vi.fn(unexpectedCommand),
    pipeline: vi.fn(unexpectedCommand),
  } satisfies UpstashRedisLike;
});

vi.mock('@agiworkforce/key-value', async (importOriginal) => {
  const actual = await importOriginal<typeof KeyValueModule>();
  return {
    ...actual,
    resolveKeyValueRuntime(options: Parameters<typeof actual.resolveKeyValueRuntime>[0] = {}) {
      const injectClient =
        actual.selectKeyValueProvider(options) === 'upstash' &&
        !options.upstashClient &&
        actual.readUpstashCredentials() !== null;
      return actual.resolveKeyValueRuntime(
        injectClient ? { ...options, upstashClient: redisMocks } : options,
      );
    },
  } satisfies typeof actual;
});

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('E2B session-store tenant isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    vi.stubEnv(KEY_VALUE_PROVIDER_ENV, 'upstash');
    redisMocks.get.mockResolvedValue(null);
    redisMocks.set.mockResolvedValue('OK');
    redisMocks.del.mockResolvedValue(1);
  });

  it('uses distinct tenant + user + conversation keys even when conversation ids collide', async () => {
    expect(readUpstashCredentials()).toEqual({
      url: 'https://redis.example.test',
      token: 'test-token',
    });

    const { getE2BSession } = await import('../session-store');
    const userA = {
      tenantId: 'managed:cloud',
      userId: 'user:a',
      conversationId: 'shared:conversation',
    };
    const userB = {
      tenantId: 'managed:cloud',
      userId: 'user:b',
      conversationId: 'shared:conversation',
    };

    await getE2BSession(userA);
    await getE2BSession(userB);

    expect(redisMocks.get).toHaveBeenNthCalledWith(
      1,
      'e2b:session:v2:managed%3Acloud:user%3Aa:shared%3Aconversation',
    );
    expect(redisMocks.get).toHaveBeenNthCalledWith(
      2,
      'e2b:session:v2:managed%3Acloud:user%3Ab:shared%3Aconversation',
    );
  });

  it('deletes only the authenticated tenant/user conversation mapping', async () => {
    const { deleteE2BSession } = await import('../session-store');

    await deleteE2BSession({
      tenantId: 'managed-cloud',
      userId: 'user-b',
      conversationId: 'same-conversation',
    });

    expect(redisMocks.del).toHaveBeenCalledOnce();
    expect(redisMocks.del).toHaveBeenCalledWith(
      'e2b:session:v2:managed-cloud:user-b:same-conversation',
    );
  });

  it('keeps managed Code sessions in a resource-kind-isolated v3 namespace', async () => {
    const { getE2BSession } = await import('../session-store');

    await getE2BSession({
      tenantId: 'managed-cloud',
      userId: 'user-a',
      resource: { kind: 'code_session', id: 'code:one' },
      networkAccess: 'none',
    });

    expect(redisMocks.get).toHaveBeenCalledWith(
      'e2b:session:v3:managed-cloud:user-a:code_session:code%3Aone',
    );
  });
});

describe('E2B sandbox create lock', () => {
  const LOCK_KEY = 'e2b:create-lock:v1:managed-cloud:user-a';

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    vi.stubEnv(KEY_VALUE_PROVIDER_ENV, 'upstash');
    redisMocks.del.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function acquireTokens(count: number): Promise<string[]> {
    const tokens: string[] = [];
    let stored: unknown = null;
    redisMocks.set.mockImplementation(async (...args: unknown[]) => {
      const value = args[1];
      stored = value;
      tokens.push(String(value));
      return 'OK';
    });
    redisMocks.get.mockImplementation(async () => stored as never);
    const { withUserSandboxLock } = await import('../session-store');
    for (let i = 0; i < count; i++) {
      await expect(
        withUserSandboxLock({ tenantId: 'managed-cloud', userId: 'user-a' }, async () => i),
      ).resolves.toEqual({ locked: true, result: i });
    }
    return tokens;
  }

  it('draws the lock ownership token from a cryptographic source, not Math.random', async () => {
    const mathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const tokens = await acquireTokens(2);

    expect(mathRandom).not.toHaveBeenCalled();
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).not.toBe(tokens[1]);
    for (const token of tokens) {
      expect(token).toMatch(/^1700000000000-[A-Za-z0-9_-]{24}$/);
    }
  });

  it('releases the lock only while it still holds its own token', async () => {
    await acquireTokens(1);

    expect(redisMocks.set).toHaveBeenCalledWith(LOCK_KEY, expect.any(String), {
      nx: true,
      px: 30_000,
    });
    expect(redisMocks.del).toHaveBeenCalledWith(LOCK_KEY);

    redisMocks.del.mockClear();
    redisMocks.set.mockResolvedValue('OK');
    redisMocks.get.mockResolvedValue('someone-else' as never);
    const { withUserSandboxLock } = await import('../session-store');
    await withUserSandboxLock({ tenantId: 'managed-cloud', userId: 'user-a' }, async () => 0);
    expect(redisMocks.del).not.toHaveBeenCalled();
  });
});
