import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { FakePostgres } from '@/lib/services/__tests__/fake-postgres';

import { ingestTriggerEvent } from '../trigger-ingest';
import type { TriggerEvent } from '../trigger-types';

function trigger(id: string, userId: string, source: string, sourceAccount: string) {
  return {
    id,
    user_id: userId,
    organization_id: null,
    task_id: `task_${id}`,
    name: id,
    source,
    source_account: sourceAccount,
    event_types: ['*'],
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

const OWNERS = ['installer', 'linked_member', 'stranger', 'repo_owner', 'repo_outsider'];

let world: FakePostgres;

const db = {
  query: async (sql: string, params: readonly unknown[] = []) =>
    /^\s*select/i.test(sql) ? world.query(sql, params) : [],
  execute: async () => 0,
  transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
};

function slackEvent(channelType: string | null): TriggerEvent {
  return {
    source: 'slack',
    type: 'message',
    deliveryId: `slack_${channelType ?? 'none'}`,
    account: 'T123456',
    triggerId: null,
    installationId: null,
    occurredAt: '2026-01-01T00:00:00.000Z',
    data: { channelType, user: 'U1', text: 'hello' },
  };
}

function githubEvent(repository: string): TriggerEvent {
  return {
    source: 'github',
    type: 'issues.opened',
    deliveryId: `github_${repository}`,
    account: repository,
    triggerId: null,
    installationId: 42,
    occurredAt: '2026-01-01T00:00:00.000Z',
    data: { repository },
  };
}

async function fired(event: TriggerEvent): Promise<string[]> {
  const outcomes = await ingestTriggerEvent(db as never, event);
  return outcomes.map((outcome) => outcome.triggerId).sort();
}

beforeEach(() => {
  world = new FakePostgres({
    event_triggers: [
      trigger('installer_slack', 'installer', 'slack', 'T123456'),
      trigger('linked_slack', 'linked_member', 'slack', 'T123456'),
      trigger('stranger_slack', 'stranger', 'slack', 'T123456'),
      trigger('owner_docs', 'repo_owner', 'github', 'acme/docs'),
      trigger('owner_secret', 'repo_owner', 'github', 'acme/secret-backend'),
      trigger('outsider_docs', 'repo_outsider', 'github', 'acme/docs'),
    ],
    scheduled_tasks: [
      { id: 'task_installer_slack', user_id: 'installer', organization_id: null },
      { id: 'task_linked_slack', user_id: 'linked_member', organization_id: null },
      { id: 'task_stranger_slack', user_id: 'stranger', organization_id: null },
      { id: 'task_owner_docs', user_id: 'repo_owner', organization_id: null },
      { id: 'task_owner_secret', user_id: 'repo_owner', organization_id: null },
      { id: 'task_outsider_docs', user_id: 'repo_outsider', organization_id: null },
    ],
    organization_members: [],
    profiles: OWNERS.map((id) => ({ id, account_status: 'active' })),
    erasure_tombstones: [],
    github_installations: [
      { installation_id: 42, user_id: 'repo_owner', verified_repositories: ['acme/docs'] },
    ],
    slack_installations: [
      { id: 'slack_installation', team_id: 'T123456', installed_by_user_id: 'installer' },
    ],
    slack_account_links: [{ installation_id: 'slack_installation', user_id: 'linked_member' }],
    event_trigger_events: [],
  });
});

describe('an event reaches only triggers whose owner holds the account it came from', () => {
  it('delivers a public Slack channel message to the installer and a linked member, never a stranger', async () => {
    expect(await fired(slackEvent('channel'))).toEqual(['installer_slack', 'linked_slack']);
  });

  it('delivers a private Slack channel message to the installer alone', async () => {
    expect(await fired(slackEvent('group'))).toEqual(['installer_slack']);
  });

  it('delivers a Slack event that names no channel type, such as a mention, to the installer alone', async () => {
    expect(await fired(slackEvent(null))).toEqual(['installer_slack']);
  });

  it('delivers a channel type it does not know to the installer alone', async () => {
    expect(await fired(slackEvent('G'))).toEqual(['installer_slack']);
  });

  it('delivers no direct or group message with the app to anyone', async () => {
    expect(await fired(slackEvent('im'))).toEqual([]);
    expect(await fired(slackEvent('mpim'))).toEqual([]);
  });

  it('still lets a linked member verify a pending trigger from a direct message with the app', async () => {
    world.rowsIn('event_triggers').find((row) => row['id'] === 'linked_slack')![
      'verification_status'
    ] = 'pending';

    expect(await fired(slackEvent('im'))).toEqual(['linked_slack']);
  });

  it('delivers a GitHub event only for a repository its owner proved through the installation', async () => {
    expect(await fired(githubEvent('acme/docs'))).toEqual(['owner_docs']);
    expect(await fired(githubEvent('acme/secret-backend'))).toEqual([]);
  });

  it('delivers no GitHub event on an installation linked before repository access was proved', async () => {
    world.rowsIn('github_installations')[0]!['verified_repositories'] = null;

    expect(await fired(githubEvent('acme/docs'))).toEqual([]);
  });
});
