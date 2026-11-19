import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  setUserSuspended: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityProvider: () => ({ setUserSuspended: mocks.setUserSuspended }),
}));
type JobServiceModule = typeof import('@/lib/jobs/job-service');

vi.mock('@/lib/jobs/job-service', async (importOriginal) => ({
  ...(await importOriginal<JobServiceModule>()),
  enqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));

import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { PermanentJobError } from '@/lib/jobs/job-service';

import {
  ACCOUNT_PROVIDER_STEP_JOB_KIND,
  queueAccountProviderStepRetry,
  recordAdminAccountAction,
  retryAccountProviderStep,
  settleAccountProviderStep,
  type AccountProviderStepStatus,
  type AdminAccountAction,
  type AdminAccountStatus,
} from './admin-account-actions';

const TARGET = 'user_target';
const OPERATOR = 'user_operator';

interface ActionRow {
  id: string;
  user_id: string;
  action: AdminAccountAction;
  account_status: AdminAccountStatus;
  provider_suspended: boolean | null;
  provider_status: AccountProviderStepStatus;
  provider_attempts: number;
  provider_error: string | null;
  provider_completed_at: string | null;
  created_at: number;
}

function store() {
  const actions: ActionRow[] = [];
  const profiles = new Map<string, string>([[TARGET, 'active']]);
  let clock = 0;
  let failWrites = false;

  const unfinished = (row: ActionRow) =>
    row.provider_status === 'pending' || row.provider_status === 'failed';

  const execute = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (failWrites) throw new Error('relation "admin_account_actions" does not exist');
    if (sql.includes("set provider_status = 'superseded'") && sql.includes('where user_id = $1')) {
      const hit = actions.filter((row) => row.user_id === params[0] && unfinished(row));
      for (const row of hit) row.provider_status = 'superseded';
      return hit.length;
    }
    const owned = (candidate: ActionRow) =>
      candidate.id === params[0] && candidate.user_id === params[1] && unfinished(candidate);
    if (sql.includes("set provider_status = 'superseded'") && sql.includes('where id = $1')) {
      const row = actions.find(owned);
      if (!row) return 0;
      row.provider_status = 'superseded';
      return 1;
    }
    if (sql.includes('set provider_status = $3::text')) {
      const row = actions.find(owned);
      if (!row) return 0;
      row.provider_status = params[2] as AccountProviderStepStatus;
      row.provider_attempts += 1;
      row.provider_error = params[3] as string | null;
      row.provider_completed_at = params[2] === 'completed' ? 'now' : null;
      return 1;
    }
    throw new Error(`unexpected execute: ${sql.slice(0, 80)}`);
  });

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (failWrites) throw new Error('relation "admin_account_actions" does not exist');
    if (sql.includes('insert into public.admin_account_actions')) {
      clock += 1;
      const row: ActionRow = {
        id: `action-${clock}`,
        user_id: params[0] as string,
        action: params[1] as AdminAccountAction,
        account_status: params[2] as AdminAccountStatus,
        provider_suspended: params[3] as boolean | null,
        provider_status: params[4] as AccountProviderStepStatus,
        provider_attempts: 0,
        provider_error: null,
        provider_completed_at: null,
        created_at: clock,
      };
      if ((row.provider_suspended === null) !== (row.provider_status === 'not_required')) {
        throw new Error('violates check constraint admin_account_actions_provider_step');
      }
      actions.push(row);
      return [{ id: row.id }] as never[];
    }
    if (sql.includes('from public.admin_account_actions step')) {
      const row = actions.find((candidate) => candidate.id === params[0]);
      if (!row) return [] as never[];
      return [
        {
          ...row,
          current_account_status: profiles.get(row.user_id) ?? null,
          replaced: actions.some(
            (later) => later.user_id === row.user_id && later.created_at > row.created_at,
          ),
        },
      ] as never[];
    }
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  });

  const db = {
    query,
    execute,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db),
  } as unknown as DatabaseAdapter;

  return {
    db,
    actions,
    profiles,
    failWrites: () => {
      failWrites = true;
    },
  };
}

function job(db: DatabaseAdapter, payload: Record<string, unknown>): JobHandlerContext {
  return {
    db,
    signal: new AbortController().signal,
    isFinalAttempt: false,
    job: {
      id: 'job-1',
      queue: 'webhooks',
      kind: ACCOUNT_PROVIDER_STEP_JOB_KIND,
      userId: null,
      organizationId: null,
      tenantKey: 'platform',
      payload,
      priority: 0,
      status: 'running',
      attempts: 1,
      maxAttempts: 10,
      runAfter: '2026-11-09T00:00:00.000Z',
      leaseExpiresAt: null,
      workerId: 'worker-a',
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
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z',
    },
  };
}

async function failedReactivation(s: ReturnType<typeof store>) {
  const step = await recordAdminAccountAction(s.db, {
    userId: TARGET,
    action: 'reactivate-user',
    accountStatus: 'active',
    providerSuspended: false,
    requestedByUserId: OPERATOR,
  });
  await settleAccountProviderStep(s.db, step!, { ok: false, error: new Error('provider down') });
  return step!;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setUserSuspended.mockResolvedValue(undefined);
  mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: true });
});

describe('recording an operator account action', () => {
  it('stores a provider step as pending and an action without one as not required', async () => {
    const s = store();

    await recordAdminAccountAction(s.db, {
      userId: TARGET,
      action: 'suspend-user',
      accountStatus: 'suspended',
      providerSuspended: null,
      requestedByUserId: OPERATOR,
    });
    await recordAdminAccountAction(s.db, {
      userId: TARGET,
      action: 'ban-user',
      accountStatus: 'banned',
      providerSuspended: true,
      requestedByUserId: OPERATOR,
    });

    expect(s.actions.map((row) => row.provider_status)).toEqual(['not_required', 'pending']);
  });

  it('keeps the failed provider step with its attempt count and error', async () => {
    const s = store();
    await failedReactivation(s);

    expect(s.actions[0]).toMatchObject({
      provider_status: 'failed',
      provider_attempts: 1,
      provider_error: 'Error: provider down',
      provider_completed_at: null,
    });
  });

  it('supersedes an unfinished step when a later action is taken on the account', async () => {
    const s = store();
    await failedReactivation(s);
    s.profiles.set(TARGET, 'banned');

    await recordAdminAccountAction(s.db, {
      userId: TARGET,
      action: 'ban-user',
      accountStatus: 'banned',
      providerSuspended: true,
      requestedByUserId: OPERATOR,
    });

    expect(s.actions[0]?.provider_status).toBe('superseded');
  });

  it('returns no id rather than failing when the action cannot be stored', async () => {
    const s = store();
    s.failWrites();

    await expect(
      recordAdminAccountAction(s.db, {
        userId: TARGET,
        action: 'ban-user',
        accountStatus: 'banned',
        providerSuspended: true,
        requestedByUserId: OPERATOR,
      }),
    ).resolves.toBeNull();
  });

  it('queues one retry per action', async () => {
    const s = store();
    const step = await failedReactivation(s);
    const id = step.actionId;

    await expect(queueAccountProviderStepRetry(s.db, step)).resolves.toBe(true);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(s.db, {
      kind: ACCOUNT_PROVIDER_STEP_JOB_KIND,
      payload: { actionId: id },
      idempotencyKey: `account-provider-step:${id}`,
    });
  });
});

describe('retrying the provider step', () => {
  it('tells the provider again and records the completion', async () => {
    const s = store();
    const id = (await failedReactivation(s)).actionId;

    await expect(retryAccountProviderStep(job(s.db, { actionId: id }))).resolves.toEqual({
      actionId: id,
      providerStatus: 'completed',
    });
    expect(mocks.setUserSuspended).toHaveBeenCalledWith(TARGET, false);
    expect(s.actions[0]).toMatchObject({
      provider_status: 'completed',
      provider_attempts: 2,
      provider_error: null,
    });
  });

  it('records the failure and throws so the queue retries with backoff', async () => {
    const s = store();
    const id = (await failedReactivation(s)).actionId;
    mocks.setUserSuspended.mockRejectedValue(new Error('still down'));

    await expect(retryAccountProviderStep(job(s.db, { actionId: id }))).rejects.toThrow(
      'The sign-in provider did not take the account status change',
    );
    expect(s.actions[0]).toMatchObject({ provider_status: 'failed', provider_attempts: 2 });
  });

  it('never unbans an account an operator has banned again since', async () => {
    const s = store();
    const id = (await failedReactivation(s)).actionId;
    s.profiles.set(TARGET, 'banned');

    await expect(retryAccountProviderStep(job(s.db, { actionId: id }))).resolves.toMatchObject({
      skipped: expect.any(String),
    });
    expect(mocks.setUserSuspended).not.toHaveBeenCalled();
    expect(s.actions[0]?.provider_status).toBe('superseded');
  });

  it('never replays an older action once a newer one exists for the account', async () => {
    const s = store();
    const older = (await failedReactivation(s)).actionId;
    await failedReactivation(s);
    s.actions[0]!.provider_status = 'failed';

    await expect(retryAccountProviderStep(job(s.db, { actionId: older }))).resolves.toMatchObject({
      skipped: expect.any(String),
    });
    expect(mocks.setUserSuspended).not.toHaveBeenCalled();
  });

  it('does nothing for a step that already completed or no longer exists', async () => {
    const s = store();
    const step = await failedReactivation(s);
    const id = step.actionId;
    await settleAccountProviderStep(s.db, step, { ok: true });

    await expect(retryAccountProviderStep(job(s.db, { actionId: id }))).resolves.toMatchObject({
      skipped: 'the provider step is completed',
    });
    await expect(
      retryAccountProviderStep(job(s.db, { actionId: 'action-missing' })),
    ).resolves.toMatchObject({ skipped: expect.any(String) });
    expect(mocks.setUserSuspended).not.toHaveBeenCalled();
  });

  it('refuses a job that names no action', async () => {
    const s = store();

    await expect(retryAccountProviderStep(job(s.db, {}))).rejects.toBeInstanceOf(PermanentJobError);
  });
});
