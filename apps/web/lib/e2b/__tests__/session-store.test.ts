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
  const actual = await importOriginal<typeof import('@agiworkforce/key-value')>();
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
