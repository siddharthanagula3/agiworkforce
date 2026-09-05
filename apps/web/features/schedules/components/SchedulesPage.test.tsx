import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeSweepCadence, SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';
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
    // On-demand, not a standing recurring automation, is the safer default
    // for a fresh dialog (sched-gap-17).
    expect(within(dialog).getByLabelText<HTMLSelectElement>('Frequency')).toHaveValue('once');
    await user.click(within(dialog).getByRole('button', { name: 'Create Schedule' }));

    expect(within(dialog).getByText('Enter a schedule name.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Enter instructions for the scheduled task.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Choose when this task should run.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Schedule Name')).toHaveFocus();
    expect(api.createSchedule).not.toHaveBeenCalled();
  });

  it('confirms discarding unsaved changes with the shared dialog, not a native window.confirm', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SchedulesPage api={api} now={() => new Date('2026-07-15T12:00:00.000Z')} />);
    await screen.findByText('No schedules yet');

    await user.click(screen.getByRole('button', { name: 'Create Your First Schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Schedule' });
    await user.type(within(dialog).getByLabelText('Schedule Name'), 'Draft brief');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    const confirmation = screen.getByRole('alertdialog', { name: 'Discard Unsaved Changes?' });
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1);

    await user.click(within(confirmation).getByRole('button', { name: 'Keep Editing' }));
    expect(screen.queryByRole('alertdialog', { name: 'Discard Unsaved Changes?' })).toBeNull();
    expect(
      within(screen.getByRole('dialog', { name: 'Create Schedule' })).getByLabelText(
        'Schedule Name',
      ),
    ).toHaveValue('Draft brief');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      within(screen.getByRole('alertdialog', { name: 'Discard Unsaved Changes?' })).getByRole(
        'button',
        { name: 'Discard Changes' },
      ),
    );
    expect(screen.queryByRole('dialog', { name: 'Create Schedule' })).toBeNull();
    expect(screen.queryByRole('alertdialog', { name: 'Discard Unsaved Changes?' })).toBeNull();
  });

  it('closes the editor without a confirmation when nothing changed', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SchedulesPage api={api} now={() => new Date('2026-07-15T12:00:00.000Z')} />);
    await screen.findByText('No schedules yet');

    await user.click(screen.getByRole('button', { name: 'Create Your First Schedule' }));
    screen.getByRole('dialog', { name: 'Create Schedule' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog', { name: 'Discard Unsaved Changes?' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Create Schedule' })).toBeNull();
  });

  it('offers only interval units the deployed sweep can deliver and names its real cadence', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SchedulesPage api={api} now={() => new Date('2026-07-15T12:00:00.000Z')} />);
    await screen.findByText('No schedules yet');

    await user.click(screen.getByRole('button', { name: 'Create Your First Schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Schedule' });
    await user.selectOptions(within(dialog).getByLabelText('Frequency'), 'interval');

    const unitSelect = within(dialog).getByLabelText<HTMLSelectElement>('Interval Unit');
    const offered = [...unitSelect.options].map((option) => option.value);
    // Derived from the sweep, not pinned to a literal list: the form used to
    // offer a list that disagrees with either the deployed cadence or the
    // default draft, which leaves the select showing a value it does not hold.
    expect(offered).toEqual(
      ['minutes', 'hours', 'days'].filter(
        (unit) =>
          ({ minutes: 60_000, hours: 60 * 60_000, days: 24 * 60 * 60_000 })[unit]! >=
          SWEEP_INTERVAL_MS,
      ),
    );
    expect(offered).toContain(unitSelect.value);
    expect(
      within(dialog).getByText(new RegExp(`swept ${describeSweepCadence().cadence}`)),
    ).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Frequency'), 'custom');
    expect(
      within(dialog).getByText(new RegExp(`swept ${describeSweepCadence().cadence}`)),
    ).toBeInTheDocument();
  });

  it('keeps an existing sub-daily interval editable without advertising it for new schedules', async () => {
    const legacySchedule: ScheduleTask = {
      ...schedule,
      name: 'Legacy hourly brief',
      scheduleType: 'interval',
      cronExpression: null,
      intervalMs: 60 * 60_000,
      metadata: { productRecurrence: 'interval' },
    };
    const updateSchedule = vi.fn<ScheduleApi['updateSchedule']>(async (_id, payload) => ({
      ...legacySchedule,
      name: payload.name,
    }));
    const api = createApi({
      listSchedules: vi.fn(async () => page([legacySchedule])),
      updateSchedule,
    });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} now={() => new Date('2026-07-15T12:00:00.000Z')} />);
    await screen.findByRole('heading', { name: 'Legacy hourly brief' });
    await user.click(screen.getByRole('button', { name: 'Edit Legacy hourly brief' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit Schedule' });
    const unitSelect = within(dialog).getByLabelText<HTMLSelectElement>('Interval Unit');
    expect(unitSelect).toHaveValue('hours');
    expect([...unitSelect.options].map((option) => option.value)).toEqual(['hours', 'days']);

    const name = within(dialog).getByLabelText('Schedule Name');
    await user.clear(name);
    await user.type(name, 'Renamed legacy brief');
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(updateSchedule).toHaveBeenCalledWith(
        legacySchedule.id,
        expect.objectContaining({
          name: 'Renamed legacy brief',
          recurrence: 'interval',
          intervalMs: 60 * 60_000,
        }),
      ),
    );
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
    // The dialog now defaults to on-demand ("One Time"; sched-gap-17), so a
    // fresh create requires an explicit Run At value.
    fireEvent.change(within(dialog).getByLabelText('Run At'), {
      target: { value: '2026-07-16T09:00' },
    });
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

  it('closes the run history panel non-destructively, leaving the schedule untouched', async () => {
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule])) });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Morning brief' });

    await user.click(screen.getByRole('button', { name: 'View History for Morning brief' }));
    expect(await screen.findByRole('heading', { name: 'Run History' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close Run History for Morning brief' }));
    expect(screen.queryByRole('heading', { name: 'Run History' })).not.toBeInTheDocument();
    // Closing is a view-only dismiss: the schedule itself, and any destructive
    // confirmation, are untouched (sched-gap-11).
    expect(screen.getByRole('heading', { name: 'Morning brief' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.deleteSchedule).not.toHaveBeenCalled();
  });

  it('flags a due schedule as running now the instant its live run is detected', async () => {
    const dueSchedule: ScheduleTask = {
      ...schedule,
      nextExecutionAt: new Date(Date.now() - 5_000).toISOString(),
    };
    const inFlightRun: ScheduleRun = {
      ...successfulRun,
      id: 'run-in-flight',
      status: 'running',
      completedAt: null,
      durationMs: null,
    };
    const listRuns = vi.fn<ScheduleApi['listRuns']>().mockResolvedValue(runsPage([inFlightRun]));
    const api = createApi({
      listSchedules: vi.fn(async () => page([dueSchedule])),
      listRuns,
    });

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Morning brief' });

    await waitFor(() =>
      expect(listRuns).toHaveBeenCalledWith(
        dueSchedule.id,
        expect.objectContaining({ limit: 1, offset: 0 }),
      ),
    );
    expect(await screen.findByText('Running now')).toBeInTheDocument();
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

  it('filters the schedule list by status without dropping the other rows from state', async () => {
    const active = { ...schedule, id: 'schedule-active', name: 'Active brief' };
    const completed = {
      ...schedule,
      id: 'schedule-completed',
      name: 'Finished brief',
      status: 'completed' as const,
      isEnabled: false,
      nextExecutionAt: null,
    };
    const api = createApi({ listSchedules: vi.fn(async () => page([active, completed])) });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} />);
    await screen.findByRole('heading', { name: 'Active brief' });
    expect(screen.getByRole('heading', { name: 'Finished brief' })).toBeInTheDocument();

    const filters = screen.getByRole('group', { name: 'Filter schedules by status' });
    expect(within(filters).getByRole('button', { name: 'All 2' })).toBeInTheDocument();
    // Zero-count statuses (paused, failed, expired) stay hidden from the tab row.
    expect(within(filters).queryByRole('button', { name: /Paused/ })).not.toBeInTheDocument();

    await user.click(within(filters).getByRole('button', { name: 'Completed 1' }));
    expect(screen.getByRole('heading', { name: 'Finished brief' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Active brief' })).not.toBeInTheDocument();

    await user.click(within(filters).getByRole('button', { name: 'All 2' }));
    expect(screen.getByRole('heading', { name: 'Active brief' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Finished brief' })).toBeInTheDocument();
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

  it('shows which project a schedule belongs to and can filter the list by it', async () => {
    const scoped = { ...schedule, id: 'schedule-2', name: 'Launch brief', projectId: 'project-1' };
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule, scoped])) });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} projects={[{ id: 'project-1', name: 'Marketing launch' }]} />);
    await screen.findByRole('heading', { name: 'Launch brief' });

    const card = screen.getByRole('article', { name: 'Launch brief' });
    expect(within(card).getByText('Marketing launch')).toBeInTheDocument();

    const filters = screen.getByRole('group', { name: 'Filter schedules by project' });
    await user.click(within(filters).getByRole('button', { name: 'Marketing launch' }));

    expect(screen.getByRole('heading', { name: 'Launch brief' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: schedule.name })).not.toBeInTheDocument();

    await user.click(within(filters).getByRole('button', { name: 'All Projects' }));
    expect(screen.getByRole('heading', { name: schedule.name })).toBeInTheDocument();
  });

  it('scopes the list request and locks a new task to the current project', async () => {
    const listSchedules = vi.fn(async () => page());
    const createSchedule = vi.fn<ScheduleApi['createSchedule']>(async (input) => ({
      ...schedule,
      id: 'schedule-3',
      name: input.name,
      projectId: input.projectId ?? null,
    }));
    const api = createApi({ listSchedules, createSchedule });
    const user = userEvent.setup();

    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        scope={{ projectId: 'project-1', projectName: 'Marketing launch' }}
      />,
    );

    expect(await screen.findByText(/No scheduled tasks in this project yet/)).toBeInTheDocument();
    expect(listSchedules).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1' }));

    await user.click(screen.getByRole('button', { name: 'New task in this project' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Schedule' });
    await user.type(within(dialog).getByLabelText('Schedule Name'), 'Weekly digest');
    await user.type(within(dialog).getByLabelText('Task Instructions'), 'Summarize this project.');
    fireEvent.change(within(dialog).getByLabelText('Run At'), {
      target: { value: '2026-07-16T09:00' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Create Schedule' }));

    await waitFor(() => expect(createSchedule).toHaveBeenCalledTimes(1));
    expect(createSchedule.mock.calls[0]?.[0]).toMatchObject({ projectId: 'project-1' });
  });
});
