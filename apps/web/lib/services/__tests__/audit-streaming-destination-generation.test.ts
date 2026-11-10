import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: vi.fn(async () => undefined),
  pinnedPublicFetch: vi.fn(),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: () => null }));

const { testKeyRing } = vi.hoisted(() => ({
  testKeyRing: { active: { id: 'test-key', material: Buffer.alloc(32, 7) }, retired: [] },
}));
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  organizationKeyRing: vi.fn(async () => ({
    ring: testKeyRing,
    source: 'platform_derived',
    descriptor: null,
    keyVersion: testKeyRing.active.id,
  })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { sealEnvelope } from '@/lib/crypto/envelope';

import { drainAuditDestination } from '../audit-streaming-service';

const ORG = '11111111-1111-4111-8111-111111111111';
const CIPHERTEXT = sealEnvelope(
  testKeyRing,
  'fixture-audit-signing-secret',
  'versioned',
  `organization-audit-destination:${ORG}`,
);

const EVENTS = Array.from({ length: 3 }, (_, index) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
  organization_id: ORG,
  actor_user_id: 'user-1',
  surface: 'web',
  action: 'admin_policy_changed',
  resource_type: 'organization_admin_policy',
  resource_id: ORG,
  outcome: 'success',
  severity: 'info',
  metadata: {},
  created_at: new Date(Date.UTC(2026, 10, 9, 10, 0, index)).toISOString(),
}));

function destinationStore() {
  const destination = {
    endpoint_url: 'https://siem.example.test/hook',
    secret_hash: 'incarnation-a',
    secret_ciphertext: CIPHERTEXT,
    last_delivered_at: null as string | null,
    last_delivered_id: null as string | null,
    consecutive_failures: 0,
  };

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    if (/update public\.organization_audit_destinations/i.test(text)) {
      const fence = /secret_hash = \$(\d+)/.exec(text);
      if (fence && params?.[Number(fence[1]) - 1] !== destination.secret_hash) return [];
      if (/last_delivered_id/.test(text)) {
        const id = String(params?.[1]);
        destination.last_delivered_id = id;
        destination.last_delivered_at =
          EVENTS.find((event) => event.id === id)?.created_at ?? destination.last_delivered_at;
        destination.consecutive_failures = 0;
      } else if (/consecutive_failures = consecutive_failures \+ 1/.test(text)) {
        destination.consecutive_failures += 1;
      }
      return [{ organization_id: ORG }];
    }
    if (/from public\.enterprise_audit_events/i.test(text)) {
      const fence = /d\.secret_hash = \$(\d+)/.exec(text);
      if (fence && params?.[Number(fence[1]) - 1] !== destination.secret_hash) return [];
      const after = destination.last_delivered_id;
      const start = after === null ? 0 : EVENTS.findIndex((event) => event.id === after) + 1;
      return EVENTS.slice(start);
    }
    if (/from public\.organization_audit_destinations/i.test(text)) return [{ ...destination }];
    return [];
  });

  return {
    destination,
    db: { query, execute: vi.fn() } as unknown as DatabaseAdapter,
  };
}

describe('drainAuditDestination across a destination replacement', () => {
  it('does not move a replacement destination past events it never received', async () => {
    const store = destinationStore();
    const fetchImpl = vi.fn(async () => {
      store.destination.secret_hash = 'incarnation-b';
      store.destination.last_delivered_at = null;
      store.destination.last_delivered_id = null;
      store.destination.consecutive_failures = 0;
      return { status: 202, ok: true } as Response;
    }) as unknown as typeof fetch;

    await drainAuditDestination(store.db, ORG, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.destination.last_delivered_id).toBeNull();
    expect(store.destination.last_delivered_at).toBeNull();
  });

  it('does not charge a stale failure to a replacement destination', async () => {
    const store = destinationStore();
    const fetchImpl = vi.fn(async () => {
      store.destination.secret_hash = 'incarnation-b';
      return { status: 500, ok: false } as Response;
    }) as unknown as typeof fetch;

    await drainAuditDestination(store.db, ORG, { fetchImpl });

    expect(store.destination.consecutive_failures).toBe(0);
  });

  it('still advances the cursor when the destination was not replaced', async () => {
    const store = destinationStore();
    const fetchImpl = vi.fn(
      async () => ({ status: 202, ok: true }) as Response,
    ) as unknown as typeof fetch;

    const result = await drainAuditDestination(store.db, ORG, { fetchImpl });

    expect(result.status).toBe('delivered');
    expect(store.destination.last_delivered_id).toBe(EVENTS[EVENTS.length - 1]!.id);
  });
});
