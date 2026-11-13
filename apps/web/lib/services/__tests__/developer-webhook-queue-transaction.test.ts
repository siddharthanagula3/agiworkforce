import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  forbidden: vi.fn((): never => {
    throw new Error('Network, root database, and scope rebinding are forbidden in this fixture');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/logger', async () => ({
  ...(await vi.importActual<LoggerModule>('@/lib/logger')),
  logger: { error: mocks.error, warn: mocks.warn },
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<NeonDbModule>('@/lib/server/neon-db')),
  getNeonDb: mocks.forbidden,
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: mocks.forbidden,
}));
vi.mock('@/lib/egress-policy', async () => ({
  ...(await vi.importActual<EgressPolicyModule>('@/lib/egress-policy')),

  EgressPolicyError: class EgressPolicyError extends Error {},
  assertResolvedPublicHostname: mocks.forbidden,
  pinnedPublicFetch: mocks.forbidden,
}));
vi.mock('@/lib/crypto/cmek', async () => ({
  ...(await vi.importActual<CmekModule>('@/lib/crypto/cmek')),
  platformTenantKeyRing: mocks.forbidden,
}));
vi.mock('@/lib/crypto/envelope', async () => ({
  ...(await vi.importActual<EnvelopeModule>('@/lib/crypto/envelope')),

  openEnvelope: mocks.forbidden,
  sealEnvelope: mocks.forbidden,
}));
vi.mock('@/lib/server/organization-encryption-keys', async () => ({
  ...(await vi.importActual<OrganizationEncryptionKeysModule>(
    '@/lib/server/organization-encryption-keys',
  )),

  PLATFORM_TENANT_KEY_ENV: 'UNUSED_WEBHOOK_FIXTURE_KEY',
  platformTenantRing: mocks.forbidden,
}));

import {
  DEVELOPER_WEBHOOK_MAX_ATTEMPTS,
  DEVELOPER_WEBHOOK_TEST_EVENT,
} from '@/lib/developer-api/webhook-events';
import {
  queueDeveloperWebhookEvent,
  redeliverWebhook,
  sendWebhookTestEvent,
} from '../developer-webhook-service';
type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type EgressPolicyModule = typeof import('@/lib/egress-policy');
type CmekModule = typeof import('@/lib/crypto/cmek');
type EnvelopeModule = typeof import('@/lib/crypto/envelope');
type OrganizationEncryptionKeysModule = typeof import('@/lib/server/organization-encryption-keys');

const USER_ID = 'webhook-owner';
const ENDPOINT_ID = 'endpoint-one';
const EVENT_TYPE = 'api_key.created';
const CREATED_AT = '2026-11-05T12:00:00.000Z';
const original = {
  id: 'original-delivery',
  event_id: 'original-event',
  event_type: EVENT_TYPE,
  payload: {
    object: 'event',
    id: 'original-event',
    type: EVENT_TYPE,
    created_at: 123,
    data: { preserved: true },
  },
};

type Call = { sql: string; params: unknown[] };
type Delivery = {
  id: string;
  endpoint_id: unknown;
  user_id: unknown;
  event_id: unknown;
  event_type: unknown;
  payload: Record<string, unknown>;
  redelivery_of: unknown;
};
type Job = { id: string; params: unknown[] };
type Fault = 'insert-throw' | 'insert-no-row' | 'enqueue-throw' | 'enqueue-conflict';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Staging models a transaction with a known rollback outcome, not PostgreSQL/RLS or commit ambiguity.
function fixture(
  options: {
    endpointIds?: string[];
    fault?: Fault;
    failAt?: number;
    commitGate?: ReturnType<typeof deferred>;
    failBeforeCommit?: boolean;
  } = {},
) {
  const endpointIds = options.endpointIds ?? [ENDPOINT_ID];
  const committed = { deliveries: [] as Delivery[], jobs: [] as Job[] };
  const staged = { deliveries: [] as Delivery[], jobs: [] as Job[] };
  const outerCalls: Call[] = [];
  const txCalls: Call[] = [];
  const timeline: string[] = [];
  const callbackDone = deferred();
  const failure = new Error(`Injected ${options.fault}`);
  const commitFailure = new Error('Adapter failed before commit with a known-uncommitted outcome');
  let active = false;
  let deliveryAttempts = 0;
  let jobAttempts = 0;
  const forbidden = vi.fn((): never => {
    throw new Error('Unexpected adapter operation');
  });
  const failAt = options.failAt ?? 1;

  const tx: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (!active) throw new Error('Transaction query outside its callback');
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      txCalls.push({ sql: normalized, params });
      if (normalized.startsWith('insert into public.developer_webhook_deliveries')) {
        deliveryAttempts += 1;
        if (deliveryAttempts === failAt && options.fault === 'insert-throw') throw failure;
        if (deliveryAttempts === failAt && options.fault === 'insert-no-row') return [];
        const delivery: Delivery = {
          id: `delivery-${deliveryAttempts}`,
          endpoint_id: params[0],
          user_id: params[1],
          event_id: params[2],
          event_type: params[3],
          payload: JSON.parse(String(params[4])) as Record<string, unknown>,
          redelivery_of: params[5],
        };
        staged.deliveries.push(delivery);
        timeline.push(`delivery:${delivery.id}`);
        return [
          {
            ...delivery,
            status: 'pending',
            attempts: 0,
            response_status: null,
            error: null,
            last_attempt_at: null,
            delivered_at: null,
            created_at: CREATED_AT,
          },
        ] as T[];
      }
      if (normalized.startsWith('insert into public.background_jobs')) {
        jobAttempts += 1;
        if (jobAttempts === failAt && options.fault === 'enqueue-throw') throw failure;
        if (jobAttempts === failAt && options.fault === 'enqueue-conflict') return [];
        const job = { id: `job-${jobAttempts}`, params };
        staged.jobs.push(job);
        timeline.push(`job:${job.id}`);
        return [{ id: job.id, status: 'queued' }] as T[];
      }
      if (normalized.startsWith('select id, status from public.background_jobs')) {
        expect(options.fault).toBe('enqueue-conflict');
        expect(normalized).toContain('user_id is not distinct from $3');
        expect(params).toEqual(['webhooks', `developer-webhook:delivery-${failAt}`, USER_ID]);
        return [];
      }
      throw new Error(`Unexpected transaction SQL: ${normalized}`);
    },
    execute: forbidden,
    transaction: forbidden,
    withUser: forbidden,
    withOrg: forbidden,
    dispose: forbidden,
  };
  const transactionImpl = async <T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> => {
    if (active) throw new Error('Nested transaction');
    active = true;
    timeline.push('begin');
    try {
      const result = await fn(tx);
      timeline.push('callback-done');
      callbackDone.resolve();
      if (options.commitGate) await options.commitGate.promise;
      if (options.failBeforeCommit) throw commitFailure;
      committed.deliveries.push(...staged.deliveries);
      committed.jobs.push(...staged.jobs);
      timeline.push('commit');
      return result;
    } catch (error) {
      timeline.push('rollback');
      throw error;
    } finally {
      staged.deliveries.length = 0;
      staged.jobs.length = 0;
      active = false;
    }
  };
  const transactionHost = { transaction: transactionImpl };
  const transaction = vi.spyOn(transactionHost, 'transaction');
  const db: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (active) throw new Error('Outer adapter used inside transaction');
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      outerCalls.push({ sql: normalized, params });
      if (normalized.startsWith('select id from public.developer_webhook_endpoints')) {
        if (normalized.includes('and enabled')) {
          expect(params).toEqual([USER_ID, EVENT_TYPE]);
          expect(normalized).toContain('$2 = any(event_types)');
          return endpointIds.map((id) => ({ id })) as T[];
        }
        expect(normalized).toContain('where id = $1 and user_id = $2');
        expect(params).toEqual([ENDPOINT_ID, USER_ID]);
        return endpointIds.map((id) => ({ id })) as T[];
      }
      if (normalized.startsWith('select id, event_id, event_type, payload')) {
        expect(normalized).toContain('where id = $1 and endpoint_id = $2 and user_id = $3');
        expect(params).toEqual([original.id, ENDPOINT_ID, USER_ID]);
        return [original] as T[];
      }
      throw new Error(`Unexpected outer SQL (writes are forbidden): ${normalized}`);
    },
    execute: forbidden,
    transaction: transactionHost.transaction,
    withUser: forbidden,
    withOrg: forbidden,
    dispose: forbidden,
  };
  const transactionSpy = vi.spyOn(db, 'transaction');
  mocks.after.mockImplementation((callback: unknown) => {
    expect(typeof callback).toBe('function');
    expect(timeline.at(-1)).toBe('commit');
    timeline.push('after');
  });
  return {
    db,
    tx,
    committed,
    staged,
    outerCalls,
    txCalls,
    timeline,
    transaction,
    callbackDone,
    failure,
    commitFailure,
    forbidden,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  expect(mocks.forbidden).not.toHaveBeenCalled();
});

function expectRolledBack(harness: ReturnType<typeof fixture>) {
  expect(harness.transaction).toHaveBeenCalledTimes(1);
  expect(harness.timeline.at(-1)).toBe('rollback');
  expect(harness.timeline).not.toContain('commit');
  expect(harness.committed).toEqual({ deliveries: [], jobs: [] });
  expect(harness.staged).toEqual({ deliveries: [], jobs: [] });
  expect(harness.forbidden).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
}

function expectJobMatchesDelivery(job: Job, delivery: Delivery) {
  expect(job.params[0]).toBe('webhooks');
  expect(job.params[1]).toBe('webhooks.developer-delivery');
  expect(job.params[2]).toBe(USER_ID);
  expect(job.params[3]).toBeNull();
  expect(JSON.parse(String(job.params[4]))).toMatchObject({ deliveryId: delivery.id });
  expect(job.params[6]).toBe(DEVELOPER_WEBHOOK_MAX_ATTEMPTS);
  expect(job.params[8]).toBe(`developer-webhook:${delivery.id}`);
}

describe('developer webhook enqueue transaction with the canonical job service', () => {
  it('commits the whole fanout with one shared event and matching delivery/job ownership', async () => {
    const h = fixture({ endpointIds: [ENDPOINT_ID, 'endpoint-two'] });
    const data = { key_id: 'created-key' };
    await queueDeveloperWebhookEvent(h.db, USER_ID, EVENT_TYPE, data);

    expect(h.db).not.toBe(h.tx);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.outerCalls).toHaveLength(1);
    expect(h.txCalls).toHaveLength(4);
    expect(h.committed.deliveries).toHaveLength(2);
    expect(h.committed.jobs).toHaveLength(2);
    const [first, second] = h.committed.deliveries;
    expect(first!.id).not.toBe(second!.id);
    expect(first!.payload).toEqual(second!.payload);
    expect(first!.event_id).toBe(second!.event_id);
    expect(first!.payload).toEqual({
      object: 'event',
      id: first!.event_id,
      type: EVENT_TYPE,
      created_at: expect.any(Number),
      data,
    });
    for (const [index, delivery] of h.committed.deliveries.entries()) {
      expect(delivery).toMatchObject({
        endpoint_id: [ENDPOINT_ID, 'endpoint-two'][index],
        user_id: USER_ID,
        event_type: EVENT_TYPE,
        redelivery_of: null,
      });
      expectJobMatchesDelivery(h.committed.jobs[index]!, delivery);
    }
    expect(h.timeline).toEqual([
      'begin',
      'delivery:delivery-1',
      'job:job-1',
      'delivery:delivery-2',
      'job:job-2',
      'callback-done',
      'commit',
      'after',
    ]);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(h.forbidden).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it.each(['insert-throw', 'insert-no-row', 'enqueue-throw', 'enqueue-conflict'] as const)(
    'rolls back earlier endpoints on late %s and retains best-effort error logging',
    async (fault) => {
      const h = fixture({ endpointIds: [ENDPOINT_ID, 'endpoint-two'], fault, failAt: 2 });
      await expect(
        queueDeveloperWebhookEvent(h.db, USER_ID, EVENT_TYPE, {}),
      ).resolves.toBeUndefined();
      expectRolledBack(h);
      expect(h.timeline).toContain('job:job-1');
      expect(mocks.error).toHaveBeenCalledTimes(1);
      const expectedError =
        fault === 'insert-no-row'
          ? expect.objectContaining({ message: 'The webhook delivery could not be queued.' })
          : fault === 'enqueue-conflict'
            ? expect.objectContaining({
                message: 'Job enqueue conflicted with a job owned by another subject',
              })
            : h.failure;
      expect(mocks.error).toHaveBeenCalledWith(
        { error: expectedError, userId: USER_ID, type: EVENT_TYPE },
        'Developer webhook event was not queued',
      );
      if (fault === 'insert-no-row' || fault === 'insert-throw') {
        expect(
          h.txCalls.filter((call) => call.sql.startsWith('insert into public.background_jobs')),
        ).toHaveLength(1);
      }
      if (fault === 'enqueue-conflict') {
        expect(h.txCalls.at(-1)!.sql).toContain('select id, status from public.background_jobs');
      }
    },
  );

  const operations = {
    queue: (db: DatabaseAdapter) => queueDeveloperWebhookEvent(db, USER_ID, EVENT_TYPE, {}),
    test: (db: DatabaseAdapter) => sendWebhookTestEvent(db, USER_ID, ENDPOINT_ID),
    redelivery: (db: DatabaseAdapter) => redeliverWebhook(db, USER_ID, ENDPOINT_ID, original.id),
  };

  it.each(['queue', 'test', 'redelivery'] as const)(
    'does not resolve %s or register after until the transaction commits',
    async (operation) => {
      const commitGate = deferred();
      const h = fixture({ commitGate });
      let settled = false;
      const pending = operations[operation](h.db).then((value) => {
        settled = true;
        return value;
      });
      await Promise.race([h.callbackDone.promise, pending]);
      expect(settled).toBe(false);
      expect(h.committed).toEqual({ deliveries: [], jobs: [] });
      expect(h.staged.deliveries).toHaveLength(1);
      expect(h.staged.jobs).toHaveLength(1);
      expect(mocks.after).not.toHaveBeenCalled();
      commitGate.resolve();
      await pending;
      expect(settled).toBe(true);
      expect(h.timeline.slice(-2)).toEqual(['commit', 'after']);
      expect(mocks.after).toHaveBeenCalledTimes(1);
      expect(mocks.error).not.toHaveBeenCalled();
    },
  );

  // This adapter deliberately fails before committing; it cannot model a lost commit acknowledgement.
  it.each(['queue', 'test', 'redelivery'] as const)(
    '%s handles an adapter failure after the callback with a known-uncommitted outcome',
    async (operation) => {
      const h = fixture({ failBeforeCommit: true });
      const pending = operations[operation](h.db);
      if (operation === 'queue') {
        await expect(pending).resolves.toBeUndefined();
        expect(mocks.error).toHaveBeenCalledTimes(1);
        expect(mocks.error).toHaveBeenCalledWith(
          { error: h.commitFailure, userId: USER_ID, type: EVENT_TYPE },
          'Developer webhook event was not queued',
        );
      } else {
        await expect(pending).rejects.toBe(h.commitFailure);
        expect(mocks.error).not.toHaveBeenCalled();
      }
      expect(h.timeline).toEqual([
        'begin',
        'delivery:delivery-1',
        'job:job-1',
        'callback-done',
        'rollback',
      ]);
      expectRolledBack(h);
    },
  );

  for (const operation of ['test', 'redelivery'] as const) {
    it.each(['insert-throw', 'insert-no-row', 'enqueue-throw', 'enqueue-conflict'] as const)(
      `${operation} rejects %s rather than swallowing the transaction failure`,
      async (fault) => {
        const h = fixture({ fault });
        const expected =
          fault === 'insert-no-row'
            ? 'The webhook delivery could not be queued.'
            : fault === 'enqueue-conflict'
              ? 'Job enqueue conflicted with a job owned by another subject'
              : h.failure.message;
        await expect(operations[operation](h.db)).rejects.toThrow(expected);
        expectRolledBack(h);
        expect(mocks.error).not.toHaveBeenCalled();
      },
    );
  }

  it('returns the committed test delivery and queues the test event for the caller', async () => {
    const h = fixture();
    const delivery = await sendWebhookTestEvent(h.db, USER_ID, ENDPOINT_ID);
    expect(delivery).toMatchObject({
      id: h.committed.deliveries[0]!.id,
      eventType: DEVELOPER_WEBHOOK_TEST_EVENT,
      redeliveryOf: null,
      createdAt: CREATED_AT,
    });
    expect(h.committed.deliveries[0]!.payload).toMatchObject({
      id: delivery.eventId,
      type: DEVELOPER_WEBHOOK_TEST_EVENT,
      data: { endpoint_id: ENDPOINT_ID },
    });
    expectJobMatchesDelivery(h.committed.jobs[0]!, h.committed.deliveries[0]!);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('preserves the original event while creating a new delivery and linking redelivery_of', async () => {
    const h = fixture();
    const delivery = await redeliverWebhook(h.db, USER_ID, ENDPOINT_ID, original.id);
    expect(delivery.id).not.toBe(original.id);
    expect(delivery).toMatchObject({
      eventId: original.event_id,
      eventType: original.event_type,
      redeliveryOf: original.id,
    });
    expect(h.committed.deliveries[0]).toMatchObject({
      endpoint_id: ENDPOINT_ID,
      user_id: USER_ID,
      payload: original.payload,
      redelivery_of: original.id,
    });
    expectJobMatchesDelivery(h.committed.jobs[0]!, h.committed.deliveries[0]!);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('commits jobs but registers no callback when attemptAfterResponse is false', async () => {
    const h = fixture();
    await queueDeveloperWebhookEvent(
      h.db,
      USER_ID,
      EVENT_TYPE,
      {},
      { attemptAfterResponse: false },
    );
    expect(h.timeline.at(-1)).toBe('commit');
    expect(h.committed.deliveries).toHaveLength(1);
    expect(h.committed.jobs).toHaveLength(1);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not begin a transaction or register after for zero subscribers', async () => {
    const h = fixture({ endpointIds: [] });
    await queueDeveloperWebhookEvent(h.db, USER_ID, EVENT_TYPE, {});
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.txCalls).toEqual([]);
    expect(h.committed).toEqual({ deliveries: [], jobs: [] });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});

type CompleteMockModule0 = typeof import('@/lib/crypto/cmek');
type CompleteMockModule1 = typeof import('@/lib/crypto/envelope');

type RetainedMockModule0 = typeof import('@/lib/logger');
