import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({ enqueueJob: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/jobs/job-service', () => ({ enqueueJob: mocks.enqueueJob }));

import { ingestTriggerEvent } from '../trigger-ingest';
import { hashVerificationCode } from '../trigger-signatures';
import type { TriggerEvent } from '../trigger-types';

interface Fixture {
  triggers?: Array<Record<string, unknown>>;
  recorded?: boolean;
  debounceClaimed?: boolean;
}

const statements: string[] = [];

function triggerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    organization_id: null,
    task_id: '22222222-2222-4222-8222-222222222222',
    name: 'CI failed',
    source: 'github',
    event_types: ['workflow_run.completed'],
    source_account: 'agi/workforce',
    conditions: [],
    debounce_seconds: 0,
    max_attempts: 5,
    is_enabled: true,
    verification_status: 'verified',
    verified_at: '2026-09-17T00:00:00.000Z',
    last_fired_at: null,
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

function database(fixture: Fixture = {}): DatabaseAdapter {
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes('from event_triggers as trigger')) return fixture.triggers ?? [];
    if (sql.includes('insert into event_trigger_events')) {
      return fixture.recorded === false ? [] : [{ id: 'event-1' }];
    }
    return [];
  });
  const execute = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes('set last_fired_at = now()')) return fixture.debounceClaimed === false ? 0 : 1;
    if (sql.includes("verification_status = 'verified'")) return 1;
    return 1;
  });
  return {
    query,
    execute,
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

function event(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    source: 'github',
    type: 'workflow_run.completed',
    deliveryId: 'delivery-1',
    account: 'agi/workforce',
    triggerId: null,
    installationId: 42,
    occurredAt: '2026-09-17T00:00:00.000Z',
    data: { conclusion: 'failure', branch: 'main' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  statements.length = 0;
  mocks.enqueueJob.mockResolvedValue({ id: 'job-1', status: 'queued', created: true });
});

describe('ingestTriggerEvent', () => {
  it('matches only enabled triggers for the account, on an installation the owner holds', async () => {
    await ingestTriggerEvent(database({ triggers: [triggerRow()] }), event());

    const match = statements.find((sql) => sql.includes('from event_triggers as trigger'))!;
    expect(match).toContain('trigger.is_enabled = true');
    expect(match).toContain('trigger.event_types && $4::text[]');
    expect(match).toContain('from github_installations as installation');
    expect(match).toContain('join scheduled_tasks as task');
  });

  it('queues one job per matched trigger, keyed to the delivery it recorded', async () => {
    const outcomes = await ingestTriggerEvent(database({ triggers: [triggerRow()] }), event());

    expect(outcomes).toEqual([
      { triggerId: triggerRow().id, outcome: 'enqueued', detail: null, jobId: 'job-1' },
    ]);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'event-triggers.fire',
        userId: 'user-1',
        idempotencyKey: 'trigger-event:event-1',
        maxAttempts: 5,
      }),
    );
  });

  it('records a redelivery once and does not queue it again', async () => {
    const outcomes = await ingestTriggerEvent(
      database({ triggers: [triggerRow()], recorded: false }),
      event(),
    );

    expect(outcomes).toEqual([{ triggerId: triggerRow().id, outcome: 'duplicate', detail: null }]);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('filters an event the conditions reject', async () => {
    const outcomes = await ingestTriggerEvent(
      database({
        triggers: [
          triggerRow({
            conditions: [{ field: 'data.conclusion', operator: 'equals', value: 'success' }],
          }),
        ],
      }),
      event(),
    );

    expect(outcomes[0]).toMatchObject({ outcome: 'filtered' });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('debounces a trigger that fired inside its window', async () => {
    const outcomes = await ingestTriggerEvent(
      database({ triggers: [triggerRow({ debounce_seconds: 300 })], debounceClaimed: false }),
      event(),
    );

    expect(outcomes[0]).toMatchObject({ outcome: 'debounced' });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
    const debounce = statements.find((sql) => sql.includes('set last_fired_at = now()'))!;
    expect(debounce).toContain('last_fired_at <= now() - make_interval(secs => debounce_seconds)');
  });

  it('fires nothing for a trigger whose account is not verified yet', async () => {
    const outcomes = await ingestTriggerEvent(
      database({
        triggers: [
          triggerRow({
            source: 'slack',
            verification_status: 'pending',
            source_account: 'T123456',
          }),
        ],
      }),
      event({ source: 'slack', type: 'message', account: 'T123456', data: { text: 'hello' } }),
    );

    expect(outcomes[0]).toMatchObject({
      outcome: 'filtered',
      detail: expect.stringContaining('verified'),
    });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('verifies a Slack workspace when its one-time code is posted there', async () => {
    const code = 'abcdef123456';
    const db = database({
      triggers: [
        triggerRow({ source: 'slack', verification_status: 'pending', source_account: 'T123456' }),
      ],
    });

    const outcomes = await ingestTriggerEvent(
      db,
      event({
        source: 'slack',
        type: 'message',
        account: 'T123456',
        data: { text: `verify ${code}` },
      }),
    );

    expect(outcomes[0]?.detail).toContain('Ownership verified');
    const verify = statements.find((sql) => sql.includes("verification_status = 'verified'"))!;
    expect(verify).toContain('verification_code_sha256 = $3');
    expect(hashVerificationCode(code)).toHaveLength(64);
  });

  it('records a delivery it could not queue instead of losing it', async () => {
    mocks.enqueueJob.mockRejectedValue(new Error('queue unavailable'));

    const outcomes = await ingestTriggerEvent(database({ triggers: [triggerRow()] }), event());

    expect(outcomes[0]?.detail).toContain('could not be queued');
    const settle = statements.filter((sql) => sql.includes('update event_trigger_events'));
    expect(settle.length).toBeGreaterThan(0);
  });
});
