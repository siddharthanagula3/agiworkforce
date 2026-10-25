import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { CONNECTORS_COMING_SOON_MESSAGE, connectorsReleased } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

import {
  TriggerLimitError,
  TriggerNotFoundError,
  TriggerValidationError,
  createTrigger,
  deleteTrigger,
  listTriggerDeliveries,
  mapTrigger,
  readConnectorTriggerSalt,
  regenerateConnectorTriggerSecret,
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
import { triggerSourceAvailable, type EventTrigger } from '../trigger-types';

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
  it('accepts a GitHub trigger on new issues and published releases', () => {
    expect(
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'Triage and release notes',
        source: 'github',
        eventTypes: ['issues.opened', 'release.published'],
        sourceAccount: 'agi/workforce',
      }).eventTypes,
    ).toEqual(['issues.opened', 'release.published']);
    expect(() =>
      validateTriggerInput({
        taskId: TASK_ID,
        name: 'Edits',
        source: 'github',
        eventTypes: ['issues.edited'],
        sourceAccount: 'agi/workforce',
      }),
    ).toThrow();
  });

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
        eventTypes: ['message.received'],
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

  it.each([
    ['slack', ['message'], 'T0123ABCD', 'from slack_installations'],
    ['github', ['push'], 'acme/secret-backend', 'from github_installations'],
  ] as const)(
    'refuses a %s trigger for an account its creator does not hold, before saving it',
    async (source, eventTypes, sourceAccount, ownershipTable) => {
      const query = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('count(*)')) return [{ count: '1' }];
        if (sql.includes('from scheduled_tasks')) return [{ id: TASK_ID }];
        if (sql.includes(ownershipTable)) return [];
        return [row({ source, source_account: sourceAccount })];
      });

      await expect(
        createTrigger(
          database(query),
          { userId: 'user-1', organizationId: null },
          { taskId: TASK_ID, name: 'Listen', source, eventTypes: [...eventTypes], sourceAccount },
        ),
      ).rejects.toBeInstanceOf(TriggerValidationError);
      const ownership = query.mock.calls.find(([sql]) => String(sql).includes(ownershipTable));
      expect(ownership?.[1]).toEqual([sourceAccount, 'user-1']);
      expect(
        query.mock.calls.some(([sql]) => String(sql).includes('insert into event_triggers')),
      ).toBe(false);
    },
  );

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

describe('connector-backed trigger sources', () => {
  it.each([
    ['gmail', ['message.received'], 'me@example.com'],
    ['google_calendar', ['events.changed'], undefined],
  ] as const)(
    'refuses a %s trigger before reading the database while connectors are coming soon',
    async (source, eventTypes, sourceAccount) => {
      expect(connectorsReleased()).toBe(false);
      const query = vi.fn();

      await expect(
        createTrigger(
          database(query),
          { userId: 'user-1', organizationId: null },
          { taskId: TASK_ID, name: 'Inbox', source, eventTypes: [...eventTypes], sourceAccount },
        ),
      ).rejects.toMatchObject({ message: CONNECTORS_COMING_SOON_MESSAGE });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('opens Gmail and Calendar with the connector release and never gates the other sources', () => {
    for (const source of ['gmail', 'google_calendar'] as const) {
      expect(triggerSourceAvailable(source, 'coming_soon')).toBe(false);
      expect(triggerSourceAvailable(source, 'released')).toBe(true);
    }
    for (const source of ['github', 'slack', 'connector'] as const) {
      expect(triggerSourceAvailable(source, 'coming_soon')).toBe(true);
    }
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
        signingSalt: null,
        body: '{}',
        timestamp: '1000',
        signature: 'sha256=abc',
        nowSeconds: 1000,
      }),
    ).toEqual({ ok: false, reason: 'not_configured' });
  });
});

describe('connector signing secret rotation', () => {
  const connector = () =>
    row({ source: 'connector', source_account: null, event_types: ['*'], signing_salt: null });

  beforeEach(() => {
    vi.stubEnv(EVENT_TRIGGER_SIGNING_SECRET_ENV, 'deployment-secret');
  });

  it('keeps the original secret for a trigger with no salt and changes it with one', () => {
    const id = connector().id;
    expect(connectorTriggerSecret(id, null)).toBe(connectorTriggerSecret(id));
    expect(connectorTriggerSecret(id, 'b'.repeat(64))).not.toBe(connectorTriggerSecret(id));
  });

  it('writes a fresh salt for the owner only and returns the secret derived from it', async () => {
    const query = vi.fn(async (_sql: string, values: unknown[]) => [
      { ...connector(), signing_salt: values[2] },
    ]);
    const owned = mapTrigger(connector());

    const rotated = await regenerateConnectorTriggerSecret(database(query), owned);

    const [sql, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("where id = $1 and user_id = $2 and source = 'connector'");
    expect(values.slice(0, 2)).toEqual([owned.id, owned.userId]);
    expect(rotated.signingSecret).toBe(connectorTriggerSecret(owned.id, values[2] as string));
    expect(rotated.signingSecret).not.toBe(connectorTriggerSecret(owned.id));
  });

  it('refuses a trigger that is not a signed webhook', async () => {
    const query = vi.fn();

    await expect(
      regenerateConnectorTriggerSecret(database(query), mapTrigger(row())),
    ).rejects.toBeInstanceOf(TriggerValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports a row that no longer belongs to the owner as not found', async () => {
    await expect(
      regenerateConnectorTriggerSecret(database(vi.fn(async () => [])), mapTrigger(connector())),
    ).rejects.toBeInstanceOf(TriggerNotFoundError);
  });

  it('refuses to rotate when the deployment signing key is unset', async () => {
    vi.stubEnv(EVENT_TRIGGER_SIGNING_SECRET_ENV, '');
    const query = vi.fn();

    await expect(
      regenerateConnectorTriggerSecret(database(query), mapTrigger(connector())),
    ).rejects.toBeInstanceOf(TriggerValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('reads the salt of a connector trigger and tells an unknown id apart', async () => {
    expect(
      await readConnectorTriggerSalt(
        database(vi.fn(async () => [{ signing_salt: 'c'.repeat(64) }])),
        connector().id,
      ),
    ).toEqual({ found: true, signingSalt: 'c'.repeat(64) });
    expect(await readConnectorTriggerSalt(database(vi.fn(async () => [])), connector().id)).toEqual(
      { found: false },
    );
  });
});
