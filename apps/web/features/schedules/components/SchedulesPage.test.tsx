import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulesPage } from './SchedulesPage';
import type { ScheduleApi } from '../services/schedule-api';
import type { ScheduleRun, ScheduleTask } from '../types';

const schedule: ScheduleTask = {
  id: 'schedule-1',
  userId: 'user-1',
  name: 'Morning brief',
  description: 'Weekday priorities',
  scheduleType: 'cron',
  cronExpression: '30 9 * * 1-5',
  executeAt: null,
  intervalMs: null,
  timezone: 'America/Chicago',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: 20,
  executionCount: 2,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Summarize my priorities.',
  model: 'auto-balanced',
  status: 'active',
  lastExecutedAt: '2026-07-14T14:30:00.000Z',
  nextExecutionAt: '2026-07-15T14:30:00.000Z',
  lastError: null,
  metadata: {
    productRecurrence: 'weekly',
    timeOfDay: '09:30',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-14T14:30:00.000Z',
};

const successfulRun: ScheduleRun = {
  id: 'run-1',
  taskId: schedule.id,
  status: 'success',
  triggerSource: 'manual',
  scheduledFor: '2026-07-15T12:00:00.000Z',
  startedAt: '2026-07-15T12:00:00.000Z',
  completedAt: '2026-07-15T12:00:01.000Z',
  durationMs: 1_000,
  result: { text: 'Three priorities are ready.', model: 'test-model' },
  error: null,
  idempotencyKey: 'manual:request-key',
  leaseExpiresAt: null,
  attemptCount: 1,
};

function page(schedules: ScheduleTask[] = []) {
  return { schedules, pagination: { limit: 50, offset: 0 }, hasMore: false };
}

function runsPage(runs: ScheduleRun[] = [], hasMore = false, offset = 0) {
  return { runs, pagination: { limit: 20, offset }, hasMore };
}

function createApi(overrides: Partial<ScheduleApi> = {}): ScheduleApi {
  return {
    listSchedules: vi.fn(async () => page()),
    getSchedule: vi.fn(async () => schedule),
    createSchedule: vi.fn(async () => schedule),
    updateSchedule: vi.fn(async () => schedule),
    setScheduleEnabled: vi.fn<ScheduleApi['setScheduleEnabled']>(async (_id, active) => ({
      ...schedule,
      isEnabled: active,
      status: active ? 'active' : 'paused',
      nextExecutionAt: active ? schedule.nextExecutionAt : null,
    })),
    deleteSchedule: vi.fn(async () => undefined),
    listRuns: vi.fn(async () => runsPage()),
    runNow: vi.fn(async () => ({ run: successfulRun, replay: false })),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SchedulesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it('shows a real loading state, then an actionable empty state', async () => {
    const request = deferred<ReturnType<typeof page>>();
    const api = createApi({ listSchedules: vi.fn(() => request.promise) });

    render(<SchedulesPage api={api} />);
    expect(screen.getByRole('status', { name: 'Loading schedules' })).toBeInTheDocument();

    await act(async () => request.resolve(page()));

    expect(await screen.findByText('No schedules yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Your First Schedule' })).toBeEnabled();
  });

  it('explains list failures and retries without reloading the route', async () => {
    const listSchedules = vi
      .fn<ScheduleApi['listSchedules']>()
      .mockRejectedValueOnce(new Error('Could not reach the schedules service.'))
      .mockResolvedValueOnce(page([schedule]));
    const api = createApi({ listSchedules });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach the schedules service.',
    );

    await user.click(screen.getByRole('button', { name: 'Retry Loading Schedules' }));

    expect(await screen.findByRole('heading', { name: 'Morning brief' })).toBeInTheDocument();
    expect(listSchedules).toHaveBeenCalledTimes(2);
  });

  it('preserves schedules and clears a paginated list error after retrying the same page', async () => {
    const secondSchedule = { ...schedule, id: 'schedule-2', name: 'Evening brief' };
    const listSchedules = vi
      .fn<ScheduleApi['listSchedules']>()
      .mockResolvedValueOnce({
        schedules: [schedule],
        pagination: { limit: 50, offset: 0 },
        hasMore: true,
      })
      .mockRejectedValueOnce(new Error('The next schedule page failed.'))
      .mockResolvedValueOnce({
        schedules: [secondSchedule],
        pagination: { limit: 50, offset: 50 },
        hasMore: false,
      });
    const api = createApi({ listSchedules });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'Load More Schedules' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The next schedule page failed.');
    expect(screen.getByRole('heading', { name: 'Morning brief' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry Loading More Schedules' }));
    expect(await screen.findByRole('heading', { name: 'Evening brief' })).toBeInTheDocument();
    expect(screen.queryByText('The next schedule page failed.')).not.toBeInTheDocument();
    expect(listSchedules).toHaveBeenNthCalledWith(3, {
      limit: 50,
      offset: 50,
      signal: undefined,
    });
  });

  it('keeps invalid create input in the dialog, reports inline errors, and focuses the first field', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SchedulesPage api={api} now={() => new Date('2026-07-15T12:00:00.000Z')} />);
    await screen.findByText('No schedules yet');

    await user.click(screen.getByRole('button', { name: 'Create Your First Schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Schedule' });
    await user.click(within(dialog).getByRole('button', { name: 'Create Schedule' }));

    expect(within(dialog).getByText('Enter a schedule name.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Enter instructions for the scheduled task.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Schedule Name')).toHaveFocus();
    expect(api.createSchedule).not.toHaveBeenCalled();
  });

  it('creates a supported schedule, updates the list, and announces success', async () => {
    const created = { ...schedule, id: 'schedule-created', name: 'Daily plan' };
    const api = createApi({ createSchedule: vi.fn(async () => created) });
    const user = userEvent.setup();
    render(<SchedulesPage api={api} now={() => new Date('2026-07-15T12:00:00.000Z')} />);
    await screen.findByText('No schedules yet');

    await user.click(screen.getByRole('button', { name: 'Create Your First Schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Schedule' });
    await user.type(within(dialog).getByLabelText('Schedule Name'), 'Daily plan');
    await user.type(
      within(dialog).getByLabelText('Task Instructions'),
      'Prepare a concise plan for the day.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create Schedule' }));

    await waitFor(() => expect(api.createSchedule).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: 'Daily plan' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Schedule action result' })).toHaveTextContent(
      'Schedule created.',
    );
    expect(screen.queryByRole('dialog', { name: 'Create Schedule' })).not.toBeInTheDocument();
  });

  it('edits, pauses, resumes, and manually runs an active schedule with a stable key', async () => {
    const updated = { ...schedule, name: 'Updated brief' };
    const updateSchedule = vi.fn(async () => updated);
    const setScheduleEnabled = vi
      .fn<ScheduleApi['setScheduleEnabled']>()
      .mockResolvedValueOnce({
        ...updated,
        isEnabled: false,
        status: 'paused',
        nextExecutionAt: null,
      })
      .mockResolvedValueOnce(updated);
    const runNow = vi.fn(async () => ({ run: successfulRun, replay: false }));
    const api = createApi({
      listSchedules: vi.fn(async () => page([schedule])),
      updateSchedule,
      setScheduleEnabled,
      runNow,
    });
    const user = userEvent.setup();

    render(
      <SchedulesPage
        api={api}
        createIdempotencyKey={() => 'request-key'}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
      />,
    );
    await screen.findByRole('heading', { name: 'Morning brief' });

    await user.click(screen.getByRole('button', { name: 'Edit Morning brief' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Schedule' });
    const name = within(dialog).getByLabelText('Schedule Name');
    await user.clear(name);
    await user.type(name, 'Updated brief');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByRole('heading', { name: 'Updated brief' })).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Pause Updated brief' }));
    expect(await screen.findByRole('switch', { name: 'Resume Updated brief' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Updated brief Now' })).toBeDisabled();

    await user.click(screen.getByRole('switch', { name: 'Resume Updated brief' }));
    await user.click(screen.getByRole('button', { name: 'Run Updated brief Now' }));

    await waitFor(() => expect(runNow).toHaveBeenCalledWith(schedule.id, 'request-key'));
    expect(screen.getByRole('status', { name: 'Schedule action result' })).toHaveTextContent(
      'Schedule finished successfully.',
    );
  });

  it('loads paginated run history and renders structured result and failure output honestly', async () => {
    const failedRun: ScheduleRun = {
      ...successfulRun,
      id: 'run-2',
      status: 'failed',
      result: null,
      error: 'Provider request failed.',
    };
    const listRuns = vi
      .fn<ScheduleApi['listRuns']>()
      .mockResolvedValueOnce(runsPage([successfulRun], true, 0))
      .mockResolvedValueOnce(runsPage([failedRun], false, 20));
    const api = createApi({
      listSchedules: vi.fn(async () => page([schedule])),
      listRuns,
    });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'View History for Morning brief' }));

    expect(await screen.findByText('Three priorities are ready.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load More Runs' }));
    expect(await screen.findByText('Provider request failed.')).toBeInTheDocument();
    expect(listRuns).toHaveBeenNthCalledWith(2, schedule.id, { limit: 20, offset: 20 });
  });

  it('preserves loaded history and retries a failed next page from the same offset', async () => {
    const nextRun = { ...successfulRun, id: 'run-2', result: { text: 'Second page output.' } };
    const listRuns = vi
      .fn<ScheduleApi['listRuns']>()
      .mockResolvedValueOnce(runsPage([successfulRun], true, 0))
      .mockRejectedValueOnce(new Error('History page is temporarily unavailable.'))
      .mockResolvedValueOnce(runsPage([nextRun], false, 20));
    const api = createApi({
      listSchedules: vi.fn(async () => page([schedule])),
      listRuns,
    });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'View History for Morning brief' }));
    await screen.findByText('Three priorities are ready.');

    await user.click(screen.getByRole('button', { name: 'Load More Runs' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'History page is temporarily unavailable.',
    );
    expect(screen.getByText('Three priorities are ready.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry Loading More Runs' }));
    expect(await screen.findByText('Second page output.')).toBeInTheDocument();
    expect(listRuns).toHaveBeenNthCalledWith(3, schedule.id, { limit: 20, offset: 20 });
  });

  it('requires destructive confirmation and removes a deleted schedule only after success', async () => {
    const request = deferred<void>();
    const deleteSchedule = vi.fn(() => request.promise);
    const api = createApi({
      listSchedules: vi.fn(async () => page([schedule])),
      deleteSchedule,
    });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'Delete Morning brief' }));

    const confirmation = screen.getByRole('alertdialog', { name: 'Delete Schedule?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Delete Schedule' }));
    expect(within(confirmation).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(
      screen.getByRole('heading', { name: 'Morning brief', hidden: true }),
    ).toBeInTheDocument();

    await act(async () => request.resolve());
    expect(await screen.findByText('No schedules yet')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Schedule action result' })).toHaveTextContent(
      'Schedule deleted.',
    );
  });

  it('disables unsupported and terminal actions while preserving history and deletion', async () => {
    const unsupported = { ...schedule, actionType: 'workflow' as const, name: 'Legacy workflow' };
    const completed = {
      ...schedule,
      id: 'schedule-2',
      name: 'Finished brief',
      status: 'completed' as const,
      isEnabled: false,
      nextExecutionAt: null,
    };
    const api = createApi({ listSchedules: vi.fn(async () => page([unsupported, completed])) });

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Legacy workflow' });

    expect(screen.getByText('Unsupported action type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Legacy workflow Now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Legacy workflow' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run Finished brief Now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Finished brief' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'View History for Finished brief' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Finished brief' })).toBeEnabled();
  });
});
