import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DependencyStatus, HealthCheckResult, UnreadyDependency } from '../health-check';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getCachedHealthChecks: vi.fn(),
  resolveRedisOutagePolicy: vi.fn(),
  getKeyValueStore: vi.fn(),
}));

vi.mock('@/lib/server/health-check', () => ({
  DEPENDENCY_LIVE_CHECKS: {},
  NOT_CONFIGURED: 'not configured',
  getCachedHealthChecks: mocks.getCachedHealthChecks,
  runHealthChecks: vi.fn(),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mocks.getKeyValueStore }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/redis-outage-policy', async (importOriginal) => ({
  ...(await importOriginal<RedisOutagePolicyModule>()),
  resolveRedisOutagePolicy: mocks.resolveRedisOutagePolicy,
}));

import {
  maintenanceUnderway,
  readIncidentRecoveries,
  readServiceNotices,
} from '../service-notices';

type RedisOutagePolicyModule = typeof import('@/lib/redis-outage-policy');

type CheckName = Exclude<keyof HealthCheckResult['checks'], 'environment'>;

function unready(id: string, criticality: UnreadyDependency['criticality']): UnreadyDependency {
  return { id, criticality, missing: [`${id.toUpperCase()}_ENV`] };
}

function billingDependency(
  failing: readonly CheckName[],
  unreadyDependencies: readonly UnreadyDependency[],
): DependencyStatus {
  const unconfigured = unreadyDependencies.some(({ id }) => id === 'billing');
  return {
    id: 'billing',
    criticality: 'degradable',
    observation: unconfigured ? 'unconfigured' : failing.includes('stripe') ? 'failing' : 'ok',
    signal: null,
    dashboard: null,
  };
}

function health({
  failing = [],
  unreadyDependencies = [],
  timestamp = '2026-10-02T06:00:00.000Z',
  billingBlocked = true,
}: {
  failing?: readonly CheckName[];
  unreadyDependencies?: readonly UnreadyDependency[];
  timestamp?: string;
  billingBlocked?: boolean;
} = {}): HealthCheckResult {
  const check = (name: CheckName) =>
    failing.includes(name)
      ? { status: 'unhealthy' as const, message: 'unavailable' }
      : { status: 'healthy' as const };
  const unreadyCore = unreadyDependencies.filter(({ criticality }) => criticality === 'core');
  const coreDown =
    unreadyCore.length > 0 || failing.includes('database') || failing.includes('cache');
  return {
    status: coreDown ? 'unhealthy' : failing.length > 0 ? 'degraded' : 'healthy',
    timestamp,
    dependencies: [billingDependency(failing, unreadyDependencies)],
    checks: {
      database: check('database'),
      stripe: failing.includes('stripe')
        ? { ...check('stripe'), blocksBilling: billingBlocked }
        : check('stripe'),
      environment: {
        status: unreadyCore.length > 0 ? 'unhealthy' : 'healthy',
        ...(unreadyCore.length > 0 ? { missingCount: unreadyCore.length } : {}),
        ...(unreadyDependencies.length > 0
          ? { unreadyDependencies: [...unreadyDependencies] }
          : {}),
      },
      chat: check('chat'),
      work: check('work'),
      voice: check('voice'),
      search: check('search'),
      vector: check('vector'),
      cache: check('cache'),
      email: check('email'),
      identity: check('identity'),
    },
  };
}

interface StoredEntry {
  value: unknown;
  ttlSeconds: number | undefined;
}

function memoryStore() {
  const entries = new Map<string, StoredEntry>();
  return {
    entries,
    expire(key: string) {
      entries.delete(key);
    },
    store: {
      get: vi.fn(async (key: string) => entries.get(key)?.value ?? null),
      set: vi.fn(async (key: string, value: unknown, options?: { ttlSeconds?: number }) => {
        entries.set(key, { value, ttlSeconds: options?.ttlSeconds });
        return true;
      }),
    },
  };
}

function scopes(notices: Awaited<ReturnType<typeof readServiceNotices>>) {
  return notices.map(({ kind, scope, tone }) => ({ kind, scope, tone }));
}

describe('readServiceNotices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['AGI_MAINTENANCE_WINDOW'];
    mocks.resolveRedisOutagePolicy.mockReturnValue('fail-open');
    mocks.getKeyValueStore.mockReturnValue(null);
  });

  it('keeps billing trouble and a missing shared store off every product page', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(
      health({ failing: ['stripe'], unreadyDependencies: [unready('key_value', 'core')] }),
    );

    const notices = await readServiceNotices();

    expect(scopes(notices)).toEqual([{ kind: 'incident', scope: 'billing', tone: 'warning' }]);
    expect(notices[0]?.message).toMatch(/billing/i);
    expect(notices[0]?.href).toBe('/status');
  });

  it('says nothing about billing when only a price no plan on sale uses has gone stale', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(
      health({ failing: ['stripe'], billingBlocked: false }),
    );

    expect(await readServiceNotices()).toEqual([]);
  });

  it('says nothing about billing where billing is not configured at all', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(
      health({ failing: ['stripe'], unreadyDependencies: [unready('billing', 'degradable')] }),
    );

    expect(await readServiceNotices()).toEqual([]);
  });

  it('keeps one id for an incident across health checks, so a dismissal holds', async () => {
    mocks.getCachedHealthChecks.mockResolvedValueOnce(
      health({ failing: ['database', 'stripe'], timestamp: '2026-10-02T06:00:00.000Z' }),
    );
    mocks.getCachedHealthChecks.mockResolvedValueOnce(
      health({ failing: ['database', 'stripe'], timestamp: '2026-10-02T06:07:00.000Z' }),
    );

    const first = (await readServiceNotices()).map(({ id }) => id);
    const second = (await readServiceNotices()).map(({ id }) => id);

    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });

  it.each<CheckName>(['database', 'chat', 'identity', 'cache'])(
    'raises the product incident when %s is down',
    async (failing) => {
      mocks.resolveRedisOutagePolicy.mockReturnValue('fail-closed');
      mocks.getCachedHealthChecks.mockResolvedValue(health({ failing: [failing] }));

      const notices = await readServiceNotices();

      expect(scopes(notices)).toEqual([{ kind: 'incident', scope: 'product', tone: 'danger' }]);
      expect(notices[0]?.message).toBe(
        'AGI is having a problem right now, and some requests may fail. We are working on it.',
      );
    },
  );

  it('raises the product incident when sign-in is not configured', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(
      health({ unreadyDependencies: [unready('identity', 'core')] }),
    );

    expect(scopes(await readServiceNotices())).toEqual([
      { kind: 'incident', scope: 'product', tone: 'danger' },
    ]);
  });

  it('treats the shared store as blocking only where its absence refuses turns', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(
      health({ failing: ['cache'], unreadyDependencies: [unready('key_value', 'core')] }),
    );

    expect(await readServiceNotices()).toEqual([]);

    mocks.resolveRedisOutagePolicy.mockReturnValue('fail-closed');

    expect(scopes(await readServiceNotices())).toEqual([
      { kind: 'incident', scope: 'product', tone: 'danger' },
    ]);
  });

  it('stays quiet for degradable capabilities that leave chat working', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(
      health({
        failing: ['work', 'voice', 'search', 'vector'],
        unreadyDependencies: [
          unready('web_search', 'degradable'),
          unready('signaling', 'optional'),
        ],
      }),
    );

    expect(await readServiceNotices()).toEqual([]);
  });

  it('shows the product incident and the billing notice side by side when both are down', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(health({ failing: ['database', 'stripe'] }));

    const notices = await readServiceNotices();

    expect(scopes(notices)).toEqual([
      { kind: 'incident', scope: 'product', tone: 'danger' },
      { kind: 'incident', scope: 'billing', tone: 'warning' },
    ]);
    expect(new Set(notices.map(({ id }) => id)).size).toBe(2);
  });

  it('says nothing when the health read does not answer', async () => {
    mocks.getCachedHealthChecks.mockRejectedValue(new Error('cache miss and probe failed'));

    expect(await readServiceNotices()).toEqual([]);
  });

  it('announces planned maintenance across the product with readable UTC times', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(health());
    process.env['AGI_MAINTENANCE_WINDOW'] = '2026-10-02T08:00:00.000Z/2026-10-02T09:00:00.000Z';

    const notices = await readServiceNotices(new Date('2026-10-02T07:00:00.000Z'));

    expect(scopes(notices)).toEqual([{ kind: 'maintenance', scope: 'product', tone: 'info' }]);
    expect(notices[0]?.href).toBe('/maintenance');
    expect(notices[0]?.message).toBe(
      'Planned maintenance from Oct 2, 2026, 8:00 AM UTC to Oct 2, 2026, 9:00 AM UTC. New chats will be paused while it runs, and open chats may be interrupted.',
    );
  });

  it('says when maintenance under way ends', async () => {
    mocks.getCachedHealthChecks.mockResolvedValue(health());
    process.env['AGI_MAINTENANCE_WINDOW'] = '2026-10-02T08:00:00.000Z/2026-10-02T09:00:00.000Z';

    const notices = await readServiceNotices(new Date('2026-10-02T08:30:00.000Z'));

    expect(scopes(notices)).toEqual([{ kind: 'maintenance', scope: 'product', tone: 'warning' }]);
    expect(notices[0]?.message).toBe(
      'Planned maintenance is under way until Oct 2, 2026, 9:00 AM UTC. New chats are paused, and chats already open may be interrupted.',
    );
  });

  it('reports maintenance as under way only between its start and its end', () => {
    process.env['AGI_MAINTENANCE_WINDOW'] = '2026-10-02T08:00:00.000Z/2026-10-02T09:00:00.000Z';

    expect(maintenanceUnderway(new Date('2026-10-02T07:59:59.999Z'))).toBeNull();
    expect(maintenanceUnderway(new Date('2026-10-02T08:00:00.000Z'))).not.toBeNull();
    expect(maintenanceUnderway(new Date('2026-10-02T08:59:59.999Z'))).not.toBeNull();
    expect(maintenanceUnderway(new Date('2026-10-02T09:00:00.000Z'))).toBeNull();

    delete process.env['AGI_MAINTENANCE_WINDOW'];
    expect(maintenanceUnderway(new Date('2026-10-02T08:30:00.000Z'))).toBeNull();
  });
});

describe('incident recovery', () => {
  const failingAt = new Date('2026-10-02T06:00:00.000Z');
  const laterAt = new Date('2026-10-02T06:10:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['AGI_MAINTENANCE_WINDOW'];
    mocks.resolveRedisOutagePolicy.mockReturnValue('fail-open');
  });

  it('says the service is restored but not fully recovered once a seen incident clears', async () => {
    const memory = memoryStore();
    mocks.getKeyValueStore.mockReturnValue(memory.store);
    mocks.getCachedHealthChecks.mockResolvedValueOnce(health({ failing: ['database'] }));
    mocks.getCachedHealthChecks.mockResolvedValueOnce(health());

    const during = await readServiceNotices(failingAt);
    const after = await readServiceNotices(laterAt);

    expect(during.map(({ id }) => id)).toEqual(['incident:product']);
    expect(after).toEqual([
      {
        id: 'restored:product',
        kind: 'incident',
        tone: 'warning',
        scope: 'product',
        message:
          'AGI is working again after a problem. We are monitoring it and have not called it fully recovered yet.',
        href: '/status',
        linkLabel: 'Status',
      },
    ]);
  });

  it('keeps the restored notice for an hour after the last failing read, then says nothing', async () => {
    const memory = memoryStore();
    mocks.getKeyValueStore.mockReturnValue(memory.store);
    mocks.getCachedHealthChecks.mockResolvedValueOnce(health({ failing: ['stripe'] }));

    await readServiceNotices(failingAt);

    const [key] = [...memory.entries.keys()];
    expect(key).toBe('agi-service-notice:last-failing:billing');
    expect(memory.entries.get(key!)?.ttlSeconds).toBe(3_600);

    mocks.getCachedHealthChecks.mockResolvedValue(health());
    expect(scopes(await readServiceNotices(laterAt))).toEqual([
      { kind: 'incident', scope: 'billing', tone: 'warning' },
    ]);
    expect((await readServiceNotices(laterAt))[0]?.id).toBe('restored:billing');

    memory.expire(key!);
    expect(await readServiceNotices(laterAt)).toEqual([]);
  });

  it('shows the live incident, not a recovery, while the failure continues', async () => {
    const memory = memoryStore();
    mocks.getKeyValueStore.mockReturnValue(memory.store);
    mocks.getCachedHealthChecks.mockResolvedValue(health({ failing: ['database'] }));

    await readServiceNotices(failingAt);
    const still = await readServiceNotices(laterAt);

    expect(still.map(({ id }) => id)).toEqual(['incident:product']);
    expect(memory.entries.get('agi-service-notice:last-failing:product')?.value).toEqual({
      atMs: laterAt.getTime(),
    });
  });

  it('claims no recovery when the health read does not answer', async () => {
    const memory = memoryStore();
    mocks.getKeyValueStore.mockReturnValue(memory.store);
    memory.entries.set('agi-service-notice:last-failing:product', {
      value: { atMs: failingAt.getTime() },
      ttlSeconds: 3_600,
    });
    mocks.getCachedHealthChecks.mockRejectedValue(new Error('probe failed'));

    expect(await readServiceNotices(laterAt)).toEqual([]);
    expect(await readIncidentRecoveries(laterAt)).toEqual([]);
  });

  it('still raises the live incident when the recovery store cannot be written', async () => {
    mocks.getKeyValueStore.mockReturnValue({
      get: vi.fn(async () => {
        throw new Error('store down');
      }),
      set: vi.fn(async () => {
        throw new Error('store down');
      }),
    });
    mocks.getCachedHealthChecks.mockResolvedValue(health({ failing: ['database'] }));

    expect((await readServiceNotices(failingAt)).map(({ id }) => id)).toEqual(['incident:product']);
  });

  it('gives the status page the scope and the last time it was seen failing', async () => {
    const memory = memoryStore();
    mocks.getKeyValueStore.mockReturnValue(memory.store);
    mocks.getCachedHealthChecks.mockResolvedValueOnce(health({ failing: ['identity'] }));
    mocks.getCachedHealthChecks.mockResolvedValueOnce(health());

    await readIncidentRecoveries(failingAt);

    expect(await readIncidentRecoveries(laterAt)).toEqual([
      { scope: 'product', lastFailingAt: failingAt },
    ]);
  });
});
