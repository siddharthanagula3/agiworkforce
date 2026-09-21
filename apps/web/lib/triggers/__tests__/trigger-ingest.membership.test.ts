import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { FakePostgres } from '@/lib/services/__tests__/fake-postgres';

import { ingestTriggerEvent } from '../trigger-ingest';
import type { TriggerEvent } from '../trigger-types';

const ORG = '11111111-1111-4111-8111-111111111111';

function trigger(id: string, userId: string, organizationId: string | null) {
  return {
    id,
    user_id: userId,
    organization_id: organizationId,
    task_id: `task_${id}`,
    name: id,
    source: 'slack',
    source_account: 'workspace-account',
    event_types: ['message'],
    conditions: [],
    debounce_seconds: 0,
    max_attempts: 5,
    is_enabled: true,
    verification_status: 'verified',
    verification_code_sha256: null,
    verified_at: null,
    last_fired_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const EVENT: TriggerEvent = {
  source: 'slack',
  account: 'workspace-account',
  triggerId: null,
  type: 'message',
  deliveryId: 'delivery_1',
  installationId: null,
  data: {},
} as TriggerEvent;

let world: FakePostgres;

// The reads run through the evaluator; the writes this path makes are not what
// membership decides, so they answer empty and the outcome names the trigger.
const db = {
  query: async (sql: string, params: readonly unknown[] = []) =>
    /^\s*select/i.test(sql) ? world.query(sql, params) : [],
  execute: async () => 0,
  transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
};

beforeEach(() => {
  world = new FakePostgres({
    event_triggers: [
      trigger('still_a_member', 'user_stays', ORG),
      trigger('removed', 'user_removed', ORG),
      trigger('suspended', 'user_suspended', ORG),
      trigger('personal', 'user_personal', null),
      trigger('erased_account', 'user_erased', ORG),
    ],
    scheduled_tasks: [
      { id: 'task_still_a_member', user_id: 'user_stays', organization_id: ORG },
      { id: 'task_removed', user_id: 'user_removed', organization_id: ORG },
      { id: 'task_suspended', user_id: 'user_suspended', organization_id: ORG },
      { id: 'task_personal', user_id: 'user_personal', organization_id: null },
      { id: 'task_erased_account', user_id: 'user_erased', organization_id: ORG },
    ],
    organization_members: [
      { organization_id: ORG, user_id: 'user_stays', status: 'active' },
      { organization_id: ORG, user_id: 'user_suspended', status: 'suspended' },
      { organization_id: ORG, user_id: 'user_erased', status: 'active' },
    ],
    profiles: [
      { id: 'user_stays', account_status: 'active' },
      { id: 'user_removed', account_status: 'active' },
      { id: 'user_suspended', account_status: 'active' },
      { id: 'user_personal', account_status: 'active' },
      { id: 'user_erased', account_status: 'active' },
    ],
    erasure_tombstones: [{ user_id: 'user_erased' }],
    github_installations: [],
    event_trigger_events: [],
  });
});

async function fired(): Promise<string[]> {
  const outcomes = await ingestTriggerEvent(db as never, EVENT);
  return outcomes.map((outcome) => outcome.triggerId).sort();
}

describe('an inbound event only reaches a trigger its owner may still act through', () => {
  it('does not fire a trigger whose owner was removed from the workspace', async () => {
    expect(await fired()).not.toContain('removed');
  });

  it('does not fire a trigger whose owner is suspended in the workspace', async () => {
    expect(await fired()).not.toContain('suspended');
  });

  it('does not fire a trigger whose owner has been erased', async () => {
    expect(await fired()).not.toContain('erased_account');
  });

  it('fires a trigger whose owner is still an active member', async () => {
    expect(await fired()).toContain('still_a_member');
  });

  it('fires a personal trigger, which no membership governs', async () => {
    expect(await fired()).toContain('personal');
  });

  it('fires again once the membership is reinstated', async () => {
    world.rowsIn('organization_members').push({
      organization_id: ORG,
      user_id: 'user_removed',
      status: 'active',
    });

    expect(await fired()).toContain('removed');
  });
});
