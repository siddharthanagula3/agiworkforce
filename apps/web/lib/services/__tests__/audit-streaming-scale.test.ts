import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: vi.fn(async () => undefined),
  pinnedPublicFetch: vi.fn(),
}));
vi.mock('@/lib/server/key-value', () => ({ getKeyValueStore: () => null }));

const { testKeyRing, mockOrganizationKeyRing } = vi.hoisted(() => {
  const ring = { active: { id: 'test-key', material: Buffer.alloc(32, 7) }, retired: [] };
  return {
    testKeyRing: ring,
    mockOrganizationKeyRing: vi.fn(async () => ({
      ring,
      source: 'platform_derived',
      descriptor: null,
      keyVersion: ring.active.id,
    })),
  };
});
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  organizationKeyRing: mockOrganizationKeyRing,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { sealEnvelope } from '@/lib/crypto/envelope';

import { AUDIT_STREAM_BATCH, drainAuditDestination } from '../audit-streaming-service';
import { AUDIT_STREAM_MAX_BODY_BYTES, buildBoundedDeliveryBody } from '../audit-streaming-proxy';

const ORG = '11111111-1111-4111-8111-111111111111';
const VOLUME = 5_000;
const SIGNING_CIPHERTEXT = sealEnvelope(
  testKeyRing,
  'fixture-audit-signing-secret',
  'versioned',
  `organization-audit-destination:${ORG}`,
);

function queue(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
    organization_id: ORG,
    actor_user_id: 'user-1',
    surface: 'web',
    action: 'admin_policy_changed',
    resource_type: 'organization_admin_policy',
    resource_id: ORG,
    outcome: 'success',
    severity: 'info',
    metadata: { before: { retentionDays: 30 }, after: { retentionDays: 90 } },
    created_at: new Date(Date.UTC(2026, 7, 23, 10, 0, 0) + index).toISOString(),
  }));
}

function siem(events: ReturnType<typeof queue>) {
  const destination = {
    endpoint_url: 'https://siem.example.test/hook',
    secret_ciphertext: SIGNING_CIPHERTEXT,
    last_delivered_at: null as string | null,
    last_delivered_id: null as string | null,
    consecutive_failures: 0,
  };
  const queriesPerDrain: number[] = [];
  let queries = 0;

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    queries += 1;
    const text = String(sql);
    if (/update public\.organization_audit_destinations/i.test(text)) {
      if (/last_delivered_id/.test(text)) {
        const id = String(params?.[1]);
        destination.last_delivered_id = id;
        destination.last_delivered_at =
          events.find((event) => event.id === id)?.created_at ?? destination.last_delivered_at;
      }
      return [];
    }
    if (/from public\.enterprise_audit_events/i.test(text)) {
      const after = destination.last_delivered_id;
      const start = after === null ? 0 : events.findIndex((event) => event.id === after) + 1;
      return events.slice(start, start + AUDIT_STREAM_BATCH);
    }
    if (/from public\.organization_audit_destinations/i.test(text)) return [destination];
    return [];
  });

  const received: string[] = [];
  const bodyBytes: number[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
    bodyBytes.push(Buffer.byteLength(init.body, 'utf8'));
    for (const event of (JSON.parse(init.body) as { events: { id: string }[] }).events) {
      received.push(event.id);
    }
    return { status: 202, ok: true } as Response;
  }) as unknown as typeof fetch;

  return {
    db: { query, execute: vi.fn() } as unknown as DatabaseAdapter,
    received,
    bodyBytes,
    fetchImpl,
    markDrain() {
      queriesPerDrain.push(queries);
      queries = 0;
    },
    queriesPerDrain,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('audit streaming at volume', () => {
  it('drains five thousand events in whole batches, each one exactly once', async () => {
    const events = queue(VOLUME);
    const harness = siem(events);

    let drains = 0;
    for (;;) {
      const result = await drainAuditDestination(harness.db, ORG, { fetchImpl: harness.fetchImpl });
      harness.markDrain();
      drains += 1;
      if (result.status === 'nothing_due') break;
      expect(result.status).toBe('delivered');
      expect(result.delivered).toBe(AUDIT_STREAM_BATCH);
      if (drains > VOLUME) throw new Error('drain did not terminate');
    }

    expect(drains).toBe(VOLUME / AUDIT_STREAM_BATCH + 1);
    expect(harness.received).toEqual(events.map((event) => event.id));
  });

  it('keeps each delivery bounded and each drain a fixed number of queries', async () => {
    const events = queue(VOLUME);
    const harness = siem(events);

    for (let drain = 0; drain < VOLUME / AUDIT_STREAM_BATCH; drain += 1) {
      await drainAuditDestination(harness.db, ORG, { fetchImpl: harness.fetchImpl });
      harness.markDrain();
    }

    expect(Math.max(...harness.bodyBytes)).toBeLessThanOrEqual(AUDIT_STREAM_MAX_BODY_BYTES);
    expect(new Set(harness.queriesPerDrain)).toEqual(new Set([3]));
  });

  it('shortens the batch rather than the queue when events are large', () => {
    const events = queue(AUDIT_STREAM_BATCH).map((event) => ({
      ...event,
      metadata: { blob: 'x'.repeat(50_000) },
    }));

    const { sent } = buildBoundedDeliveryBody({
      schema: 'agiworkforce.enterprise-audit',
      schemaVersion: 1,
      organizationId: ORG,
      deliveredAt: '2026-08-23T12:00:00.000Z',
      events,
    });

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.length).toBeLessThan(events.length);
  });
});
