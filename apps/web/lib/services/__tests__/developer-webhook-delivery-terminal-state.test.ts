import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';

const mocks = vi.hoisted(() => ({
  resolveHost: vi.fn(),
  fetch: vi.fn(),
  openEnvelope: vi.fn(),
  keyRing: vi.fn(),
  claimedScope: vi.fn(),
  forbidden: vi.fn((): never => {
    throw new Error('Unexpected root database, enqueue, or post-response operation');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: mocks.forbidden }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.forbidden }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: mocks.claimedScope,
}));
vi.mock('@/lib/egress-policy', () => ({
  EgressPolicyError: class EgressPolicyError extends Error {},
  assertResolvedPublicHostname: mocks.resolveHost,
  pinnedPublicFetch: mocks.fetch,
}));
vi.mock('@/lib/crypto/cmek', () => ({ platformTenantKeyRing: mocks.keyRing }));
vi.mock('@/lib/crypto/envelope', () => ({
  openEnvelope: mocks.openEnvelope,
  sealEnvelope: mocks.forbidden,
}));
vi.mock('@/lib/server/organization-encryption-keys', () => ({
  PLATFORM_TENANT_KEY_ENV: 'UNUSED_WEBHOOK_FIXTURE_KEY',
}));

import { EgressPolicyError } from '@/lib/egress-policy';
import { JobCancelledError } from '@/lib/jobs/cancellation';
import { DEVELOPER_WEBHOOK_TIMEOUT_SECONDS } from '@/lib/developer-api/webhook-events';
import {
  attemptDeveloperWebhookDelivery,
  deliverDeveloperWebhookJob,
} from '../developer-webhook-service';

const USER_ID = 'webhook-owner';
const DELIVERY_ID = 'webhook-delivery';
const DISABLED_ERROR = 'The endpoint was turned off before this event was sent.';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// This adapter models row predicates and interleaving, not PostgreSQL locking or RLS.
function fixture() {
  const state = {
    id: DELIVERY_ID,
    userId: USER_ID,
    status: 'pending',
    attempts: 0,
    responseStatus: null as number | null,
    error: null as string | null,
    deliveredAt: null as string | null,
    lastAttemptAt: null as string | null,
    enabled: true,
    exists: true,
  };
  const disabledUpdateReached = deferred();
  const disabledUpdateGate = deferred();
  const readReached = deferred();
  const readGate = deferred();
  const reads: Array<{ sql: string; params: unknown[] }> = [];
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  const forbidden = vi.fn((): never => {
    throw new Error('Unexpected adapter operation');
  });
  let holdDisabledUpdate = false;
  let holdRead = false;
  const db: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('select d.id, d.event_id')) {
        reads.push({ sql: normalized, params });
        expect(normalized).toContain('and e.user_id = d.user_id');
        expect(normalized).toContain('where d.id = $1 and d.user_id = $2');
        if (!state.exists || params[0] !== state.id || params[1] !== state.userId) return [];
        const row = {
          id: state.id,
          event_id: 'webhook-event',
          status: state.status,
          payload: { id: 'webhook-event', data: { synthetic: true } },
          endpoint_id: 'webhook-endpoint',
          url: 'https://webhook.example.test/events',
          secret_enc: 'synthetic-envelope',
          enabled: state.enabled,
        };
        readReached.resolve();
        if (holdRead) await readGate.promise;
        return [row] as T[];
      }
      if (normalized.startsWith('update public.developer_webhook_deliveries')) {
        updates.push({ sql: normalized, params });
        expect(normalized).toContain('where id = $1 and user_id = $2');
        const disabledUpdate = normalized.includes("set status = 'failed'");
        if (disabledUpdate) {
          disabledUpdateReached.resolve();
          if (holdDisabledUpdate) await disabledUpdateGate.promise;
        }
        if (params[0] !== state.id || params[1] !== state.userId) return [];
        if (normalized.includes("status <> 'delivered'") && state.status === 'delivered') {
          return [];
        }
        if (disabledUpdate) {
          state.status = 'failed';
          state.error = String(params[2]);
          state.lastAttemptAt = 'disabled-attempt';
        } else {
          expect(normalized).toContain('set status = $3, attempts = attempts + 1');
          state.status = String(params[2]);
          state.attempts += 1;
          state.responseStatus = params[3] as number | null;
          state.error = params[4] as string | null;
          state.lastAttemptAt = 'completed-attempt';
          if (params[5] === true) state.deliveredAt = 'delivered-at';
        }
        return [];
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    execute: forbidden,
    transaction: forbidden,
    withUser: forbidden,
    withOrg: forbidden,
    dispose: forbidden,
  };
  return {
    db,
    state,
    updates,
    reads,
    readReached,
    readGate,
    disabledUpdateReached,
    disabledUpdateGate,
    holdDisabledUpdate() {
      holdDisabledUpdate = true;
    },
    holdRead() {
      holdRead = true;
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveHost.mockResolvedValue(undefined);
  mocks.keyRing.mockReturnValue({});
  mocks.claimedScope.mockImplementation((db: DatabaseAdapter) => db);
  mocks.openEnvelope.mockReturnValue({ plaintext: 'synthetic-webhook-secret' });
  mocks.fetch.mockResolvedValue({ status: 204, body: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('developer webhook terminal delivery persistence', () => {
  it('preserves a successful receipt committed after a disabled attempt read pending', async () => {
    const f = fixture();
    const posting = deferred();
    const finishPost = deferred();
    mocks.fetch.mockImplementationOnce(async () => {
      posting.resolve();
      await finishPost.promise;
      return { status: 204, body: null };
    });

    const sending = attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, false);
    await posting.promise;
    f.state.enabled = false;
    f.holdDisabledUpdate();
    const disabled = attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, true);
    await f.disabledUpdateReached.promise;

    finishPost.resolve();
    await expect(sending).resolves.toEqual({ outcome: 'delivered', status: 204 });
    expect(f.state).toMatchObject({
      status: 'delivered',
      attempts: 1,
      responseStatus: 204,
      error: null,
      deliveredAt: 'delivered-at',
      lastAttemptAt: 'completed-attempt',
    });
    const successfulReceipt = { ...f.state };
    f.disabledUpdateGate.resolve();
    await expect(disabled).resolves.toEqual({ outcome: 'skipped', reason: 'endpoint_disabled' });

    expect(f.state).toEqual(successfulReceipt);
    expect(f.updates).toHaveLength(2);
    expect(f.updates[0]?.sql).toContain("status <> 'delivered'");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('still records the failure when an undelivered endpoint is disabled', async () => {
    const f = fixture();
    f.state.enabled = false;

    await expect(
      attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, false),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'endpoint_disabled' });

    expect(f.state).toMatchObject({
      status: 'failed',
      attempts: 0,
      error: DISABLED_ERROR,
      deliveredAt: null,
      responseStatus: null,
      lastAttemptAt: 'disabled-attempt',
    });
    expect(f.updates[0]?.params).toEqual([DELIVERY_ID, USER_ID, DISABLED_ERROR]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.openEnvelope).not.toHaveBeenCalled();
  });

  it('skips an already delivered receipt even when its endpoint is disabled', async () => {
    const f = fixture();
    f.state.status = 'delivered';
    f.state.enabled = false;

    await expect(
      attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, true),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'already_delivered' });

    expect(f.updates).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(['missing', 'other-owner'] as const)('does not mutate a %s delivery', async (kind) => {
    const f = fixture();
    if (kind === 'missing') f.state.exists = false;
    else f.state.userId = 'another-owner';

    await expect(
      attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, true),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'endpoint_removed' });

    expect(f.updates).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

function jobContext(db: DatabaseAdapter, signal: AbortSignal): JobHandlerContext {
  return {
    db,
    signal,
    isFinalAttempt: false,
    job: {
      id: 'webhook-job',
      queue: 'webhooks',
      kind: 'webhooks.developer-delivery',
      userId: USER_ID,
      organizationId: null,
      tenantKey: USER_ID,
      payload: { deliveryId: DELIVERY_ID },
      priority: 0,
      status: 'running',
      attempts: 1,
      maxAttempts: 3,
      runAfter: '2026-11-05T12:00:00.000Z',
      leaseExpiresAt: null,
      workerId: 'fixture-worker',
      idempotencyKey: null,
      lastError: null,
      retryReason: null,
      deadReason: null,
      deadLetteredAt: null,
      cancelRequestedAt: null,
      cancelRequestedBy: null,
      cancelReason: null,
      usage: null,
      originRegion: null,
      createdAt: '2026-11-05T12:00:00.000Z',
      updatedAt: '2026-11-05T12:00:00.000Z',
    },
  };
}

describe('developer webhook cooperative cancellation', () => {
  it('rejects a pre-aborted attempt with its exact reason before any lookup', async () => {
    const f = fixture();
    const controller = new AbortController();
    const reason = { cancelled: 'before-start' };
    controller.abort(reason);

    await expect(
      attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, false, controller.signal),
    ).rejects.toBe(reason);

    expect(f.reads).toEqual([]);
    expect(f.updates).toEqual([]);
    expect(mocks.openEnvelope).not.toHaveBeenCalled();
    expect(mocks.resolveHost).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not proceed after a delivery lookup completes following cancellation', async () => {
    const f = fixture();
    f.holdRead();
    const controller = new AbortController();
    const reason = new JobCancelledError('webhook-job');
    const work = attemptDeveloperWebhookDelivery(
      f.db,
      USER_ID,
      DELIVERY_ID,
      false,
      controller.signal,
    );
    const rejected = expect(work).rejects.toBe(reason);
    await f.readReached.promise;
    controller.abort(reason);
    f.readGate.resolve();
    await rejected;

    expect(f.reads).toHaveLength(1);
    expect(f.updates).toEqual([]);
    expect(mocks.openEnvelope).not.toHaveBeenCalled();
    expect(mocks.resolveHost).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(['resolved', 'rejected'] as const)(
    'propagates the worker signal after cancelled DNS work is %s',
    async (dnsOutcome) => {
      const f = fixture();
      const controller = new AbortController();
      const reason = new JobCancelledError('webhook-job');
      const resolving = deferred();
      const finishDns = deferred();
      mocks.resolveHost.mockImplementationOnce(async () => {
        resolving.resolve();
        await finishDns.promise;
        if (dnsOutcome === 'rejected') throw new EgressPolicyError('synthetic DNS refusal');
      });
      const work = deliverDeveloperWebhookJob(jobContext(f.db, controller.signal));
      const rejected = expect(work).rejects.toBe(reason);
      await resolving.promise;
      controller.abort(reason);
      finishDns.resolve();
      await rejected;

      expect(mocks.claimedScope).toHaveBeenCalledWith(f.db, {
        userId: USER_ID,
        organizationId: null,
      });
      expect(f.reads).toHaveLength(1);
      expect(f.updates).toEqual([]);
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it('passes cancellation to the pending transport without inventing a failed receipt', async () => {
    const f = fixture();
    const controller = new AbortController();
    const reason = new JobCancelledError('webhook-job');
    const posting = deferred();
    let transportSignal: AbortSignal | null | undefined;
    mocks.fetch.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          transportSignal = init.signal;
          transportSignal?.addEventListener('abort', () => reject(transportSignal?.reason), {
            once: true,
          });
          posting.resolve();
        }),
    );
    const work = attemptDeveloperWebhookDelivery(
      f.db,
      USER_ID,
      DELIVERY_ID,
      false,
      controller.signal,
    );
    const rejected = expect(work).rejects.toBe(reason);
    await posting.promise;
    controller.abort(reason);
    await rejected;

    expect(transportSignal).not.toBe(controller.signal);
    expect(transportSignal?.aborted).toBe(true);
    expect(transportSignal?.reason).toBe(reason);
    expect(f.updates).toEqual([]);
    expect(f.state.status).toBe('pending');
  });

  it.each(['resolved', 'rejected'] as const)(
    'persists an observed success after cancellation and %s body cleanup',
    async (cleanupOutcome) => {
      const f = fixture();
      const controller = new AbortController();
      const reason = new JobCancelledError('webhook-job');
      const cleaning = deferred();
      const finishCleanup = deferred();
      mocks.fetch.mockResolvedValueOnce({
        status: 204,
        body: {
          cancel: async () => {
            cleaning.resolve();
            await finishCleanup.promise;
            if (cleanupOutcome === 'rejected') throw reason;
          },
        },
      });
      const work = attemptDeveloperWebhookDelivery(
        f.db,
        USER_ID,
        DELIVERY_ID,
        false,
        controller.signal,
      );
      const rejected = expect(work).rejects.toBe(reason);
      await cleaning.promise;
      controller.abort(reason);
      finishCleanup.resolve();
      await rejected;

      expect(f.state).toMatchObject({
        status: 'delivered',
        attempts: 1,
        responseStatus: 204,
        error: null,
        deliveredAt: 'delivered-at',
        lastAttemptAt: 'completed-attempt',
      });
      expect(f.updates).toHaveLength(1);
    },
  );

  it('retains successful delivery without a caller signal', async () => {
    const f = fixture();

    await expect(
      attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, false),
    ).resolves.toEqual({ outcome: 'delivered', status: 204 });

    expect(f.state.status).toBe('delivered');
    expect(mocks.fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(mocks.fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([false, true])(
    'retains transport timeout with caller signal=%s',
    async (withCallerSignal) => {
      const f = fixture();
      const callerController = new AbortController();
      const timeoutController = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
      const posting = deferred();
      mocks.fetch.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
              once: true,
            });
            posting.resolve();
          }),
      );
      const work = attemptDeveloperWebhookDelivery(
        f.db,
        USER_ID,
        DELIVERY_ID,
        true,
        withCallerSignal ? callerController.signal : undefined,
      );
      await posting.promise;
      timeoutController.abort(new DOMException('Synthetic timeout', 'TimeoutError'));

      const error = `The endpoint did not answer within ${DEVELOPER_WEBHOOK_TIMEOUT_SECONDS} seconds.`;
      await expect(work).resolves.toEqual({ outcome: 'failed', error });
      expect(timeout).toHaveBeenCalledWith(DEVELOPER_WEBHOOK_TIMEOUT_SECONDS * 1000);
      expect(callerController.signal.aborted).toBe(false);
      expect(f.state).toMatchObject({ status: 'failed', attempts: 1, error });
    },
  );

  it.each(['network', 'private-address'] as const)(
    'retains %s failure classification',
    async (kind) => {
      const f = fixture();
      if (kind === 'network')
        mocks.fetch.mockRejectedValueOnce(new Error('Synthetic connection failure'));
      else
        mocks.resolveHost.mockRejectedValueOnce(new EgressPolicyError('Synthetic private target'));
      const error =
        kind === 'network'
          ? 'The endpoint could not be reached.'
          : 'The endpoint now resolves to a private address.';

      await expect(
        attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, false),
      ).resolves.toEqual({ outcome: 'failed', error });

      expect(f.state).toMatchObject({ status: 'pending', attempts: 1, error });
      if (kind === 'private-address') expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
});
