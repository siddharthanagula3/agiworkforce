import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type JobExecutionRecord, useSchedulerStore } from '../../../stores/schedulerStore';
import { AgiWorkScheduled } from '../AgiWorkScheduled';
import { useNotificationTargetStore } from '../../notifications/notificationTarget';

type TauriMockModule = typeof import('../../../lib/tauri-mock');

const fetchTasks = vi.fn(async () => undefined);
const toggleTask = vi.fn(async () => undefined);
const deleteTask = vi.fn(async () => undefined);
const runNow = vi.fn(async () => undefined);
const stopRun = vi.fn(async () => undefined);
const getHistory = vi.fn(async (): Promise<JobExecutionRecord[]> => []);
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: invokeMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'agiWork.scheduled.title': 'Scheduled tasks',
        'agiWork.scheduled.loading': 'Loading scheduled tasks…',
        'agiWork.scheduled.nextRun': 'Next run',
        'agiWork.scheduled.paused': 'Paused',
        'agiWork.scheduled.empty': 'No scheduled tasks yet.',
        'agiWork.scheduled.keepAwakeTitle': 'Keep computer awake',
        'agiWork.scheduled.keepAwakeHint': 'Scheduled tasks run only while AGI Workforce is open.',
        'agiWork.scheduled.keepAwakeUnavailable': `Unavailable: ${params?.['reason'] ?? ''}`,
        'agiWork.scheduled.pauseAria': `Pause scheduled task ${params?.['name'] ?? ''}`,
        'agiWork.scheduled.resumeAria': `Resume scheduled task ${params?.['name'] ?? ''}`,
        'agiWork.scheduled.deleteTitle': 'Delete scheduled task?',
        'agiWork.scheduled.deleteDescription': `Delete ${params?.['name'] ?? ''}. This cannot be undone.`,
        'common.delete': 'Delete',
        'common.refresh': 'Refresh',
        'agiWork.scheduled.emptyTitle': 'No scheduled tasks',
        'agiWork.scheduled.stopped': 'Stopped',
        'agiWork.scheduled.finished': 'Finished',
        'agiWork.scheduled.turnBackOn': 'Turn back on',
        'agiWork.scheduled.turnBackOnAria': `Turn scheduled task ${params?.['name'] ?? ''} back on`,
        'agiWork.scheduled.detailsAria': `Result and runs of scheduled task ${params?.['name'] ?? ''}`,
        'agiWork.scheduled.runNowAria': `Run scheduled task ${params?.['name'] ?? ''} now`,
        'agiWork.scheduled.editAria': `Edit scheduled task ${params?.['name'] ?? ''}`,
        'agiWork.scheduled.lastResult': 'Last result',
        'agiWork.scheduled.noResult': 'No result yet.',
        'agiWork.scheduled.recentRuns': 'Recent runs',
        'agiWork.scheduled.noRuns': 'No runs yet.',
        'agiWork.scheduled.runCompleted': 'Ran',
        'agiWork.scheduled.runFailed': 'Failed',
        'agiWork.scheduled.runSkipped': 'Skipped',
        'agiWork.scheduled.runRunning': 'Running',
        'agiWork.scheduled.stop': 'Stop',
        'agiWork.scheduled.stopAria': `Stop the run of scheduled task ${params?.['name'] ?? ''}`,
        'agiWork.scheduled.ranLate': `Its last run was late: it was due ${params?.['when'] ?? ''}.`,
        'agiWork.scheduled.historyUnavailable': `Run history is unavailable: ${params?.['reason'] ?? ''}`,
      };
      return labels[key] ?? key;
    },
  }),
}));

describe('AgiWorkScheduled capability honesty', () => {
  let zone: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const options = Intl.DateTimeFormat().resolvedOptions();
    zone = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...options, timeZone: 'America/New_York' });
    fetchTasks.mockClear();
    toggleTask.mockClear();
    deleteTask.mockClear();
    runNow.mockClear();
    stopRun.mockClear();
    getHistory.mockReset();
    getHistory.mockResolvedValue([]);
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (command: string) =>
      command === 'scheduler_get_keep_awake' ? false : undefined,
    );
    useSchedulerStore.setState({
      tasks: [
        {
          id: 'task-1',
          name: 'Daily brief',
          description: 'Prepare the daily brief',
          prompt: 'Prepare the daily brief',
          actionType: 'agiTask',
          schedule: { type: 'recurring', interval: 'daily' },
          status: 'active',
          lastRunAt: null,
          nextRunAt: Date.now() + 60_000,
          runCount: 0,
          failureCount: 0,
          lastProblem: null,
          lastRunWasDueAt: null,
          lastOutput: null,
          createdAt: Date.now(),
        },
      ],
      isLoading: false,
      error: null,
      fetchTasks,
      toggleTask,
      deleteTask,
      runNow,
      stopRun,
      getHistory,
      runningTaskIds: [],
    });
  });

  afterEach(() => {
    cleanup();
    zone.mockRestore();
  });

  it('reads the keep-awake preference from the native scheduler and saves a change', async () => {
    render(<AgiWorkScheduled />);

    const toggle = await screen.findByRole('switch', { name: 'Keep computer awake' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/run only while AGI Workforce is open/)).toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('scheduler_set_keep_awake', { enabled: true }),
    );
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('puts the toggle back when the native scheduler refuses the change', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'scheduler_get_keep_awake') return false;
      throw new Error('Scheduled tasks are unavailable');
    });
    render(<AgiWorkScheduled />);

    const toggle = await screen.findByRole('switch', { name: 'Keep computer awake' });
    fireEvent.click(toggle);

    expect(await screen.findByText('Scheduled tasks are unavailable')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('shows keep-awake as unavailable with the reason when it cannot be read', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'scheduler_get_keep_awake') throw new Error('Scheduler is not running');
      return undefined;
    });
    render(<AgiWorkScheduled />);

    const toggle = await screen.findByRole('switch', { name: 'Keep computer awake' });
    expect(toggle).toBeDisabled();
    expect(screen.getByText('Unavailable: Scheduler is not running')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(invokeMock).not.toHaveBeenCalledWith('scheduler_set_keep_awake', expect.anything());
  });

  it('gives the task toggle an action-specific accessible name', () => {
    render(<AgiWorkScheduled />);

    fireEvent.click(screen.getByRole('switch', { name: 'Pause scheduled task Daily brief' }));
    expect(toggleTask).toHaveBeenCalledWith('task-1');
  });

  it('presents built-in maintenance schedules with user-facing names', () => {
    useSchedulerStore.setState((state) => ({
      tasks: [
        {
          ...state.tasks[0]!,
          name: 'memory_weekly_decay',
          actionType: 'memoryDecay',
          schedule: {
            type: 'recurring',
            interval: 'custom',
            cronExpression: '0 0 4 * * 1',
            timezone: 'UTC',
          },
        },
      ],
    }));

    render(<AgiWorkScheduled />);

    expect(screen.getByText('Weekly memory cleanup')).toBeInTheDocument();
    expect(screen.getByText('Every week (UTC)')).toBeInTheDocument();
    expect(screen.queryByText('memory_weekly_decay')).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Pause scheduled task Weekly memory cleanup' }),
    ).toBeInTheDocument();
  });

  it('shows a task stopped after repeated failures, why, and a way to turn it back on', () => {
    useSchedulerStore.setState((state) => ({
      tasks: [
        {
          ...state.tasks[0]!,
          status: 'failed',
          failureCount: 3,
          lastProblem: { kind: 'failed', reason: 'The model could not be reached.' },
        },
      ],
    }));

    render(<AgiWorkScheduled />);

    expect(screen.getByText('Stopped')).toBeInTheDocument();
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
    expect(screen.getByTestId('scheduled-task-problem')).toHaveTextContent(
      'Stopped after 3 failed runs in a row. Last error: The model could not be reached.',
    );
    expect(screen.queryByRole('switch', { name: /Daily brief/ })).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Turn scheduled task Daily brief back on' }),
    );
    expect(toggleTask).toHaveBeenCalledWith('task-1');
  });

  it('says a run was skipped, and why, without calling the task stopped', () => {
    useSchedulerStore.setState((state) => ({
      tasks: [
        {
          ...state.tasks[0]!,
          lastProblem: { kind: 'skipped', reason: 'Switch to Cloud to run it.' },
        },
      ],
    }));

    render(<AgiWorkScheduled />);

    expect(screen.getByText('Next run')).toBeInTheDocument();
    expect(screen.getByTestId('scheduled-task-problem')).toHaveTextContent(
      'Last run skipped: Switch to Cloud to run it.',
    );
    expect(
      screen.getByRole('switch', { name: 'Pause scheduled task Daily brief' }),
    ).toBeInTheDocument();
  });

  it('shows a one-time task that has run as finished, with nothing to switch on', () => {
    useSchedulerStore.setState((state) => ({
      tasks: [
        {
          ...state.tasks[0]!,
          status: 'completed',
          schedule: { type: 'once', runAt: Date.now() - 60_000 },
          nextRunAt: null,
          lastRunAt: Date.now() - 60_000,
        },
      ],
    }));

    render(<AgiWorkScheduled />);

    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Resume scheduled task Daily brief' }),
    ).toBeDisabled();
  });

  it('shows the last result and the recent runs where a notice sends the reader', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    getHistory.mockResolvedValue([
      {
        id: 2,
        jobId: 'task-1',
        startedAt: '2026-10-11T09:00:00.000Z',
        completedAt: '2026-10-11T09:00:04.000Z',
        status: 'failed',
        error: 'The model could not be reached.',
        durationMs: 4000,
      },
      {
        id: 1,
        jobId: 'task-1',
        startedAt: '2026-10-10T09:00:00.000Z',
        completedAt: '2026-10-10T09:00:03.000Z',
        status: 'completed',
        error: null,
        durationMs: 3000,
      },
    ]);
    useSchedulerStore.setState((state) => ({
      tasks: [{ ...state.tasks[0]!, lastOutput: 'Three things need a reply today.' }],
    }));
    useNotificationTargetStore.getState().request({ kind: 'schedule', id: 'task-1' });

    render(<AgiWorkScheduled />);

    const details = await screen.findByTestId('scheduled-task-details');
    expect(details).toHaveTextContent('Three things need a reply today.');
    await waitFor(() => expect(details).toHaveTextContent('The model could not be reached.'));
    expect(getHistory).toHaveBeenCalledWith('task-1');
    expect(details).toHaveTextContent('Failed');
    expect(details).toHaveTextContent('Ran');
    expect(
      screen.getByRole('button', { name: 'Result and runs of scheduled task Daily brief' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the result closed until asked, and says when there is none or it cannot be read', async () => {
    getHistory.mockRejectedValue({ type: 'Generic', details: 'Scheduled tasks are unavailable' });
    render(<AgiWorkScheduled />);

    expect(screen.queryByTestId('scheduled-task-details')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Result and runs of scheduled task Daily brief' }),
    );

    const details = screen.getByTestId('scheduled-task-details');
    expect(details).toHaveTextContent('No result yet.');
    await waitFor(() =>
      expect(details).toHaveTextContent(
        'Run history is unavailable: Scheduled tasks are unavailable',
      ),
    );
  });

  it('runs a task now and opens it for editing from its row', () => {
    render(<AgiWorkScheduled />);

    fireEvent.click(screen.getByRole('button', { name: 'Run scheduled task Daily brief now' }));
    expect(runNow).toHaveBeenCalledWith('task-1');
    expect(screen.getByTestId('scheduled-task-details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit scheduled task Daily brief' }));
    expect(screen.getByRole('dialog', { name: 'Edit Scheduled Task' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Task name/)).toHaveValue('Daily brief');
  });

  it('shows a run in progress and stops it from the row', () => {
    useSchedulerStore.setState({ runningTaskIds: ['task-1'] });

    render(<AgiWorkScheduled />);

    expect(screen.getByRole('status')).toHaveTextContent('Running');
    expect(screen.queryByText('Next run')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop the run of scheduled task Daily brief' }),
    );
    expect(stopRun).toHaveBeenCalledWith('task-1');
  });

  it('offers no Stop when nothing is running, and says when a run was late', () => {
    const due = new Date('2026-10-10T09:00:00').getTime();
    useSchedulerStore.setState((state) => ({
      tasks: [{ ...state.tasks[0]!, lastRunWasDueAt: due }],
    }));

    render(<AgiWorkScheduled />);

    expect(
      screen.queryByRole('button', { name: 'Stop the run of scheduled task Daily brief' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('scheduled-task-ran-late')).toHaveTextContent(
      /^Its last run was late: it was due .*10.*\.$/,
    );
  });

  it('offers no edit for a task that is not an AI prompt', () => {
    useSchedulerStore.setState((state) => ({
      tasks: [{ ...state.tasks[0]!, actionType: 'notification' }],
    }));

    render(<AgiWorkScheduled />);

    expect(
      screen.queryByRole('button', { name: 'Edit scheduled task Daily brief' }),
    ).not.toBeInTheDocument();
  });

  it('reports a failed load instead of claiming there is nothing scheduled', () => {
    useSchedulerStore.setState({ tasks: [], isLoading: false, error: 'Scheduler is unavailable' });

    render(<AgiWorkScheduled />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Scheduler is unavailable');
    expect(screen.queryByText('No scheduled tasks')).not.toBeInTheDocument();

    fetchTasks.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(fetchTasks).toHaveBeenCalled();
  });

  it('keeps loaded tasks visible when a later action fails', () => {
    useSchedulerStore.setState({ error: 'Failed to toggle task' });

    render(<AgiWorkScheduled />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to toggle task');
    expect(screen.getByText('Daily brief')).toBeInTheDocument();
  });

  it('requires confirmation before deleting a scheduled task', () => {
    render(<AgiWorkScheduled />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Daily brief' }));
    expect(deleteTask).not.toHaveBeenCalled();
    expect(screen.getByText('Delete scheduled task?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteTask).toHaveBeenCalledWith('task-1');
  });

  it('selects the scheduled task a clicked notification was about', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    useNotificationTargetStore.getState().request({ kind: 'schedule', id: 'task-1' });

    render(<AgiWorkScheduled />);

    const row = screen.getByText('Daily brief').closest('[data-notification-target]');
    await waitFor(() => expect(row).toHaveFocus());
    expect(row).toHaveAttribute('data-notification-target', 'schedule:task-1');
    expect(row?.className).toContain('ring-2 ring-[var(--chat-accent-primary)]');
    expect(useNotificationTargetStore.getState().pending).toBeNull();
  });

  it('drops the selection when the task a notification named is gone', async () => {
    useNotificationTargetStore.getState().request({ kind: 'schedule', id: 'task-deleted' });

    render(<AgiWorkScheduled />);

    await waitFor(() => expect(useNotificationTargetStore.getState().pending).toBeNull());
    expect(document.activeElement).toBe(document.body);
  });
});
