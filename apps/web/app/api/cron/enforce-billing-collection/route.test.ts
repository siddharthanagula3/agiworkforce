import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const recordAuditEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent }));

vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: vi.fn(() => ({ fromEmail: 'billing@agiworkforce.com' })),
  isValidEmail: vi.fn(() => true),
}));

const sendTransactionalEmail = vi.hoisted(() => vi.fn());
vi.mock('@/lib/support/handoff/resend-client', () => ({ sendTransactionalEmail }));

const dbQuery = vi.hoisted(() => vi.fn());
const dbExecute = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: dbQuery, execute: dbExecute })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { GET, enforceBillingCollection } from './route';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function daysAgoIso(days: number): string {
  return new Date(NOW - days * MS_PER_DAY).toISOString();
}

interface MakeDbOptions {
  organizationRow?: Record<string, unknown> | null;
  seatUpdateResult?: unknown[] | ((params: unknown[]) => unknown[]);
}

function makeDb(rows: unknown[], options: MakeDbOptions = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('from public.organization_billing_contracts')) return rows;
    if (sql.includes('update public.organizations')) {
      const result =
        typeof options.seatUpdateResult === 'function'
          ? options.seatUpdateResult(params)
          : options.seatUpdateResult;
      return result ?? [];
    }
    if (sql.includes('licensed_seats') && sql.includes('from public.organizations')) {
      return options.organizationRow ? [options.organizationRow] : [];
    }
    return [];
  });
  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return [];
  });
  return { db: { query, execute } as unknown as DatabaseAdapter, calls };
}

function contractRow(overrides: Record<string, unknown> = {}) {
  return {
    organization_id: 'org_1',
    oldest_open_invoice_due_at: daysAgoIso(10),
    collection_stage: 'current',
    last_collection_notice_at: null,
    owner_email: 'owner@example.com',
    committed_seats: 500,
    stripe_subscription_id: 'sub_ent_1',
    stripe_customer_id: 'cus_ent_1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  vi.stubEnv('BILLING_ALERT_EMAIL', 'billing-alerts@agiworkforce.com');
  sendTransactionalEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function cronRequest(secret?: string): Request {
  return new Request('https://agiworkforce.com/api/cron/enforce-billing-collection', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe('GET /api/cron/enforce-billing-collection', () => {
  it('rejects an unauthorized caller without touching billing state', async () => {
    const response = await GET(cronRequest() as never);
    expect(response.status).toBe(401);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('runs the enforcement sweep for an authorized caller', async () => {
    dbQuery.mockResolvedValue([]);
    const response = await GET(cronRequest('cron-secret') as never);
    expect(response.status).toBe(200);
  });
});

describe('enforceBillingCollection · stage transitions', () => {
  it('persists a stage change with collection_stage_changed_at and records an audit event', async () => {
    const { db, calls } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(10) })]);

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]).toMatchObject({
      organizationId: 'org_1',
      stage: 'past_due_30',
      changed: true,
    });
    const stageUpdate = calls.find((call) => call.sql.includes('set collection_stage'));
    expect(stageUpdate).toBeDefined();
    expect(stageUpdate!.params).toEqual(['org_1', 'past_due_30', expect.any(String)]);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        detail: expect.objectContaining({
          reason: 'collection_stage_changed',
          status: 'past_due_30',
        }),
      }),
    );
  });

  it('does not touch the stage or write an audit event when nothing changed', async () => {
    const { db, calls } = makeDb([
      contractRow({ oldest_open_invoice_due_at: daysAgoIso(10), collection_stage: 'past_due_30' }),
    ]);

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.changed).toBe(false);
    expect(calls.some((call) => call.sql.includes('set collection_stage'))).toBe(false);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it('never deletes anything, even at read_only', async () => {
    const { db, calls } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(120) })]);

    await enforceBillingCollection(db, NOW);

    expect(calls.some((call) => /delete/iu.test(call.sql))).toBe(false);
  });
});

describe('enforceBillingCollection · owner notices', () => {
  it('emails the owner on entering past_due_30, past_due_60 and read_only', async () => {
    for (const days of [10, 45, 100]) {
      sendTransactionalEmail.mockClear();
      const { db } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(days) })]);
      await enforceBillingCollection(db, NOW);
      expect(sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'owner@example.com' }),
      );
    }
  });

  it('does not email the owner while nothing changed', async () => {
    const { db } = makeDb([
      contractRow({ oldest_open_invoice_due_at: daysAgoIso(10), collection_stage: 'past_due_30' }),
    ]);

    await enforceBillingCollection(db, NOW);

    expect(sendTransactionalEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com' }),
    );
  });

  it('logs rather than throws when the owner has no email on file', async () => {
    const { db } = makeDb([
      contractRow({ oldest_open_invoice_due_at: daysAgoIso(10), owner_email: null }),
    ]);

    await expect(enforceBillingCollection(db, NOW)).resolves.toHaveLength(1);
  });
});

describe('enforceBillingCollection · internal escalation', () => {
  it('emails BILLING_ALERT_EMAIL on every stage change', async () => {
    const { db } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(10) })]);

    await enforceBillingCollection(db, NOW);

    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'billing-alerts@agiworkforce.com' }),
    );
  });

  it('repeats daily while at past_due_60 or later even with no stage change', async () => {
    const { db, calls } = makeDb([
      contractRow({
        oldest_open_invoice_due_at: daysAgoIso(45),
        collection_stage: 'past_due_60',
        last_collection_notice_at: daysAgoIso(2),
      }),
    ]);

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.changed).toBe(false);
    expect(outcomes[0]!.internalNotified).toBe(true);
    expect(calls.some((call) => call.sql.includes('set last_collection_notice_at'))).toBe(true);
  });

  it('throttles the daily repeat to once per day', async () => {
    const { db } = makeDb([
      contractRow({
        oldest_open_invoice_due_at: daysAgoIso(45),
        collection_stage: 'past_due_60',
        last_collection_notice_at: daysAgoIso(0.1),
      }),
    ]);

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.internalNotified).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('does not repeat daily below past_due_60 with no stage change', async () => {
    const { db } = makeDb([
      contractRow({ oldest_open_invoice_due_at: daysAgoIso(10), collection_stage: 'past_due_30' }),
    ]);

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.internalNotified).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('logs rather than throws when BILLING_ALERT_EMAIL is not configured', async () => {
    vi.stubEnv('BILLING_ALERT_EMAIL', '');
    const { db } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(10) })]);

    await expect(enforceBillingCollection(db, NOW)).resolves.toHaveLength(1);
    expect(sendTransactionalEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining('billing-alerts') }),
    );
  });
});

describe('enforceBillingCollection · seat catch-up once collection returns to current', () => {
  it('raises licensed_seats to the committed seat count once the hold lifts', async () => {
    const { db, calls } = makeDb(
      [
        contractRow({
          oldest_open_invoice_due_at: null,
          collection_stage: 'past_due_90',
          committed_seats: 600,
        }),
      ],
      {
        organizationRow: {
          licensed_seats: 500,
          seats_consumed: 200,
          stripe_subscription_id: 'sub_ent_1',
          owner_user_id: 'user_ent_1',
        },
        seatUpdateResult: (params) => [{ id: 'org_1', licensed_seats: params[0] }],
      },
    );

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]).toMatchObject({
      organizationId: 'org_1',
      stage: 'current',
      seatCatchUp: 'persisted',
    });
    const seatUpdate = calls.find(
      (call) =>
        call.sql.includes('update public.organizations') && call.sql.includes('licensed_seats'),
    );
    expect(seatUpdate).toBeDefined();
    expect(seatUpdate!.params[0]).toBe(600);
    expect(seatUpdate!.params.at(-1)).toBe('user_ent_1');
  });

  it('does not raise seats while the collection hold is still active', async () => {
    const { db, calls } = makeDb(
      [
        contractRow({
          oldest_open_invoice_due_at: daysAgoIso(75),
          collection_stage: 'past_due_90',
          committed_seats: 600,
        }),
      ],
      {
        organizationRow: {
          licensed_seats: 500,
          seats_consumed: 200,
          stripe_subscription_id: 'sub_ent_1',
          owner_user_id: 'user_ent_1',
        },
      },
    );

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]).toMatchObject({ stage: 'past_due_90', seatCatchUp: null });
    expect(
      calls.some(
        (call) =>
          call.sql.includes('update public.organizations') && call.sql.includes('licensed_seats'),
      ),
    ).toBe(false);
  });

  it('does nothing when committed_seats does not exceed licensed_seats', async () => {
    const { db, calls } = makeDb(
      [contractRow({ oldest_open_invoice_due_at: null, committed_seats: 500 })],
      {
        organizationRow: {
          licensed_seats: 500,
          seats_consumed: 200,
          stripe_subscription_id: 'sub_ent_1',
          owner_user_id: 'user_ent_1',
        },
      },
    );

    const outcomes = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.seatCatchUp).toBeNull();
    expect(
      calls.some(
        (call) =>
          call.sql.includes('update public.organizations') && call.sql.includes('licensed_seats'),
      ),
    ).toBe(false);
  });

  it('queries a contract with no open invoice but a stale non-current stage, not only open-invoice contracts', async () => {
    const { db, calls } = makeDb([]);

    await enforceBillingCollection(db, NOW);

    const contractsQuery = calls.find((call) =>
      call.sql.includes('from public.organization_billing_contracts'),
    );
    expect(contractsQuery!.sql).toMatch(
      /oldest_open_invoice_due_at is not null\s+or\s+c\.collection_stage\s*<>/u,
    );
  });
});
