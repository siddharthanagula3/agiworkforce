import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { mockAssertPublic } = vi.hoisted(() => ({ mockAssertPublic: vi.fn(async () => undefined) }));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: mockAssertPublic,
  pinnedPublicFetch: vi.fn(),
}));

const { mockGetKeyValueStore } = vi.hoisted(() => ({
  mockGetKeyValueStore: vi.fn(() => null as unknown),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: mockGetKeyValueStore }));

import {
  createUpstashKeyValueStore,
  type KeyValueStore,
  type UpstashRedisLike,
} from '@agiworkforce/key-value';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

function asKeyValueStore(client: unknown): KeyValueStore {
  return createUpstashKeyValueStore(client as UpstashRedisLike);
}

import {
  AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY,
  AUDIT_STREAM_BATCH,
  AUDIT_STREAM_FAILURE_CEILING,
  deleteAuditDestination,
  drainAuditDestination,
  generateSigningSecret,
  hasActiveAuditStreamDestinations,
  signPayload,
  upsertAuditDestination,
  verifySignature,
} from '../audit-streaming-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-08-23T12:00:00.000Z');

function event(i: number, at = '2026-08-23T10:00:00.000Z') {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
    organization_id: ORG,
    actor_user_id: 'user-1',
    surface: 'web',
    action: 'admin_policy_changed',
    resource_type: 'organization_admin_policy',
    resource_id: ORG,
    outcome: 'success',
    severity: 'info',
    metadata: {},
    created_at: at,
  };
}

function harness({
  destination = {
    endpoint_url: 'https://siem.example.test/hook',
    secret_hash: 'a'.repeat(64),
    last_delivered_at: null as string | null,
    last_delivered_id: null as string | null,
    consecutive_failures: 0,
  } as Record<string, unknown> | null,
  events = [event(1)],
  responseStatus = 202,
  fetchThrows = false,
} = {}) {
  const updates: unknown[][] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    if (/from public\.organization_audit_destinations/i.test(text)) {
      return destination ? [destination] : [];
    }
    if (/update public\.organization_audit_destinations/i.test(text)) {
      updates.push([text, ...(params ?? [])]);
      return [];
    }
    if (/from public\.enterprise_audit_events/i.test(text)) return events;
    return [];
  });

  const fetchImpl = vi.fn(async () => {
    if (fetchThrows) throw new Error('ECONNREFUSED');
    return {
      status: responseStatus,
      ok: responseStatus >= 200 && responseStatus < 300,
    } as Response;
  }) as unknown as typeof fetch;

  return {
    db: { query, execute: vi.fn() } as unknown as DatabaseAdapter,
    query,
    updates,
    fetchImpl,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertPublic.mockResolvedValue(undefined);
  mockGetKeyValueStore.mockReturnValue(null);
});

describe('signing', () => {
  it('mints a secret that is returned once and stored only as a hash', () => {
    const minted = generateSigningSecret();
    expect(minted.secret).toHaveLength(64);
    expect(minted.hash).not.toBe(minted.secret);
    expect(minted.prefix).toBe(minted.secret.slice(0, 8));
  });

  it('binds the timestamp into the signature, not merely alongside it', () => {
    // Otherwise a captured delivery replays later with a fresh header.
    const a = signPayload('secret', '2026-08-23T12:00:00.000Z', '{}');
    const b = signPayload('secret', '2026-08-23T13:00:00.000Z', '{}');
    expect(a).not.toBe(b);
  });

  it('verifies a genuine signature and rejects a forged one', () => {
    const ts = NOW.toISOString();
    const sig = signPayload('secret', ts, '{"a":1}');
    expect(verifySignature('secret', ts, '{"a":1}', sig)).toBe(true);
    expect(verifySignature('secret', ts, '{"a":2}', sig)).toBe(false);
    expect(verifySignature('other', ts, '{"a":1}', sig)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    expect(verifySignature('secret', NOW.toISOString(), '{}', 'short')).toBe(false);
  });
});

describe('upsertAuditDestination', () => {
  it('refuses a URL that resolves to a private address', async () => {
    // A customer-supplied URL points wherever they say. Without this a
    // workspace could make the server fetch its own internal network.
    mockAssertPublic.mockRejectedValueOnce(new Error('blocked'));
    const h = harness();

    await expect(
      upsertAuditDestination(h.db, ORG, {
        endpointUrl: 'https://internal.test/hook',
        enabled: true,
        createdByUserId: 'user-1',
      }),
    ).rejects.toThrow();

    expect(h.query).not.toHaveBeenCalled();
  });
});

describe('audit stream active-org redis marker', () => {
  function redisMock() {
    return { sadd: vi.fn(), srem: vi.fn(), scard: vi.fn() };
  }

  const insertRow = {
    organization_id: ORG,
    endpoint_url: 'https://siem.example.test/hook',
    secret_prefix: 'abcd1234',
    enabled: true,
    last_delivered_at: null,
    last_delivered_id: null,
    last_attempt_at: null,
    last_status: null,
    consecutive_failures: 0,
    created_at: NOW.toISOString(),
  };

  function upsertHarness() {
    const query = vi.fn(async () => [insertRow]);
    return { db: { query, execute: vi.fn() } as unknown as DatabaseAdapter, query };
  }

  it('marks the organization active in redis when enabling a destination', async () => {
    const redis = redisMock();
    mockGetKeyValueStore.mockReturnValue(asKeyValueStore(redis));
    const h = upsertHarness();

    await upsertAuditDestination(h.db, ORG, {
      endpointUrl: 'https://siem.example.test/hook',
      enabled: true,
      createdByUserId: 'user-1',
    });

    expect(redis.sadd).toHaveBeenCalledWith(AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY, ORG);
    expect(redis.srem).not.toHaveBeenCalled();
  });

  it('clears the organization from redis when disabling a destination', async () => {
    const redis = redisMock();
    mockGetKeyValueStore.mockReturnValue(asKeyValueStore(redis));
    const h = upsertHarness();

    await upsertAuditDestination(h.db, ORG, {
      endpointUrl: 'https://siem.example.test/hook',
      enabled: false,
      createdByUserId: 'user-1',
    });

    expect(redis.srem).toHaveBeenCalledWith(AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY, ORG);
    expect(redis.sadd).not.toHaveBeenCalled();
  });

  it('clears the organization from redis on delete', async () => {
    const redis = redisMock();
    mockGetKeyValueStore.mockReturnValue(asKeyValueStore(redis));
    const query = vi.fn(async () => [{ organization_id: ORG }]);
    const db = { query, execute: vi.fn() } as unknown as DatabaseAdapter;

    const removed = await deleteAuditDestination(db, ORG);

    expect(removed).toBe(true);
    expect(redis.srem).toHaveBeenCalledWith(AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY, ORG);
  });

  it('does not block the save when redis is unavailable', async () => {
    mockGetKeyValueStore.mockReturnValue(null);
    const h = upsertHarness();

    await expect(
      upsertAuditDestination(h.db, ORG, {
        endpointUrl: 'https://siem.example.test/hook',
        enabled: true,
        createdByUserId: 'user-1',
      }),
    ).resolves.toBeDefined();
  });

  it('reports true when the active set is non-empty', async () => {
    const redis = redisMock();
    redis.scard.mockResolvedValue(2);
    mockGetKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    await expect(hasActiveAuditStreamDestinations()).resolves.toBe(true);
  });

  it('reports false when the active set is empty', async () => {
    const redis = redisMock();
    redis.scard.mockResolvedValue(0);
    mockGetKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    await expect(hasActiveAuditStreamDestinations()).resolves.toBe(false);
  });

  it('reports null when redis is unavailable, so the caller falls through to Postgres', async () => {
    mockGetKeyValueStore.mockReturnValue(null);

    await expect(hasActiveAuditStreamDestinations()).resolves.toBeNull();
  });

  it('reports null instead of throwing when redis errors', async () => {
    const redis = redisMock();
    redis.scard.mockRejectedValue(new Error('redis down'));
    mockGetKeyValueStore.mockReturnValue(asKeyValueStore(redis));

    await expect(hasActiveAuditStreamDestinations()).resolves.toBeNull();
  });
});

/**
 * The cursor advances only through the event id: `last_delivered_at` is
 * resolved from that id inside the database, never sent as a parameter.
 */
function advancesCursor(sql: string): boolean {
  return /last_delivered_id = \$2/.test(sql);
}

describe('drainAuditDestination', () => {
  it('does nothing without an enabled destination', async () => {
    const h = harness({ destination: null });
    const result = await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    expect(result.status).toBe('skipped');
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('skips a destination that has failed too many times running', async () => {
    // A dead endpoint retried forever would consume the drain and starve every
    // other workspace.
    const h = harness({
      destination: {
        endpoint_url: 'https://siem.example.test/hook',
        secret_hash: 'a'.repeat(64),
        last_delivered_at: null,
        last_delivered_id: null,
        consecutive_failures: AUDIT_STREAM_FAILURE_CEILING,
      },
    });
    const result = await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    expect(result.status).toBe('skipped');
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('reports nothing due rather than sending an empty delivery', async () => {
    const h = harness({ events: [] });
    const result = await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    expect(result.status).toBe('nothing_due');
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('signs the delivery and advances the cursor on success', async () => {
    const h = harness();
    const result = await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    expect(result.status).toBe('delivered');
    expect(result.delivered).toBe(1);

    const [, init] = (h.fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.headers['X-AGI-Audit-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(init.headers['X-AGI-Audit-Timestamp']).toBe(NOW.toISOString());

    const advanced = h.updates.find((u) => advancesCursor(String(u[0])));
    expect(advanced, 'the cursor must advance after a 2xx').toBeDefined();
  });

  it('HOLDS the cursor when delivery fails, so events are retried not dropped', async () => {
    // A stream that drops events on a transient error is worse than one that
    // repeats them: a receiver can deduplicate on the event id and cannot
    // recover what never arrived.
    const h = harness({ responseStatus: 500 });
    const result = await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    expect(result.status).toBe('failed');
    expect(h.updates.some((u) => advancesCursor(String(u[0])))).toBe(false);
    expect(h.updates.some((u) => String(u[0]).includes('consecutive_failures + 1'))).toBe(true);
  });

  it('holds the cursor when the endpoint is unreachable', async () => {
    const h = harness({ fetchThrows: true });
    const result = await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('ECONNREFUSED');
    expect(h.updates.some((u) => advancesCursor(String(u[0])))).toBe(false);
  });

  it('re-validates the endpoint on every send, not only when it was saved', async () => {
    // A destination saved months ago may point at a hostname that now resolves
    // inward.
    const h = harness();
    await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });
    expect(mockAssertPublic).toHaveBeenCalledWith('https://siem.example.test/hook');
  });

  it('does not send when re-validation now refuses the endpoint', async () => {
    const h = harness();
    mockAssertPublic.mockRejectedValueOnce(new Error('blocked'));

    const result = await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });
    expect(h.fetchImpl).not.toHaveBeenCalled();
    expect(result.status).toBe('failed');
  });

  it('uses a keyset cursor with a tiebreak, not a timestamp alone', async () => {
    // created_at is not unique, and a burst sharing a millisecond is exactly
    // what a busy workspace produces.
    const h = harness({
      destination: {
        endpoint_url: 'https://siem.example.test/hook',
        secret_hash: 'a'.repeat(64),
        last_delivered_at: '2026-08-23T09:00:00.000Z',
        last_delivered_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        consecutive_failures: 0,
      },
    });
    await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    const read = h.query.mock.calls.find((c) =>
      /from public\.enterprise_audit_events/i.test(String(c[0])),
    );
    expect(String(read?.[0])).toContain(
      '(e.created_at, e.id) > (d.last_delivered_at, d.last_delivered_id)',
    );
    expect(String(read?.[0])).toContain('order by e.created_at asc, e.id asc');
  });

  it('never sends the cursor timestamp back as a parameter', async () => {
    // `timestamptz` holds microseconds; a JS Date holds milliseconds. Reading
    // the cursor out and passing it back truncates it, which lands the cursor
    // STRICTLY BEFORE the row it was taken from, so that row is selected
    // again on the next drain, and every drain after it, forever. Verified
    // against a real Postgres: a cursor written from `2026-08-24T00:11:25.812267Z`
    // came back as `.812`, and the same batch re-delivered on every run.
    const h = harness({
      destination: {
        endpoint_url: 'https://siem.example.test/hook',
        secret_hash: 'a'.repeat(64),
        last_delivered_at: new Date('2026-08-23T09:00:00.000Z'),
        last_delivered_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        consecutive_failures: 0,
      },
    });
    await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    const cursorParams = [
      ...h.query.mock.calls
        .filter((c) => /from public\.enterprise_audit_events/i.test(String(c[0])))
        .flatMap((c) => (c[1] as unknown[]) ?? []),
      ...h.updates.filter((u) => advancesCursor(String(u[0]))).flatMap((u) => u.slice(1)),
    ];

    expect(cursorParams.length).toBeGreaterThan(0);
    for (const param of cursorParams) {
      expect(param, 'a Date parameter has already lost the microseconds').not.toBeInstanceOf(Date);
      expect(
        typeof param === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(param),
        `an ISO timestamp parameter cannot carry microsecond precision: ${String(param)}`,
      ).toBe(false);
    }
  });

  it('bounds one delivery so a backlog cannot make a single POST enormous', async () => {
    const h = harness();
    await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });

    const read = h.query.mock.calls.find((c) =>
      /from public\.enterprise_audit_events/i.test(String(c[0])),
    );
    expect((read?.[1] as unknown[]).at(-1)).toBe(AUDIT_STREAM_BATCH);
  });

  it('always binds the organization as the first parameter', async () => {
    const h = harness();
    await drainAuditDestination(h.db, ORG, { now: NOW, fetchImpl: h.fetchImpl });
    for (const [, params] of h.query.mock.calls) {
      expect((params as unknown[])[0]).toBe(ORG);
    }
  });
});
