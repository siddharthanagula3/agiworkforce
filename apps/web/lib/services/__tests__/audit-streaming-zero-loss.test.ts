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

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { AUDIT_STREAM_BATCH, drainAuditDestination } from '../audit-streaming-service';
import { AUDIT_STREAM_MAX_BODY_BYTES } from '../audit-streaming-proxy';

const ORG = '11111111-1111-4111-8111-111111111111';

interface QueuedEvent {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  surface: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: string;
  severity: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function queue(count: number, metadata: Record<string, unknown> = {}): QueuedEvent[] {
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
    metadata,
    created_at: new Date(Date.UTC(2026, 7, 23, 10, 0, index)).toISOString(),
  }));
}

/**
 * A destination whose cursor the delivery actually moves, so a held cursor is
 * observable as the same events being offered again on the next drain.
 */
function siem(events: QueuedEvent[]) {
  const destination = {
    endpoint_url: 'https://siem.example.test/hook',
    secret_hash: 'a'.repeat(64),
    last_delivered_at: null as string | null,
    last_delivered_id: null as string | null,
    consecutive_failures: 0,
  };

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    if (/update public\.organization_audit_destinations/i.test(text)) {
      if (/last_delivered_id/.test(text)) {
        const id = String(params?.[1]);
        const row = events.find((event) => event.id === id);
        destination.last_delivered_id = id;
        destination.last_delivered_at = row?.created_at ?? destination.last_delivered_at;
        destination.consecutive_failures = 0;
      } else if (/consecutive_failures = consecutive_failures \+ 1/.test(text)) {
        destination.consecutive_failures += 1;
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
  let outcome: () => { status: number } | never = () => ({ status: 202 });

  const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
    const answer = outcome();
    bodyBytes.push(Buffer.byteLength(init.body, 'utf8'));
    const parsed = JSON.parse(init.body) as { events: { id: string }[] };
    if (answer.status >= 200 && answer.status < 300) {
      for (const event of parsed.events) received.push(event.id);
    }
    return { status: answer.status, ok: answer.status < 300 } as Response;
  }) as unknown as typeof fetch;

  return {
    db: { query, execute: vi.fn() } as unknown as DatabaseAdapter,
    destination,
    received,
    bodyBytes,
    fetchImpl,
    answerWith(next: () => { status: number } | never) {
      outcome = next;
    },
  };
}

async function drainUntilQuiet(harness: ReturnType<typeof siem>, maxRuns = 200) {
  const statuses: string[] = [];
  for (let run = 0; run < maxRuns; run += 1) {
    const result = await drainAuditDestination(harness.db, ORG, { fetchImpl: harness.fetchImpl });
    statuses.push(result.status);
    if (result.status === 'nothing_due') break;
  }
  return statuses;
}

beforeEach(() => vi.clearAllMocks());

describe('audit streaming loses nothing', () => {
  it('replays every event through a run of mixed delivery failures', async () => {
    const events = queue(250);
    const harness = siem(events);

    const failures: (() => { status: number } | never)[] = [
      () => {
        throw new Error('ECONNREFUSED');
      },
      () => ({ status: 500 }),
      () => ({ status: 429 }),
      () => {
        throw Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        });
      },
      () => ({ status: 502 }),
      () => ({ status: 301 }),
    ];
    let attempt = 0;
    harness.answerWith(() => {
      const failure = failures[attempt];
      attempt += 1;
      if (failure) return failure();
      return { status: 202 };
    });

    const statuses = await drainUntilQuiet(harness);

    expect(statuses.filter((status) => status === 'failed')).toHaveLength(failures.length);
    expect(harness.received).toEqual(events.map((event) => event.id));
  });

  it('holds the cursor on every failure so the same events are offered again', async () => {
    const events = queue(10);
    const harness = siem(events);
    harness.answerWith(() => ({ status: 503 }));

    for (let run = 0; run < 3; run += 1) {
      const result = await drainAuditDestination(harness.db, ORG, { fetchImpl: harness.fetchImpl });
      expect(result.status).toBe('failed');
      expect(result.buffered).toBe(10);
    }

    expect(harness.destination.last_delivered_id).toBeNull();
    expect(harness.destination.consecutive_failures).toBe(3);

    harness.answerWith(() => ({ status: 200 }));
    await drainAuditDestination(harness.db, ORG, { fetchImpl: harness.fetchImpl });
    expect(harness.received).toEqual(events.map((event) => event.id));
  });

  it('never re-sends an event the receiver already acknowledged', async () => {
    const events = queue(120);
    const harness = siem(events);

    await drainUntilQuiet(harness);

    expect(harness.received).toHaveLength(events.length);
    expect(new Set(harness.received).size).toBe(events.length);
  });

  it('defers rather than drops the events a body ceiling cannot carry', async () => {
    const events = queue(40, { note: 'x'.repeat(40_000) });
    const harness = siem(events);

    const statuses = await drainUntilQuiet(harness);

    expect(statuses.filter((status) => status === 'delivered').length).toBeGreaterThan(1);
    expect(harness.received).toEqual(events.map((event) => event.id));
    expect(Math.max(...harness.bodyBytes)).toBeLessThanOrEqual(AUDIT_STREAM_MAX_BODY_BYTES);
  });

  it('keeps an event larger than the whole ceiling instead of dropping it', async () => {
    const events = queue(2, { note: 'x'.repeat(AUDIT_STREAM_MAX_BODY_BYTES + 1_000) });
    const harness = siem(events);

    await drainUntilQuiet(harness);

    expect(harness.received).toEqual(events.map((event) => event.id));
  });
});
