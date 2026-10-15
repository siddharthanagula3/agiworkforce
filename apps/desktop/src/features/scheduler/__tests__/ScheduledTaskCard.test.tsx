import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { type ScheduledTask, useSchedulerStore } from '../../../stores/schedulerStore';
import { ScheduledTaskCard } from '../ScheduledTaskCard';

const deleteTask = vi.fn(async () => undefined);

const task: ScheduledTask = {
  id: 'task-1',
  name: 'Morning summary',
  description: '',
  prompt: 'Summarise my inbox',
  actionType: 'agiTask',
  schedule: { type: 'recurring', interval: 'daily', timeOfDay: '09:00' },
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

describe('deleting a scheduled task from its card', () => {
  beforeEach(() => {
    deleteTask.mockClear();
    useSchedulerStore.setState({ deleteTask });
  });

  afterEach(() => cleanup());

  it('asks first, says what is lost, and deletes nothing when the answer is no', () => {
    render(<ScheduledTaskCard task={task} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete scheduled task?');
    expect(dialog).toHaveTextContent('"Morning summary" stops running on its schedule');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    expect(deleteTask).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteTask).not.toHaveBeenCalled();
  });

  it('deletes once the reader confirms', async () => {
    render(<ScheduledTaskCard task={task} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith('task-1'));
  });
});
