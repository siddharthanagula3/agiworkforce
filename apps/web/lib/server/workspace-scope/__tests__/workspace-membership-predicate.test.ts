import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { FakePostgres } from '@/lib/services/__tests__/fake-postgres';

import {
  MEMBERSHIP_STATUSES_THAT_MAY_ACT,
  WorkspaceScopeError,
  ownerIsActiveWorkspaceMemberSql,
} from '../index';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

const PREDICATE = ownerIsActiveWorkspaceMemberSql(
  'scheduled_tasks.user_id',
  'scheduled_tasks.organization_id',
  1,
);

// The claim a worker really runs, reduced to the part membership decides.
const CLAIM = `select scheduled_tasks.id
     from scheduled_tasks
    where scheduled_tasks.is_enabled = true
      and ${PREDICATE}`;

let db: FakePostgres;

beforeEach(() => {
  db = new FakePostgres({
    scheduled_tasks: [
      { id: 'still_a_member', user_id: 'user_stays', organization_id: ORG, is_enabled: true },
      { id: 'removed', user_id: 'user_removed', organization_id: ORG, is_enabled: true },
      { id: 'suspended', user_id: 'user_suspended', organization_id: ORG, is_enabled: true },
      {
        id: 'other_workspace',
        user_id: 'user_stays',
        organization_id: OTHER_ORG,
        is_enabled: true,
      },
      { id: 'personal', user_id: 'user_removed', organization_id: null, is_enabled: true },
    ],
    organization_members: [
      { organization_id: ORG, user_id: 'user_stays', status: 'active' },
      { organization_id: ORG, user_id: 'user_suspended', status: 'suspended' },
      { organization_id: OTHER_ORG, user_id: 'user_stays', status: 'active' },
    ],
  });
});

async function claimed(): Promise<string[]> {
  const rows = await db.query<{ id: string }>(CLAIM, [[...MEMBERSHIP_STATUSES_THAT_MAY_ACT]]);
  return rows.map((row) => row.id).sort();
}

describe('standing work asks whether its owner is still a member', () => {
  it('leaves behind the work of a member who was removed from the workspace', async () => {
    expect(await claimed()).not.toContain('removed');
  });

  it('leaves behind the work of a member whose membership is suspended', async () => {
    expect(await claimed()).not.toContain('suspended');
  });

  it('keeps running the work of a member who is still active in that workspace', async () => {
    expect(await claimed()).toContain('still_a_member');
  });

  it('does not judge work in another workspace by this one', async () => {
    expect(await claimed()).toContain('other_workspace');
  });

  it('never touches personal work, which no membership governs', async () => {
    expect(await claimed()).toContain('personal');
  });

  it('runs the work again once the membership is reinstated', async () => {
    db.rowsIn('organization_members').push({
      organization_id: ORG,
      user_id: 'user_removed',
      status: 'active',
    });

    expect(await claimed()).toContain('removed');
  });

  it('reads the acting statuses from the membership vocabulary', () => {
    expect([...MEMBERSHIP_STATUSES_THAT_MAY_ACT]).toEqual(['active']);
  });

  it('refuses a column name it cannot safely interpolate', () => {
    expect(() =>
      ownerIsActiveWorkspaceMemberSql('user_id', "organization_id') or ('1'='1", 1),
    ).toThrow(WorkspaceScopeError);
  });

  it('refuses to inline the statuses instead of binding them', () => {
    expect(() => ownerIsActiveWorkspaceMemberSql('user_id', 'organization_id', 0)).toThrow(
      WorkspaceScopeError,
    );
  });
});
