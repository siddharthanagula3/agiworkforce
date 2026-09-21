import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ warn: vi.fn(), statements: [] as string[] }));

vi.mock('@/lib/logger', () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { FakePostgres } from './fake-postgres';
import { MEMBERSHIP_STATUSES_THAT_MAY_ACT } from '@/lib/server/workspace-scope';
import { claimDueScheduleRuns } from '@/lib/services/schedule-service';

const ORG = '11111111-1111-4111-8111-111111111111';

function task(id: string, userId: string, organizationId: string | null) {
  return {
    id,
    user_id: userId,
    organization_id: organizationId,
    is_enabled: true,
    status: 'active',
    next_execution_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    max_executions: null,
    execution_count: 0,
    retry_attempt: 0,
    retry_scheduled_for: null,
  };
}

let world: FakePostgres;

// The claim is a four-CTE statement the evaluator does not read; the sweep's own
// report of what it left behind is a plain select and is evaluated in full.
const db = {
  query: async (sql: string, params: readonly unknown[] = []) => {
    mocks.statements.push(sql);
    return /^\s*select/i.test(sql) ? world.query(sql, params) : [];
  },
  execute: async () => 0,
  transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
};

beforeEach(() => {
  mocks.warn.mockClear();
  mocks.statements = [];
  world = new FakePostgres({
    scheduled_tasks: [
      task('still_a_member', 'user_stays', ORG),
      task('removed', 'user_removed', ORG),
      task('suspended', 'user_suspended', ORG),
      task('personal', 'user_personal', null),
    ],
    organization_members: [
      { organization_id: ORG, user_id: 'user_stays', status: 'active' },
      { organization_id: ORG, user_id: 'user_suspended', status: 'suspended' },
    ],
    profiles: [
      { id: 'user_stays', account_status: 'active' },
      { id: 'user_removed', account_status: 'active' },
      { id: 'user_suspended', account_status: 'active' },
      { id: 'user_personal', account_status: 'active' },
    ],
    erasure_tombstones: [],
  });
});

async function leftBehind(): Promise<string[]> {
  await claimDueScheduleRuns(db as never, { limit: 25 });
  const call = mocks.warn.mock.calls.at(-1);
  return call ? [...(call[0] as { taskIds: string[] }).taskIds].sort() : [];
}

describe('the schedule sweep says which work its owner may no longer run', () => {
  it('names the task of a member who was removed from the workspace', async () => {
    expect(await leftBehind()).toContain('removed');
  });

  it('names the task of a member whose membership is suspended', async () => {
    expect(await leftBehind()).toContain('suspended');
  });

  it('leaves an active member alone', async () => {
    expect(await leftBehind()).not.toContain('still_a_member');
  });

  it('leaves personal work alone, which no membership governs', async () => {
    expect(await leftBehind()).not.toContain('personal');
  });

  it('says nothing once the membership is reinstated', async () => {
    world.rowsIn('organization_members').push({
      organization_id: ORG,
      user_id: 'user_removed',
      status: 'active',
    });
    world.rowsIn('organization_members').push({
      organization_id: ORG,
      user_id: 'user_suspended_gone',
      status: 'active',
    });
    world.tables.set(
      'scheduled_tasks',
      world.rowsIn('scheduled_tasks').filter((row) => row['id'] !== 'suspended'),
    );

    await claimDueScheduleRuns(db as never, { limit: 25 });

    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('gives the reason a name a log search can find', async () => {
    await claimDueScheduleRuns(db as never, { limit: 25 });

    expect(mocks.warn.mock.calls[0]?.[0]).toMatchObject({ skipped: 'owner_not_a_member' });
  });

  it('binds the acting statuses into the claim rather than spelling them out', async () => {
    await claimDueScheduleRuns(db as never, { limit: 25 });
    const claim = mocks.statements.find((sql) => /^\s*with\s+expired_candidates/i.test(sql));

    expect(claim).toContain('public.organization_members member');
    expect(MEMBERSHIP_STATUSES_THAT_MAY_ACT).toEqual(['active']);
  });
});
