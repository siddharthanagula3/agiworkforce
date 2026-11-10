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

const recordNotification = vi.hoisted(() => vi.fn().mockResolvedValue({ recorded: true }));
vi.mock('@/lib/services/notification-service', () => ({ recordNotification }));

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
    owner_user_id: 'user_owner_1',
    committed_seats: 500,
    stripe_subscription_id: 'sub_ent_1',
    stripe_customer_id: 'cus_ent_1',
    owner_notice_pending_stage: null,
    owner_notice_pending_since: null,
    owner_notice_email_delivered_at: null,
    owner_notice_in_app_recorded_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  vi.stubEnv('BILLING_ALERT_EMAIL', 'billing-alerts@agiworkforce.com');
  sendTransactionalEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
  recordNotification.mockResolvedValue({ recorded: true, failed: false });
  recordAuditEvent.mockResolvedValue(undefined);
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

describe('enforceBillingCollection · per-run bound', () => {
  it('asks for a bounded, ordered page rather than every contract needing review', async () => {
    const { db, calls } = makeDb([]);
    await enforceBillingCollection(db, NOW);

    const load = calls.find((call) =>
      call.sql.includes('from public.organization_billing_contracts c'),
    );
    expect(load).toBeDefined();
    expect(load?.sql).toMatch(/limit \$2/u);
    expect(load?.sql).toMatch(
      /order by c\.collection_reviewed_at asc nulls first,\s+c\.oldest_open_invoice_due_at asc nulls last,\s+c\.organization_id asc/u,
    );
    expect(load?.sql).toContain('not (c.organization_id = any ($3::uuid[]))');

    const ceiling = load?.params[1];
    expect(typeof ceiling).toBe('number');
    expect(ceiling as number).toBeGreaterThan(0);
  });

  it('works the least recently reviewed contracts first so a run that stops leaves the rest for the next', async () => {
    const { db, calls } = makeDb([]);
    await enforceBillingCollection(db, NOW);

    const load = calls.find((call) =>
      call.sql.includes('from public.organization_billing_contracts c'),
    );
    const orderAt = load?.sql.indexOf('order by') ?? -1;
    const limitAt = load?.sql.indexOf('limit $2') ?? -1;
    expect(orderAt).toBeGreaterThan(-1);
    expect(limitAt).toBeGreaterThan(orderAt);
  });

  function pagedDb(total: number) {
    const population = Array.from({ length: total }, (_, index) =>
      contractRow({
        organization_id: `org_${String(index).padStart(4, '0')}`,
        oldest_open_invoice_due_at: daysAgoIso(10 + total - index),
        collection_stage: 'past_due_30',
      }),
    );
    const reviewedAt = new Map<string, string>();
    const loads: unknown[][] = [];
    const reviewStamps: string[] = [];
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (!sql.includes('from public.organization_billing_contracts c')) return [];
      loads.push(params);
      const limit = params[1] as number;
      const exclude = new Set(params[2] as string[]);
      return population
        .filter((row) => !exclude.has(row.organization_id))
        .sort((left, right) => {
          const a = reviewedAt.get(left.organization_id);
          const b = reviewedAt.get(right.organization_id);
          if (a !== b) {
            if (a === undefined) return -1;
            if (b === undefined) return 1;
            return a < b ? -1 : 1;
          }
          return left.oldest_open_invoice_due_at < right.oldest_open_invoice_due_at ? -1 : 1;
        })
        .slice(0, limit);
    });
    const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('set collection_reviewed_at')) {
        reviewedAt.set(params[0] as string, params[1] as string);
        reviewStamps.push(params[0] as string);
      }
      return 1;
    });
    return { db: { query, execute } as unknown as DatabaseAdapter, loads, reviewStamps };
  }

  it('reaches contracts beyond the first page instead of re-reading the same prefix', async () => {
    const { db, loads, reviewStamps } = pagedDb(201);

    const { outcomes, backlog } = await enforceBillingCollection(db, NOW);

    expect(outcomes).toHaveLength(201);
    expect(new Set(outcomes.map((outcome) => outcome.organizationId)).size).toBe(201);
    expect(outcomes.at(-1)!.organizationId).toBe('org_0200');
    expect(backlog).toBe(false);
    expect(loads[0]![2]).toEqual([]);
    expect(loads[1]![2]).toEqual(outcomes.slice(0, 200).map((outcome) => outcome.organizationId));
    expect(reviewStamps).toHaveLength(201);
  });

  it('resumes with the contracts a budget-limited run left unreviewed instead of the same prefix', async () => {
    const { db } = pagedDb(5);
    const start = Date.now();
    let reads = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      reads += 1;
      return reads > 3 ? start + 10 * 60 * 1000 : start;
    });
    let first: Awaited<ReturnType<typeof enforceBillingCollection>>;
    try {
      first = await enforceBillingCollection(db, NOW);
    } finally {
      clock.mockRestore();
    }
    expect(first.backlog).toBe(true);
    const firstIds = first.outcomes.map((outcome) => outcome.organizationId);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(firstIds.length).toBeLessThan(5);

    const second = await enforceBillingCollection(db, NOW + 1);
    const secondIds = second.outcomes.map((outcome) => outcome.organizationId);
    expect(secondIds.slice(0, 5 - firstIds.length)).toEqual(
      ['org_0000', 'org_0001', 'org_0002', 'org_0003', 'org_0004'].filter(
        (id) => !firstIds.includes(id),
      ),
    );
    expect(secondIds.slice(5 - firstIds.length)).toEqual(firstIds);
  });

  it('records the review time even for a contract whose review failed, so it cannot hold the front of the queue', async () => {
    const { db, calls } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(10) })]);
    recordAuditEvent.mockRejectedValueOnce(new Error('audit store unavailable'));

    await expect(enforceBillingCollection(db, NOW)).rejects.toThrow(AggregateError);

    const stamp = calls.find((call) => call.sql.includes('set collection_reviewed_at'));
    expect(stamp?.params).toEqual(['org_1', new Date(NOW).toISOString()]);
  });

  it('reports a backlog instead of completion when the run budget ends mid-sweep', async () => {
    const { db } = pagedDb(5);
    const start = Date.now();
    let reads = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      reads += 1;
      return reads > 3 ? start + 10 * 60 * 1000 : start;
    });

    try {
      const { outcomes, backlog } = await enforceBillingCollection(db, NOW);
      expect(backlog).toBe(true);
      expect(outcomes.length).toBeLessThan(5);
    } finally {
      clock.mockRestore();
    }
  });

  it('tells the scheduler when contracts were left unreviewed', async () => {
    dbQuery.mockResolvedValue([]);
    const response = await GET(cronRequest('cron-secret') as never);
    expect(await response.json()).toMatchObject({ backlog: false, contracts: 0 });
  });
});

describe('enforceBillingCollection · stage transitions', () => {
  it('persists a stage change with collection_stage_changed_at and records an audit event', async () => {
    const { db, calls } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(10) })]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]).toMatchObject({
      organizationId: 'org_1',
      stage: 'past_due_30',
      changed: true,
    });
    const stageUpdate = calls.find((call) => call.sql.includes('set collection_stage'));
    expect(stageUpdate).toBeDefined();
    expect(stageUpdate!.params).toEqual([
      'org_1',
      'past_due_30',
      expect.any(String),
      'past_due_30',
    ]);
    expect(stageUpdate!.sql).toContain('owner_notice_pending_stage = $4::text');
    expect(stageUpdate!.sql).toContain('owner_notice_email_delivered_at = null');
    expect(stageUpdate!.sql).toContain('owner_notice_in_app_recorded_at = null');
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

    const { outcomes } = await enforceBillingCollection(db, NOW);

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

  it('puts the stage change in the owner’s in-app feed even with no email on file', async () => {
    const { db } = makeDb([
      contractRow({ oldest_open_invoice_due_at: daysAgoIso(100), owner_email: null }),
    ]);

    await enforceBillingCollection(db, NOW);

    expect(recordNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'user_owner_1',
        category: 'billing',
        severity: 'error',
        target: { kind: 'settings', id: 'billing' },
      }),
    );
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

    const { outcomes } = await enforceBillingCollection(db, NOW);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.ownerNotice).toEqual({
      stage: 'past_due_30',
      email: 'no_recipient',
      inApp: 'delivered',
    });
  });
});

describe('enforceBillingCollection · owed owner notices survive a failed delivery', () => {
  const ENTERED_AT = new Date(NOW - 2 * MS_PER_DAY).toISOString();

  function stampsOf(calls: Array<{ sql: string; params: unknown[] }>) {
    return {
      email: calls.filter((call) => call.sql.includes('set owner_notice_email_delivered_at')),
      inApp: calls.filter((call) => call.sql.includes('set owner_notice_in_app_recorded_at')),
    };
  }

  function owedRow(overrides: Record<string, unknown> = {}) {
    return contractRow({
      oldest_open_invoice_due_at: daysAgoIso(100),
      collection_stage: 'read_only',
      owner_notice_pending_stage: 'read_only',
      owner_notice_pending_since: new Date(ENTERED_AT),
      ...overrides,
    });
  }

  function ownerEmails() {
    return sendTransactionalEmail.mock.calls.filter(
      ([input]) => (input as { to: string }).to === 'owner@example.com',
    );
  }

  it('stamps only the channel that succeeded when the email fails on the stage change', async () => {
    sendTransactionalEmail.mockImplementation(async (input: { to: string }) =>
      input.to === 'owner@example.com'
        ? { delivered: false, reason: 'network', detail: 'provider down' }
        : { delivered: true, providerMessageId: 'msg_internal' },
    );
    const { db, calls } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(100) })]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]).toMatchObject({
      ownerNotified: false,
      ownerNotice: { stage: 'read_only', email: 'failed', inApp: 'delivered' },
    });
    const stamps = stampsOf(calls);
    expect(stamps.email).toHaveLength(0);
    expect(stamps.inApp).toHaveLength(1);
    expect(stamps.inApp[0]!.params).toEqual([
      'org_1',
      'read_only',
      new Date(NOW).toISOString(),
      new Date(NOW).toISOString(),
    ]);
  });

  it('retries only the undelivered email at an unchanged read_only stage', async () => {
    const { db, calls } = makeDb([
      owedRow({ owner_notice_in_app_recorded_at: new Date(ENTERED_AT) }),
    ]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]).toMatchObject({
      changed: false,
      ownerNotified: true,
      ownerNotice: { stage: 'read_only', email: 'delivered', inApp: 'already_delivered' },
    });
    expect(recordNotification).not.toHaveBeenCalled();
    expect(ownerEmails()).toHaveLength(1);
    expect(ownerEmails()[0]![0]).toMatchObject({
      idempotencyKey: `billing-collection-owner:org_1:read_only:${ENTERED_AT}:${new Date(NOW).toISOString().slice(0, 10)}`,
    });
    const stamps = stampsOf(calls);
    expect(stamps.email).toHaveLength(1);
    expect(stamps.email[0]!.params.slice(0, 3)).toEqual(['org_1', 'read_only', ENTERED_AT]);
    expect(stamps.inApp).toHaveLength(0);
  });

  it('keeps both channels owed when both fail, then delivers both once providers recover', async () => {
    recordNotification.mockResolvedValueOnce({ recorded: false, failed: true });
    sendTransactionalEmail.mockResolvedValueOnce({
      delivered: false,
      reason: 'network',
      detail: 'provider down',
    });
    const failing = makeDb([owedRow()]);

    const failed = await enforceBillingCollection(failing.db, NOW);

    expect(failed.outcomes[0]!.ownerNotice).toEqual({
      stage: 'read_only',
      email: 'failed',
      inApp: 'failed',
    });
    expect(stampsOf(failing.calls)).toEqual({ email: [], inApp: [] });

    const recovered = makeDb([owedRow()]);
    const retried = await enforceBillingCollection(recovered.db, NOW + MS_PER_DAY);

    expect(retried.outcomes[0]!.ownerNotice).toEqual({
      stage: 'read_only',
      email: 'delivered',
      inApp: 'delivered',
    });
    expect(recordNotification).toHaveBeenLastCalledWith(
      recovered.db,
      expect.objectContaining({
        dedupeKey: `billing-collection:org_1:read_only:${ENTERED_AT.slice(0, 10)}`,
      }),
    );
    const stamps = stampsOf(recovered.calls);
    expect(stamps.email).toHaveLength(1);
    expect(stamps.inApp).toHaveLength(1);
  });

  it('delivers a notice owed by a run that stopped right after saving the stage', async () => {
    const { db } = makeDb([owedRow()]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.changed).toBe(false);
    expect(recordNotification).toHaveBeenCalledOnce();
    expect(ownerEmails()).toHaveLength(1);
  });

  it('sends nothing more once both channels are stamped', async () => {
    const { db } = makeDb([
      owedRow({
        owner_notice_email_delivered_at: new Date(ENTERED_AT),
        owner_notice_in_app_recorded_at: new Date(ENTERED_AT),
      }),
    ]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.ownerNotice).toBeNull();
    expect(recordNotification).not.toHaveBeenCalled();
    expect(ownerEmails()).toHaveLength(0);
  });

  it('does not send a notice owed for a stage the contract has already left', async () => {
    const { db } = makeDb([
      owedRow({
        oldest_open_invoice_due_at: daysAgoIso(45),
        collection_stage: 'past_due_60',
        owner_notice_pending_stage: 'past_due_30',
      }),
    ]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.ownerNotice).toBeNull();
    expect(recordNotification).not.toHaveBeenCalled();
    expect(ownerEmails()).toHaveLength(0);
  });

  it('clears the owed notice when the stage moves to one that owes the owner nothing', async () => {
    const { db, calls } = makeDb([
      owedRow({
        oldest_open_invoice_due_at: daysAgoIso(75),
        collection_stage: 'past_due_60',
        owner_notice_pending_stage: 'past_due_60',
      }),
    ]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]).toMatchObject({ stage: 'past_due_90', changed: true, ownerNotice: null });
    const stageUpdate = calls.find((call) => call.sql.includes('set collection_stage'));
    expect(stageUpdate!.params[3]).toBeNull();
  });

  it('reports owner notice receipts separately from stage changes', async () => {
    sendTransactionalEmail.mockImplementation(async (input: { to: string }) =>
      input.to === 'owner@example.com'
        ? { delivered: false, reason: 'network', detail: 'provider down' }
        : { delivered: true, providerMessageId: 'msg_internal' },
    );
    dbQuery.mockImplementationOnce(async (sql: string) =>
      sql.includes('from public.organization_billing_contracts c') ? [owedRow()] : [],
    );

    const response = await GET(cronRequest('cron-secret') as never);

    expect(await response.json()).toMatchObject({
      contracts: 1,
      changed: 0,
      ownerNotices: { delivered: 1, owed: 1 },
    });
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

    const { outcomes } = await enforceBillingCollection(db, NOW);

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

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.internalNotified).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('does not repeat daily below past_due_60 with no stage change', async () => {
    const { db } = makeDb([
      contractRow({ oldest_open_invoice_due_at: daysAgoIso(10), collection_stage: 'past_due_30' }),
    ]);

    const { outcomes } = await enforceBillingCollection(db, NOW);

    expect(outcomes[0]!.internalNotified).toBe(false);
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('logs rather than throws when BILLING_ALERT_EMAIL is not configured', async () => {
    vi.stubEnv('BILLING_ALERT_EMAIL', '');
    const { db } = makeDb([contractRow({ oldest_open_invoice_due_at: daysAgoIso(10) })]);

    const { outcomes } = await enforceBillingCollection(db, NOW);
    expect(outcomes).toHaveLength(1);
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

    const { outcomes } = await enforceBillingCollection(db, NOW);

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

    const { outcomes } = await enforceBillingCollection(db, NOW);

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

    const { outcomes } = await enforceBillingCollection(db, NOW);

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
