import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const emitted: Array<Record<string, unknown>> = [];

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: {
    info: (record: Record<string, unknown>) => emitted.push(record),
    error: (record: Record<string, unknown>) => emitted.push(record),
    warn: (record: Record<string, unknown>) => emitted.push(record),
    debug: (record: Record<string, unknown>) => emitted.push(record),
  },
}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: vi.fn((db: DatabaseAdapter) => db),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  resolveProviderFromModel: vi.fn(() => 'test-provider'),
  buildServerProviderAdapter: vi.fn(),
  toGenericUpstreamError: vi.fn(),
}));
vi.mock('@/lib/services/cloud-code-agent-service', () => ({
  executePersistedAgentTurn: vi.fn(),
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, getCloudCodeSession: vi.fn(async () => ({ state: 'ready' })) };
});
vi.mock('@/lib/services/schedule-notification-service', () => ({
  notifyScheduleCompleted: vi.fn(async () => undefined),
}));

import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { loadManagedMemoryContext } from '@/lib/services/managed-memory-context-service';
import { decideCloudCodeAgentApproval } from '@/lib/services/cloud-code-agent-approval-service';
import {
  processClaimedScheduleRun,
  type ClaimedScheduleRun,
} from '@/lib/services/schedule-service';

function spansFor(domain: string): Array<Record<string, unknown>> {
  return emitted.filter((record) => record['event'] === 'span' && record['span_domain'] === domain);
}

function database(query: ReturnType<typeof vi.fn>): DatabaseAdapter {
  const execute = vi.fn();
  return {
    query,
    execute,
    transaction: vi.fn(async (callback: (db: DatabaseAdapter) => Promise<unknown>) =>
      callback(database(query)),
    ),
    withUser: vi.fn(),
    dispose: vi.fn(),
  } as unknown as DatabaseAdapter;
}

const scheduleClaim: ClaimedScheduleRun = {
  runId: 'run-1',
  scheduledFor: '2026-07-15T12:00:00.000Z',
  triggerSource: 'schedule',
  scope: {
    userId: 'user-1',
    organizationId: '11111111-1111-4111-8111-111111111111',
  },
  task: {
    id: 'task-1',
    userId: 'user-1',
    name: 'Daily briefing',
    description: null,
    scheduleType: 'cron',
    cronExpression: '0 12 * * *',
    executeAt: null,
    intervalMs: null,
    timezone: 'UTC',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 1,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Brief me',
    model: 'auto-balanced',
    status: 'active',
    lastExecutedAt: '2026-07-15T12:00:00.000Z',
    nextExecutionAt: null,
    lastError: null,
    metadata: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-15T12:00:00.000Z',
  },
};

const scheduleTaskRow = {
  id: 'task-1',
  user_id: 'user-1',
  organization_id: '11111111-1111-4111-8111-111111111111',
  name: 'Daily briefing',
  description: null,
  schedule_type: 'cron',
  cron_expression: '0 12 * * *',
  execute_at: null,
  interval_ms: null,
  timezone: 'UTC',
  is_enabled: true,
  expires_at: null,
  max_executions: null,
  execution_count: 1,
  action_type: 'agent',
  action_config: null,
  prompt: 'Brief me',
  model: 'auto-balanced',
  status: 'active',
  last_executed_at: '2026-07-15T12:00:00.000Z',
  next_execution_at: null,
  last_error: null,
  metadata: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-15T12:00:00.000Z',
};

const scheduleRunRow = {
  id: 'run-1',
  task_id: 'task-1',
  status: 'success',
  trigger_source: 'schedule',
  scheduled_for: '2026-07-15T12:00:00.000Z',
  started_at: '2026-07-15T12:00:00.000Z',
  completed_at: '2026-07-15T12:00:02.000Z',
  duration_ms: 2000,
  result: { text: 'Done' },
  error: null,
  idempotency_key: 'schedule:2026-07-15T12:00:00.000Z',
  lease_expires_at: null,
  attempt_count: 1,
};

describe('span domain coverage', () => {
  beforeEach(() => {
    emitted.length = 0;
  });

  it('emits an http span for every API route wrapped by withErrorHandler', async () => {
    const handler = withErrorHandler(async (_request: Request) => NextResponse.json({ ok: true }));

    await handler(new Request('https://example.test/api/health', { method: 'GET' }));

    const spans = spansFor('http');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['span_name']).toBe('http.server');
    expect(spans[0]!['status']).toBe('ok');
  });

  it('emits a retrieval span around the managed memory lookup', async () => {
    const query = vi.fn().mockResolvedValue([
      { content: 'I prefer concise answers.', category: 'preference', pinned: true },
      { content: 'I live in Berlin.', category: 'profile', pinned: false },
    ]);

    await loadManagedMemoryContext({ query }, { userId: 'user-1' });

    const spans = spansFor('retrieval');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['span_name']).toBe('memory.context.load');
    expect(spans[0]!['retrieval.result_count']).toBe(2);
    expect(spans[0]!['status']).toBe('ok');
  });

  it('emits an approval span around a cloud agent approval decision', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.replace(/\s+/g, ' ').trim().startsWith('select id, goal, model, provider, state')) {
        return [];
      }
      return [];
    });

    await expect(
      decideCloudCodeAgentApproval({
        db: database(query),
        owner: { userId: 'user-1', organizationId: null },
        sessionId: '22222222-2222-4222-8222-222222222222',
        turnId: '11111111-1111-4111-8111-111111111111',
        stepIndex: 0,
        decision: 'approve',
        planTier: 'pro',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();

    const spans = spansFor('approval');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['span_name']).toBe('approval.decide');
    expect(spans[0]!['approval.decision']).toBe('approve');
    expect(spans[0]!['status']).toBe('error');
  });

  it('emits a task span around a claimed schedule run', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([scheduleTaskRow])
      .mockResolvedValueOnce([scheduleRunRow])
      .mockResolvedValueOnce([{ id: 'task-1' }]);

    const run = await processClaimedScheduleRun(
      database(query),
      scheduleClaim,
      vi.fn().mockResolvedValue({ text: 'Finished', model: 'model-1' }),
      { timeoutMs: 1000, now: () => new Date('2026-07-15T12:00:02.000Z') },
    );

    expect(run.status).toBe('success');
    const spans = spansFor('task');
    expect(spans).toHaveLength(1);
    expect(spans[0]!['span_name']).toBe('schedule.run');
    expect(spans[0]!['task.run_id']).toBe('run-1');
    expect(spans[0]!['task.status']).toBe('success');
  });
});
