import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { TasksPage } from '../TasksPage';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';

const runningRun: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conversation-1',
  conversationTitle: 'Market research',
  originSurface: 'web',
  workMode: 'agiwork',
  state: 'running',
  workState: 'running',
  provider: 'anthropic',
  model: 'fixture-task-model',
  lastEventSequence: 12,
  cancellationRequestedAt: null,
  pauseRequestedAt: null,
  completedAt: null,
  createdAt: '2026-09-16T12:00:00.000Z',
  updatedAt: '2026-09-16T12:00:10.000Z',
};

function client(
  runs: CloudAgentRun[],
  overrides: Partial<ManagedCloudAgentRunClient> = {},
): ManagedCloudAgentRunClient {
  return {
    listRuns: vi.fn(async () => ({ runs, nextCursor: null })),
    getRun: vi.fn(async () => ({ run: runs[0]!, events: [], nextAfterSequence: 12 })),
    cancelRun: vi.fn(async () => runs[0]!),
    resumeRun: vi.fn(async () => undefined),
    pauseRun: vi.fn(async () => ({ ...runs[0]!, pauseRequestedAt: '2026-09-16T12:00:11.000Z' })),
    resumePausedRun: vi.fn(async () => undefined),
    followRun: vi.fn(),
    ...overrides,
  } as ManagedCloudAgentRunClient;
}

function renderTasks(taskClient: ManagedCloudAgentRunClient, notifyError = vi.fn()) {
  render(<TasksPage transport={{ client: taskClient, openConversation: vi.fn(), notifyError }} />);
  return { notifyError };
}

describe('Tasks pause and resume', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pauses a working run and shows the pause as pending until the run reaches it', async () => {
    const taskClient = client([runningRun]);
    renderTasks(taskClient);

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));

    await waitFor(() => expect(taskClient.pauseRun).toHaveBeenCalledWith(RUN_ID));
    expect(await screen.findByText('Pausing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep working' })).toBeTruthy();
  });

  it('withdraws a pending pause through the resume call', async () => {
    const pending = { ...runningRun, pauseRequestedAt: '2026-09-16T12:00:11.000Z' };
    const taskClient = client([pending]);
    renderTasks(taskClient);

    fireEvent.click(await screen.findByRole('button', { name: 'Keep working' }));

    await waitFor(() => expect(taskClient.resumePausedRun).toHaveBeenCalledWith(RUN_ID, {}));
  });

  it('steers a paused run: the guidance typed while paused goes with the resume', async () => {
    const paused = { ...runningRun, state: 'paused' as const, workState: 'paused' as const };
    const taskClient = client([paused]);
    renderTasks(taskClient);

    fireEvent.change(await screen.findByTestId(`task-pause-guidance-${RUN_ID}`), {
      target: { value: 'Focus on pricing, skip the history.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() =>
      expect(taskClient.resumePausedRun).toHaveBeenCalledWith(RUN_ID, {
        guidance: 'Focus on pricing, skip the history.',
      }),
    );
  });

  it('offers Resume, not Pause, on a paused run, and re-reads the list once it resumes', async () => {
    const paused = { ...runningRun, state: 'paused' as const, workState: 'paused' as const };
    const taskClient = client([paused]);
    renderTasks(taskClient);

    const row = (await screen.findByText('Market research')).closest(
      'div.rounded-lg',
    ) as HTMLElement;
    expect(within(row).getByText('Paused')).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Pause' })).toBeNull();

    fireEvent.click(within(row).getByRole('button', { name: 'Resume' }));

    await waitFor(() => expect(taskClient.resumePausedRun).toHaveBeenCalledWith(RUN_ID, {}));
    await waitFor(() => expect(taskClient.listRuns).toHaveBeenCalledTimes(2));
  });

  it('labels a finer Work state from workState while an older server sends only state', async () => {
    const timedOut = { ...runningRun, state: 'failed' as const, workState: 'timed_out' as const };
    const legacy = {
      ...runningRun,
      id: '0190a000-0000-7000-8000-000000000002',
      conversationTitle: 'Old server run',
      state: 'awaiting_input' as const,
      workState: undefined,
    };
    renderTasks(client([timedOut, legacy]));

    expect(await screen.findByText('Timed out')).toBeTruthy();
    expect(screen.getByText('Waiting for input')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: 'Pause' })).toHaveLength(0);
  });

  it('tells the user when another device resumed the run first', async () => {
    const paused = { ...runningRun, state: 'paused' as const, workState: 'paused' as const };
    const conflict = Object.assign(new Error('This task is already resuming.'), {
      name: 'ManagedCloudAgentRunAlreadyResumingError',
    });
    const { notifyError } = renderTasks(
      client([paused], { resumePausedRun: vi.fn(async () => Promise.reject(conflict)) }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('Another device already resumed this task.'),
    );
  });
});
