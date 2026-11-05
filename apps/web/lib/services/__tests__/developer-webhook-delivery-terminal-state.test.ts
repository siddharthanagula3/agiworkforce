import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveHost: vi.fn(),
  fetch: vi.fn(),
  openEnvelope: vi.fn(),
  keyRing: vi.fn(),
  forbidden: vi.fn((): never => {
    throw new Error('Unexpected root database, enqueue, or post-response operation');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: mocks.forbidden }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: mocks.forbidden }));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: mocks.forbidden,
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

import { attemptDeveloperWebhookDelivery } from '../developer-webhook-service';

const USER_ID = 'webhook-owner';
const DELIVERY_ID = 'webhook-delivery';
const DISABLED_ERROR = 'The endpoint was turned off before this event was sent.';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
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
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  const forbidden = vi.fn((): never => { throw new Error('Unexpected adapter operation'); });
  let holdDisabledUpdate = false;
  const db: DatabaseAdapter = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('select d.id, d.event_id')) {
        expect(normalized).toContain('and e.user_id = d.user_id');
        expect(normalized).toContain('where d.id = $1 and d.user_id = $2');
        if (!state.exists || params[0] !== state.id || params[1] !== state.userId) return [];
        return [{
          id: state.id,
          event_id: 'webhook-event',
          status: state.status,
          payload: { id: 'webhook-event', data: { synthetic: true } },
          endpoint_id: 'webhook-endpoint',
          url: 'https://webhook.example.test/events',
          secret_enc: 'synthetic-envelope',
          enabled: state.enabled,
        }] as T[];
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
    disabledUpdateReached,
    disabledUpdateGate,
    holdDisabledUpdate() { holdDisabledUpdate = true; },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolveHost.mockResolvedValue(undefined);
  mocks.keyRing.mockReturnValue({});
  mocks.openEnvelope.mockReturnValue({ plaintext: 'synthetic-webhook-secret' });
  mocks.fetch.mockResolvedValue({ status: 204, body: null });
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
      status: 'delivered', attempts: 1, responseStatus: 204, error: null,
      deliveredAt: 'delivered-at', lastAttemptAt: 'completed-attempt',
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

    await expect(attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, false))
      .resolves.toEqual({ outcome: 'skipped', reason: 'endpoint_disabled' });

    expect(f.state).toMatchObject({
      status: 'failed', attempts: 0, error: DISABLED_ERROR,
      deliveredAt: null, responseStatus: null, lastAttemptAt: 'disabled-attempt',
    });
    expect(f.updates[0]?.params).toEqual([DELIVERY_ID, USER_ID, DISABLED_ERROR]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.openEnvelope).not.toHaveBeenCalled();
  });

  it('skips an already delivered receipt even when its endpoint is disabled', async () => {
    const f = fixture();
    f.state.status = 'delivered';
    f.state.enabled = false;

    await expect(attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, true))
      .resolves.toEqual({ outcome: 'skipped', reason: 'already_delivered' });

    expect(f.updates).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(['missing', 'other-owner'] as const)('does not mutate a %s delivery', async (kind) => {
    const f = fixture();
    if (kind === 'missing') f.state.exists = false;
    else f.state.userId = 'another-owner';

    await expect(attemptDeveloperWebhookDelivery(f.db, USER_ID, DELIVERY_ID, true))
      .resolves.toEqual({ outcome: 'skipped', reason: 'endpoint_removed' });

    expect(f.updates).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
