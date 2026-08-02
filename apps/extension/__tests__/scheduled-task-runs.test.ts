import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPickerModels } from '@agiworkforce/types';

const localStore: Record<string, unknown> = {};
const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: localStore[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
      }),
    },
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

const {
  SCHEDULED_TASK_RUN_STORAGE_KEY,
  beginScheduledTaskRunJournal,
  canResumeScheduledTaskRunJournal,
  loadScheduledTaskRunJournals,
  removeScheduledTaskRunJournal,
  updateScheduledTaskRunJournal,
} = await import('../src/features/background/scheduled-task-runs');

const OWNER = { accountId: 'account-a', authIncarnation: 'session-a' } as const;
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const MODEL_ID = getPickerModels()[0]!.id;

beforeEach(() => {
  for (const key of Object.keys(localStore)) delete localStore[key];
  vi.clearAllMocks();
});

describe('scheduled Managed Cloud run journal', () => {
  it('persists authority and a retry-stable request before dispatch', async () => {
    const started = await beginScheduledTaskRunJournal(
      {
        taskId: 'task-1',
        taskName: 'Morning brief',
        prompt: 'Summarize my inbox',
        requestId: 'agi.chrome.task.request-1',
        owner: OWNER,
      },
      1_000,
    );

    expect(started.created).toBe(true);
    expect(started.journal).toMatchObject({
      version: 1,
      owner: OWNER,
      requestId: 'agi.chrome.task.request-1',
      recoveryAttempts: 0,
      cancellationPending: false,
      cancellationAttempts: 0,
      cancellationAbsenceObservations: 0,
      dispatchPreparedAt: 1_000,
      createdAt: 1_000,
    });
    expect(await loadScheduledTaskRunJournals()).toEqual([started.journal]);
  });

  it('serializes duplicate alarm admission onto the original journal', async () => {
    const first = beginScheduledTaskRunJournal({
      taskId: 'task-1',
      taskName: 'First',
      prompt: 'Original prompt',
      requestId: 'agi.chrome.task.request-1',
      owner: OWNER,
    });
    const second = beginScheduledTaskRunJournal({
      taskId: 'task-1',
      taskName: 'Second',
      prompt: 'Replacement prompt',
      requestId: 'agi.chrome.task.request-2',
      owner: OWNER,
    });

    const [left, right] = await Promise.all([first, second]);
    expect(left.created).toBe(true);
    expect(right.created).toBe(false);
    expect(right.journal.requestId).toBe(left.journal.requestId);
    expect(await loadScheduledTaskRunJournals()).toHaveLength(1);
  });

  it('checkpoints route, server run, and bounded recovery attempts', async () => {
    await beginScheduledTaskRunJournal({
      taskId: 'task-1',
      taskName: 'Morning brief',
      prompt: 'Summarize my inbox',
      requestId: 'agi.chrome.task.request-1',
      owner: OWNER,
    });
    const updated = await updateScheduledTaskRunJournal('task-1', 'agi.chrome.task.request-1', {
      routing: {
        modelKey: MODEL_ID,
        taskType: 'general',
        reason: 'scheduled_recovery',
      },
      cloudRun: {
        runId: RUN_ID,
        runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
        lastSequence: 4,
        state: 'running',
      },
      recoveryAttempts: 1,
    });

    expect(updated).toMatchObject({
      recoveryAttempts: 1,
      routing: { taskType: 'general' },
      cloudRun: { runId: RUN_ID, lastSequence: 4 },
    });
  });

  it('filters malformed persisted entries and removes only the exact request', async () => {
    localStore[SCHEDULED_TASK_RUN_STORAGE_KEY] = {
      version: 1,
      runs: [{ version: 1, taskId: '../../../bad' }, null],
    };
    expect(await loadScheduledTaskRunJournals()).toEqual([]);

    await beginScheduledTaskRunJournal({
      taskId: 'task-1',
      taskName: 'Morning brief',
      prompt: 'Summarize my inbox',
      requestId: 'agi.chrome.task.request-1',
      owner: OWNER,
    });
    expect(await removeScheduledTaskRunJournal('task-1', 'agi.chrome.task.other')).toBe(false);
    expect(await removeScheduledTaskRunJournal('task-1', 'agi.chrome.task.request-1')).toBe(true);
    expect(await loadScheduledTaskRunJournals()).toEqual([]);
  });

  it('persists cancellation intent across worker restarts until terminal acknowledgement', async () => {
    await beginScheduledTaskRunJournal({
      taskId: 'task-1',
      taskName: 'Morning brief',
      prompt: 'Summarize my inbox',
      requestId: 'agi.chrome.task.request-1',
      owner: OWNER,
    });

    const pending = await updateScheduledTaskRunJournal('task-1', 'agi.chrome.task.request-1', {
      cancellationPending: true,
      cancellationAttempts: 1,
      cancellationRequestedAt: 2_000,
      cancellationLastAttemptAt: 2_100,
    });

    expect(pending).toMatchObject({
      cancellationPending: true,
      cancellationAttempts: 1,
      cancellationRequestedAt: 2_000,
      cancellationLastAttemptAt: 2_100,
    });
    expect((await loadScheduledTaskRunJournals())[0]).toMatchObject({
      cancellationPending: true,
      cancellationAttempts: 1,
    });
  });

  it('resumes only the exact owner and prompt and never a cancellation tombstone', async () => {
    const current = (
      await beginScheduledTaskRunJournal({
        taskId: 'task-1',
        taskName: 'Morning brief',
        prompt: 'Original prompt',
        requestId: 'agi.chrome.task.request-1',
        owner: OWNER,
      })
    ).journal;

    expect(canResumeScheduledTaskRunJournal(current, OWNER, 'Original prompt')).toBe(true);
    expect(canResumeScheduledTaskRunJournal(current, OWNER, 'Updated prompt')).toBe(false);
    expect(
      canResumeScheduledTaskRunJournal(
        current,
        { ...OWNER, authIncarnation: 'session-replacement' },
        'Original prompt',
      ),
    ).toBe(false);
    expect(
      canResumeScheduledTaskRunJournal(
        { ...current, cancellationPending: true },
        OWNER,
        'Original prompt',
      ),
    ).toBe(false);
  });
});
