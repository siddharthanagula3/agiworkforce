import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KEY_VALUE_PROVIDER_ENV } from '@agiworkforce/key-value';

vi.mock('server-only', () => ({}));

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {
    get(...args: unknown[]) {
      return redisMocks.get(...args);
    }

    set(...args: unknown[]) {
      return redisMocks.set(...args);
    }

    del(...args: unknown[]) {
      return redisMocks.del(...args);
    }
  },
}));

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
