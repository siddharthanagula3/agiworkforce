import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSchedulerStore } from '../../../stores/schedulerStore';
import { AgiWorkScheduled } from '../AgiWorkScheduled';

const fetchTasks = vi.fn(async () => undefined);
const toggleTask = vi.fn(async () => undefined);
const deleteTask = vi.fn(async () => undefined);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'agiWork.scheduled.title': 'Scheduled tasks',
        'agiWork.scheduled.loading': 'Loading scheduled tasks…',
        'agiWork.scheduled.nextRun': 'Next run',
        'agiWork.scheduled.paused': 'Paused',
        'agiWork.scheduled.empty': 'No scheduled tasks yet.',
        'agiWork.scheduled.keepAwake': 'Keep this Mac awake for scheduled tasks',
        'agiWork.scheduled.keepAwakeDesc': 'Prevents sleep during scheduled runs.',
        'agiWork.scheduled.pauseAria': `Pause scheduled task ${params?.['name'] ?? ''}`,
        'agiWork.scheduled.resumeAria': `Resume scheduled task ${params?.['name'] ?? ''}`,
        'agiWork.scheduled.deleteTitle': 'Delete scheduled task?',
        'agiWork.scheduled.deleteDescription': `Delete ${params?.['name'] ?? ''}. This cannot be undone.`,
        'common.delete': 'Delete',
      };
      return labels[key] ?? key;
    },
  }),
}));

describe('AgiWorkScheduled capability honesty', () => {
  beforeEach(() => {
    fetchTasks.mockClear();
    toggleTask.mockClear();
    deleteTask.mockClear();
    useSchedulerStore.setState({
      tasks: [
        {
          id: 'task-1',
          name: 'Daily brief',
          description: 'Prepare the daily brief',
          prompt: 'Prepare the daily brief',
          schedule: { type: 'recurring', interval: 'daily' },
          status: 'active',
          lastRunAt: null,
          nextRunAt: Date.now() + 60_000,
          runCount: 0,
          lastOutput: null,
          createdAt: Date.now(),
        },
      ],
      isLoading: false,
      fetchTasks,
      toggleTask,
      deleteTask,
    });
  });

  afterEach(() => cleanup());

  it('does not expose a keep-awake preference that native power management never reads', () => {
    render(<AgiWorkScheduled />);

    expect(screen.queryByText(/Keep this Mac awake/i)).not.toBeInTheDocument();
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
          schedule: {
            type: 'recurring',
            interval: 'weekly',
            cronExpression: '0 0 4 * * 1',
          },
        },
      ],
    }));

    render(<AgiWorkScheduled />);

    expect(screen.getByText('Weekly memory cleanup')).toBeInTheDocument();
    expect(screen.getByText('Every week')).toBeInTheDocument();
    expect(screen.queryByText('memory_weekly_decay')).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Pause scheduled task Weekly memory cleanup' }),
    ).toBeInTheDocument();
  });

  it('requires confirmation before deleting a scheduled task', () => {
    render(<AgiWorkScheduled />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Daily brief' }));
    expect(deleteTask).not.toHaveBeenCalled();
    expect(screen.getByText('Delete scheduled task?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteTask).toHaveBeenCalledWith('task-1');
  });
});
