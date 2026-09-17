import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));

import {
  TriggerLimitError,
  TriggerNotFoundError,
  TriggerValidationError,
  createTrigger,
  deleteTrigger,
  listTriggerDeliveries,
  triggerListensTo,
  updateTrigger,
  validateTriggerInput,
} from '../trigger-service';
import {
  connectorTriggerSecret,
  verifyConnectorTriggerSignature,
  verifySlackSignature,
  EVENT_TRIGGER_SIGNING_SECRET_ENV,
} from '../trigger-signatures';
import { triggerWebhookPath } from '../trigger-endpoints';
import type { EventTrigger } from '../trigger-types';

const TASK_ID = '22222222-2222-4222-8222-222222222222';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    organization_id: null,
    task_id: TASK_ID,
    name: 'CI failed',
    source: 'github',
    event_types: ['workflow_run.completed'],
    source_account: 'agi/workforce',
    conditions: [],
    debounce_seconds: 0,
    max_attempts: 5,
    is_enabled: true,
    verification_status: 'verified',
    verified_at: null,
    last_fired_at: null,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

function database(
  query: ReturnType<typeof vi.fn>,
  execute = vi.fn(async () => 1),
): DatabaseAdapter {
  return {
    query,
    execute,
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

function creationDb(overrides: Record<string, unknown> = {}) {
  return database(
    vi.fn(async (sql: string) => {
      if (sql.includes('count(*)')) return [{ count: '1' }];
      if (sql.includes('from scheduled_tasks')) return [{ id: TASK_ID }];
      return [row(overrides)];
    }),
  );
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('validateTriggerInput', () => {
  it('normalizes the account each source is addressed by', () => {
    expect(
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'CI',
        source: 'github',
        eventTypes: ['workflow_run.completed'],
        sourceAccount: 'AGI/Workforce',
      }).sourceAccount,
    ).toBe('agi/workforce');
    expect(
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'Mail',
        source: 'gmail',
        eventTypes: ['mailbox.changed'],
        sourceAccount: 'Me@Example.com',
      }).sourceAccount,
    ).toBe('me@example.com');
    expect(
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'Slack',
        source: 'slack',
        eventTypes: ['message'],
        sourceAccount: 't0123abcd',
      }).sourceAccount,
    ).toBe('T0123ABCD');
  });

  it('refuses an event type the source never sends, and a missing or stray account', () => {
    expect(() =>
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'CI',
        source: 'github',
        eventTypes: ['deployment_status'],
        sourceAccount: 'agi/workforce',
      }),
    ).toThrow(TriggerValidationError);
    expect(() =>
      validateTriggerInput({ taskId: TASK_ID, name: 'CI', source: 'github', eventTypes: ['push'] }),
    ).toThrow('need the account');
    expect(() =>
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'Calendar',
        source: 'google_calendar',
        eventTypes: ['events.changed'],
        sourceAccount: 'someone@example.com',
      }),
    ).toThrow('addressed by their own id');
  });

  it('refuses conditions it cannot evaluate and debounce outside its bounds', () => {
    expect(() =>
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'CI',
        source: 'connector',
        eventTypes: ['*'],
        conditions: [{ field: 'data.x', operator: 'matches', value: '.*' }],
      }),
    ).toThrow(TriggerValidationError);
    expect(() =>
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'CI',
        source: 'connector',
        eventTypes: ['*'],
        debounceSeconds: 100_000,
      }),
    ).toThrow('debounceSeconds');
  });
});

describe('createTrigger', () => {
  it('refuses a task the account does not own', async () => {
    const db = database(
      vi.fn(async (sql: string) => (sql.includes('count(*)') ? [{ count: '0' }] : [])),
    );

    await expect(
      createTrigger(
        db,
        { userId: 'user-1', organizationId: null },
        {
          taskId: TASK_ID,
          name: 'CI',
          source: 'github',
          eventTypes: ['push'],
          sourceAccount: 'agi/workforce',
        },
      ),
    ).rejects.toBeInstanceOf(TriggerValidationError);
  });

  it('caps the number of triggers an account can keep', async () => {
    const db = database(vi.fn(async () => [{ count: '50' }]));

    await expect(
      createTrigger(
        db,
        { userId: 'user-1', organizationId: null },
        {
          taskId: TASK_ID,
          name: 'CI',
          source: 'github',
          eventTypes: ['push'],
          sourceAccount: 'agi/workforce',
        },
      ),
    ).rejects.toBeInstanceOf(TriggerLimitError);
  });

  it('marks a GitHub trigger verified because the installation proves the repository', async () => {
    const created = await createTrigger(
      creationDb(),
      { userId: 'user-1', organizationId: null },
      {
        taskId: TASK_ID,
        name: 'CI',
        source: 'github',
        eventTypes: ['workflow_run.completed'],
        sourceAccount: 'agi/workforce',
      },
    );

    expect(created.trigger.verificationStatus).toBe('verified');
    expect(created.verificationCode).toBeNull();
    expect(triggerWebhookPath(created.trigger)).toBe('/api/github/webhook');
  });

  it('issues a one-time code for a Slack workspace and keeps the trigger pending', async () => {
    const created = await createTrigger(
      creationDb({ source: 'slack', source_account: 'T0123ABCD', verification_status: 'pending' }),
      { userId: 'user-1', organizationId: null },
      {
        taskId: TASK_ID,
        name: 'Slack',
        source: 'slack',
        eventTypes: ['message'],
        sourceAccount: 'T0123ABCD',
      },
    );

    expect(created.trigger.verificationStatus).toBe('pending');
    expect(created.verificationCode).toMatch(/^[0-9a-f]{12}$/);
  });

  it('hands a connector trigger its own endpoint and signing secret', async () => {
    vi.stubEnv(EVENT_TRIGGER_SIGNING_SECRET_ENV, 'deployment-secret');
    const created = await createTrigger(
      creationDb({ source: 'connector', source_account: null }),
      { userId: 'user-1', organizationId: null },
      { taskId: TASK_ID, name: 'Webhook', source: 'connector', eventTypes: ['*'] },
    );

    expect(created.signingSecret).toBe(connectorTriggerSecret(created.trigger.id));
    expect(triggerWebhookPath(created.trigger)).toBe(
      `/api/webhooks/connectors/${created.trigger.id}`,
    );
  });
});

describe('updating, deleting and reading deliveries', () => {
  it('keeps the source and account it was created with', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('update event_triggers')) return [row({ name: 'Renamed' })];
      return [row()];
    });

    await updateTrigger(database(query), 'user-1', row().id as string, { name: 'Renamed' });

    const [sql] = query.mock.calls[1] as unknown as [string];
    expect(sql).not.toContain('source =');
    expect(sql).not.toContain('source_account =');
    expect(sql).toContain('where id = $1 and user_id = $2');
  });

  it('reports a delete that matched nothing as not found', async () => {
    await expect(
      deleteTrigger(
        database(
          vi.fn(),
          vi.fn(async () => 0),
        ),
        'user-1',
        row().id as string,
      ),
    ).rejects.toBeInstanceOf(TriggerNotFoundError);
  });

  it('reads deliveries only for the owner of the trigger', async () => {
    const query = vi.fn(async () => []);
    await listTriggerDeliveries(database(query), 'user-1', row().id as string, {
      limit: 20,
      offset: 0,
    });
    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain('event.user_id = $2 and trigger.user_id = $2');
  });
});

describe('event type matching and signatures', () => {
  const trigger = { eventTypes: ['pull_request'] } as EventTrigger;

  it('matches a family entry against its actions and a wildcard against everything', () => {
    expect(triggerListensTo(trigger, 'pull_request.opened')).toBe(true);
    expect(triggerListensTo(trigger, 'push')).toBe(false);
    expect(triggerListensTo({ eventTypes: ['*'] } as EventTrigger, 'anything')).toBe(true);
  });

  it('fails closed when a signing secret is unset and rejects a stale or wrong signature', () => {
    expect(
      verifySlackSignature({
        body: '{}',
        timestamp: '1000',
        signature: 'v0=abc',
        secret: undefined,
        nowSeconds: 1000,
      }),
    ).toEqual({ ok: false, reason: 'not_configured' });
    expect(
      verifySlackSignature({
        body: '{}',
        timestamp: '1000',
        signature: 'v0=abc',
        secret: 'slack-secret',
        nowSeconds: 100_000,
      }),
    ).toEqual({ ok: false, reason: 'stale' });
    expect(
      verifyConnectorTriggerSignature({
        triggerId: row().id as string,
        body: '{}',
        timestamp: '1000',
        signature: 'sha256=abc',
        nowSeconds: 1000,
      }),
    ).toEqual({ ok: false, reason: 'not_configured' });
  });
});
