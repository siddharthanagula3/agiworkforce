/**
 * CAP-048 slice 3 — the two /tasks gaps that made a live or failed run
 * unreadable:
 *
 *   1. An open detail panel froze at whatever the run had done when it was
 *      opened. A running task looked stalled forever.
 *   2. A failed run showed a red "Failed" badge and nothing else, even though
 *      the journal already carried the engine's `error` event.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { TasksPage, TASK_JOURNAL_POLL_INTERVAL_MS } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-0000000000aa';

function makeRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: 'request-1',
    conversationId: 'conversation-1',
    originSurface: 'web',
    workMode: 'agiwork',
    state: 'running',
    provider: 'openai',
    model: 'fixture-task-model',
    lastEventSequence: 0,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function event(sequence: number, value: AgentEventEnvelope['event']): AgentEventEnvelope {
  return {
    schemaVersion: 3,
    sessionId: 'conversation-1',
    turnId: 'turn-1',
    sequence,
    emittedAtMs: 1_785_000_000_000 + sequence,
    event: value,
  };
}

function progress(sequence: number, summary: string): AgentEventEnvelope {
  return event(sequence, {
    type: 'progress-update',
    progressId: `step-${sequence}`,
    summary,
    status: 'completed',
  });
}

function client(overrides: Partial<ManagedCloudAgentRunClient>): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(async () => ({ runs: [makeRun()], nextCursor: null })),
    getRun: vi.fn(async () => ({ run: makeRun(), events: [], nextAfterSequence: 0 })),
    cancelRun: vi.fn(async () => makeRun()),
    followRun: vi.fn(),
    ...overrides,
  } as ManagedCloudAgentRunClient;
}

async function openDetails() {
  fireEvent.click(await screen.findByRole('button', { name: 'View details for AGI Work task' }));
}

describe('Tasks — in-flight journal auto-refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-reads a running run and stops polling once it reaches a terminal state', async () => {
    const runningRun = makeRun({ state: 'running', lastEventSequence: 0 });
    const finishedRun = makeRun({
      state: 'completed',
      lastEventSequence: 1,
      completedAt: '2026-08-01T12:05:00.000Z',
    });

    // Poll 1 sees the same running snapshot; poll 2 sees the finished run with a
    // new journal entry; anything after that would be a poll that should never
    // have been issued.
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({
        run: runningRun,
        events: [progress(0, 'Gathering the source data')],
        nextAfterSequence: 0,
      })
      .mockResolvedValueOnce({
        run: runningRun,
        events: [progress(0, 'Gathering the source data')],
        nextAfterSequence: 0,
      })
      .mockResolvedValueOnce({
        run: finishedRun,
        events: [progress(0, 'Gathering the source data'), progress(1, 'Wrote the summary')],
        nextAfterSequence: 1,
      })
      .mockResolvedValue({
        run: finishedRun,
        events: [progress(0, 'Gathering the source data'), progress(1, 'Wrote the summary')],
        nextAfterSequence: 1,
      });

    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [runningRun], nextCursor: null })),
            getRun,
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
        }}
      />,
    );

    await openDetails();
    expect(await screen.findByText('Gathering the source data')).toBeTruthy();
    expect(screen.getByTestId('task-auto-refreshing')).toBeTruthy();
    expect(getRun).toHaveBeenCalledTimes(1);

    // Poll 1 — still running, so the loop must arm itself again.
    await vi.advanceTimersByTimeAsync(TASK_JOURNAL_POLL_INTERVAL_MS + 1);
    await waitFor(() => expect(getRun).toHaveBeenCalledTimes(2));

    // Poll 2 — the run finished. The new entry lands without a manual refresh.
    await vi.advanceTimersByTimeAsync(TASK_JOURNAL_POLL_INTERVAL_MS + 1);
    expect(await screen.findByText('Wrote the summary')).toBeTruthy();
    expect(getRun).toHaveBeenCalledTimes(3);

    // Terminal: the live badge is gone and no further request is issued, however
    // long the panel stays open.
    await waitFor(() => expect(screen.queryByTestId('task-auto-refreshing')).toBeNull());
    await vi.advanceTimersByTimeAsync(TASK_JOURNAL_POLL_INTERVAL_MS * 5);
    expect(getRun).toHaveBeenCalledTimes(3);
  });

  it('re-reads only the events after the last one it already has', async () => {
    const runningRun = makeRun({ state: 'running', lastEventSequence: 0 });
    const advancedRun = makeRun({ state: 'running', lastEventSequence: 1 });
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({
        run: runningRun,
        events: [progress(0, 'Gathering the source data')],
        nextAfterSequence: 0,
      })
      .mockResolvedValueOnce({
        run: advancedRun,
        events: [progress(1, 'Wrote the summary')],
        nextAfterSequence: 1,
      })
      .mockResolvedValue({ run: advancedRun, events: [], nextAfterSequence: 1 });

    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [runningRun], nextCursor: null })),
            getRun,
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
        }}
      />,
    );

    await openDetails();
    expect(await screen.findByText('Gathering the source data')).toBeTruthy();
    expect(getRun).toHaveBeenNthCalledWith(
      1,
      RUN_ID,
      expect.objectContaining({ afterSequence: -1 }),
    );

    await vi.advanceTimersByTimeAsync(TASK_JOURNAL_POLL_INTERVAL_MS + 1);
    await waitFor(() => expect(getRun).toHaveBeenCalledTimes(2));

    // The poll resumed from the sequence already held, and the delta was
    // appended rather than replacing what was on screen.
    expect(getRun).toHaveBeenNthCalledWith(
      2,
      RUN_ID,
      expect.objectContaining({ afterSequence: 0 }),
    );
    expect(await screen.findByText('Wrote the summary')).toBeTruthy();
    expect(screen.getByText('Gathering the source data')).toBeTruthy();
  });

  it('never polls a run that is already terminal when it is opened', async () => {
    const done = makeRun({ state: 'completed', completedAt: '2026-08-01T12:05:00.000Z' });
    const getRun = vi.fn(async () => ({
      run: done,
      events: [progress(0, 'Finished the deliverable')],
      nextAfterSequence: 0,
    }));

    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [done], nextCursor: null })),
            getRun,
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
        }}
      />,
    );

    await openDetails();
    expect(await screen.findByText('Finished the deliverable')).toBeTruthy();
    expect(screen.queryByTestId('task-auto-refreshing')).toBeNull();

    await vi.advanceTimersByTimeAsync(TASK_JOURNAL_POLL_INTERVAL_MS * 4);
    expect(getRun).toHaveBeenCalledTimes(1);
  });

  it('stops the loop and says so when a background re-read fails', async () => {
    const runningRun = makeRun({ state: 'running' });
    const getRun = vi
      .fn()
      .mockResolvedValueOnce({
        run: runningRun,
        events: [progress(0, 'Gathering the source data')],
        nextAfterSequence: 0,
      })
      .mockRejectedValue(new Error('network down'));

    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [runningRun], nextCursor: null })),
            getRun,
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
        }}
      />,
    );

    await openDetails();
    expect(await screen.findByText('Gathering the source data')).toBeTruthy();

    await vi.advanceTimersByTimeAsync(TASK_JOURNAL_POLL_INTERVAL_MS + 1);
    expect(await screen.findByText(/Live updates stopped/)).toBeTruthy();

    // The failure is reported once, not retried behind the user's back, and the
    // already-loaded journal is not thrown away.
    await vi.advanceTimersByTimeAsync(TASK_JOURNAL_POLL_INTERVAL_MS * 4);
    expect(getRun).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Gathering the source data')).toBeTruthy();
  });
});

describe('Tasks — failure reason', () => {
  it('renders the engine error message recorded on a failed run', async () => {
    const failed = makeRun({ state: 'failed', lastEventSequence: 1, completedAt: null });
    const getRun = vi.fn(async () => ({
      run: failed,
      events: [
        progress(0, 'Started the spreadsheet build'),
        event(1, {
          type: 'error',
          message: 'The code_execution sandbox ran out of memory before the file was written.',
          code: 'sandbox_oom',
          retryable: true,
        }),
      ],
      nextAfterSequence: 1,
    }));

    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [failed], nextCursor: null })),
            getRun,
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
        }}
      />,
    );

    await openDetails();

    const panel = await screen.findByTestId('task-failure-reason');
    expect(panel.textContent).toContain(
      'The code_execution sandbox ran out of memory before the file was written.',
    );
    expect(panel.textContent).toContain('sandbox_oom');
    expect(panel.textContent).toContain('Temporary — safe to run again');
  });

  it('admits when a failed run recorded no reason instead of showing a bare badge', async () => {
    const failed = makeRun({ state: 'failed' });
    const getRun = vi.fn(async () => ({
      run: failed,
      events: [progress(0, 'Started the spreadsheet build')],
      nextAfterSequence: 0,
    }));

    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [failed], nextCursor: null })),
            getRun,
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
        }}
      />,
    );

    await openDetails();
    const panel = await screen.findByTestId('task-failure-reason');
    await waitFor(() => expect(panel.textContent).toContain('recorded no reason for this failure'));
  });

  it('shows no failure section for a healthy run', async () => {
    const done = makeRun({ state: 'completed', completedAt: '2026-08-01T12:05:00.000Z' });
    render(
      <TasksPage
        transport={{
          client: client({
            listRuns: vi.fn(async () => ({ runs: [done], nextCursor: null })),
            getRun: vi.fn(async () => ({
              run: done,
              events: [progress(0, 'Finished the deliverable')],
              nextAfterSequence: 0,
            })),
          }),
          openConversation: vi.fn(),
          notifyError: vi.fn(),
        }}
      />,
    );

    await openDetails();
    expect(await screen.findByText('Finished the deliverable')).toBeTruthy();
    expect(screen.queryByTestId('task-failure-reason')).toBeNull();
  });
});
