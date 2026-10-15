import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from 'sonner';
import {
  type ScheduledTask,
  type TaskInterval,
  type TaskSchedule,
  useSchedulerStore,
} from '../../../stores/schedulerStore';
import { CreateTaskModal } from '../CreateTaskModal';

const ZONE = 'America/New_York';

const createTask = vi.fn(async () => undefined);
const updateTask = vi.fn(async () => undefined);
const onClose = vi.fn();

function dailyTask(): ScheduledTask {
  return {
    id: 'task-1',
    name: 'Morning summary',
    description: 'Before stand-up',
    prompt: 'Summarise my inbox',
    actionType: 'agiTask',
    schedule: { type: 'recurring', interval: 'daily', timeOfDay: '09:00', timezone: ZONE },
    status: 'active',
    lastRunAt: null,
    nextRunAt: null,
    runCount: 0,
    failureCount: 0,
    lastProblem: null,
    lastRunWasDueAt: null,
    lastOutput: null,
    createdAt: 0,
  };
}

function fillNameAndPrompt() {
  fireEvent.change(screen.getByLabelText(/Task name/), { target: { value: 'Weekly summary' } });
  fireEvent.change(screen.getByLabelText(/AI Prompt/), {
    target: { value: 'Summarise the week' },
  });
}

function choose(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('the scheduled task form', () => {
  let zone: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const options = Intl.DateTimeFormat().resolvedOptions();
    zone = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ ...options, timeZone: ZONE });
    createTask.mockResolvedValue(undefined);
    updateTask.mockResolvedValue(undefined);
    useSchedulerStore.setState({ createTask, updateTask });
  });

  afterEach(() => {
    cleanup();
    zone.mockRestore();
  });

  it('creates the daily schedule it opens on, at the time and in the zone it states', async () => {
    render(<CreateTaskModal isOpen onClose={onClose} />);
    fillNameAndPrompt();

    expect(screen.getByLabelText('Time')).toHaveValue('09:00');
    expect(screen.getByText(`Runs every day at 09:00, ${ZONE} time`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask).toHaveBeenCalledWith({
      name: 'Weekly summary',
      description: '',
      prompt: 'Summarise the week',
      schedule: { type: 'recurring', interval: 'daily', timeOfDay: '09:00', timezone: ZONE },
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Task created'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  const repeats: Array<[TaskInterval, () => void, TaskSchedule, string]> = [
    [
      'hourly',
      (): void => undefined,
      { type: 'recurring', interval: 'hourly', timezone: ZONE },
      `Runs every hour, on the hour, ${ZONE} time`,
    ],
    [
      'weekly',
      (): void => {
        choose('Day of the week', '5');
        choose('Time', '16:00');
      },
      { type: 'recurring', interval: 'weekly', timeOfDay: '16:00', weekday: 5, timezone: ZONE },
      `Runs every Friday at 16:00, ${ZONE} time`,
    ],
    [
      'monthly',
      (): void => {
        choose('Day of the month', '15');
        choose('Time', '07:30');
      },
      {
        type: 'recurring',
        interval: 'monthly',
        timeOfDay: '07:30',
        dayOfMonth: 15,
        timezone: ZONE,
      },
      `Runs on day 15 of every month at 07:30, ${ZONE} time`,
    ],
    [
      'custom',
      (): void => choose('Cron expression', '0 9 * * 1'),
      { type: 'recurring', interval: 'custom', cronExpression: '0 9 * * 1', timezone: ZONE },
      `Cron 0 9 * * 1, ${ZONE} time`,
    ],
  ];

  it.each(repeats)('creates a %s schedule as shown', async (interval, fill, schedule, preview) => {
    render(<CreateTaskModal isOpen onClose={onClose} />);
    fillNameAndPrompt();
    choose('Repeat interval', interval);
    fill();

    expect(screen.getByText(preview)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ schedule }));
  });

  it('creates a task that runs once at the chosen time, with no repeat left in it', async () => {
    render(<CreateTaskModal isOpen onClose={onClose} />);
    fillNameAndPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Run Once' }));

    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(toast.error).toHaveBeenCalledWith('Please select a date and time for the one-time run');
    expect(createTask).not.toHaveBeenCalled();

    choose('Date & Time', '2031-03-04T09:30');
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        schedule: {
          type: 'once',
          runAt: new Date('2031-03-04T09:30').getTime(),
          timezone: ZONE,
        },
      }),
    );
  });

  it('shows a cron example the scheduler accepts and has no model to choose', () => {
    render(<CreateTaskModal isOpen onClose={onClose} />);
    choose('Repeat interval', 'custom');

    expect(screen.getByLabelText('Cron expression')).toHaveAttribute('placeholder', '0 9 * * 1');
    expect(screen.getByText(/Five fields: minute, hour, day of month, month/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Model/)).not.toBeInTheDocument();

    fillNameAndPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(toast.error).toHaveBeenCalledWith('Enter a cron expression for the custom schedule');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('an edit from daily to weekly saves the weekly schedule on screen', async () => {
    render(<CreateTaskModal isOpen editingTask={dailyTask()} onClose={onClose} />);

    expect(screen.getByLabelText('Repeat interval')).toHaveValue('daily');
    choose('Repeat interval', 'weekly');
    choose('Day of the week', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask).toHaveBeenCalledWith('task-1', {
      name: 'Morning summary',
      description: 'Before stand-up',
      prompt: 'Summarise my inbox',
      schedule: {
        type: 'recurring',
        interval: 'weekly',
        timeOfDay: '09:00',
        weekday: 3,
        timezone: ZONE,
      },
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Task updated'));
  });

  it('an edit that leaves the schedule alone sends it back exactly as stored', async () => {
    const task = dailyTask();
    render(<CreateTaskModal isOpen editingTask={task} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/Task name/), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    expect(updateTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ name: 'Renamed', schedule: task.schedule }),
    );
  });

  it('an edit the scheduler refuses is not announced as saved and stays open', async () => {
    updateTask.mockRejectedValueOnce({ type: 'Generic', details: 'not a schedule' });
    render(<CreateTaskModal isOpen editingTask={dailyTask()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled(),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
