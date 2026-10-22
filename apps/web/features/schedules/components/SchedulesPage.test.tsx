import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeSweepCadence, SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';
import { SchedulesPage as ProductionSchedulesPage } from './SchedulesPage';

vi.mock('@/features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    customNames: {},
    toolConnectorIds: {},
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));
import type { ScheduleApi } from '../services/schedule-api';
import type { ScheduleRun, ScheduleTask } from '../types';

function SchedulesPage(
  props: Omit<ComponentProps<typeof ProductionSchedulesPage>, 'subscriptionTier'> & {
    subscriptionTier?: ComponentProps<typeof ProductionSchedulesPage>['subscriptionTier'];
  },
) {
  return <ProductionSchedulesPage subscriptionTier="pro" {...props} />;
}

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
    resolveRunApproval: vi.fn(async () => successfulRun),
    listRecentRuns: vi.fn(async () => ({
      runs: [{ ...successfulRun, taskName: schedule.name }],
      nextCursor: null,
      hasMore: false,
    })),
    shareSchedule: vi.fn(async () => ({
      token: 'abcdefghijklmnopqrstuvwx',
      snapshot: {
        name: schedule.name,
        description: null,
        prompt: schedule.prompt ?? '',
        model: null,
        scheduleType: schedule.scheduleType,
        cronExpression: null,
        intervalMs: null,
        recurrenceRule: null,
        dayparts: null,
        metadata: null,
        missedExecutionPolicy: 'run_once' as const,
        retryMaxAttempts: 0,
        retryBackoffSeconds: 300,
      },
      createdAt: '2026-07-15T12:00:00.000Z',
    })),
    unshareSchedule: vi.fn(async () => undefined),
    getSharedSchedule: vi.fn(async () => {
      throw new Error('No shared schedule in this test');
    }),
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

  it('keeps the header to a heading, one sentence, and the create action', async () => {
    const api = createApi();
    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
    await screen.findByText('No schedules yet');

    expect(screen.getByRole('heading', { name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New task' })).toBeInTheDocument();
    expect(screen.queryByText('Managed Cloud')).not.toBeInTheDocument();
    expect(screen.queryByText('Text Output')).not.toBeInTheDocument();
    expect(screen.queryByText('Managed Models')).not.toBeInTheDocument();
    expect(screen.queryByText('No Chat Memory')).not.toBeInTheDocument();
    expect(screen.queryByText('No Tools')).not.toBeInTheDocument();
  });

  it('keeps Free-plan schedules readable without offering creation or mutation controls', async () => {
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule])) });
    render(<SchedulesPage api={api} subscriptionTier="free" onOpenChat={() => undefined} />);

    await screen.findByRole('heading', { name: schedule.name });
    expect(
      screen.getByText(/Scheduled tasks are available on Basic and higher plans/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upgrade plan' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More ways to create a task' })).toBeNull();
    expect(screen.getByRole('button', { name: `Edit ${schedule.name}` })).toBeDisabled();
    expect(screen.getByRole('switch', { name: `Pause ${schedule.name}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `View History for ${schedule.name}` })).toBeEnabled();
  });

  it('opens the run history of the schedule a notification link names', async () => {
    const other: ScheduleTask = { ...schedule, id: 'schedule-2', name: 'Evening wrap' };
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const api = createApi({ listSchedules: vi.fn(async () => page([other, schedule])) });

    render(<SchedulesPage api={api} onOpenChat={() => undefined} focusScheduleId={schedule.id} />);

    await waitFor(() => expect(api.listRuns).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.listRuns).mock.calls[0]?.[0]).toBe(schedule.id);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('opens a prefilled create dialog for a prompt handed over from a chat, and creates nothing yet', async () => {
    const api = createApi();
    const prompt = 'Summarise the overnight support tickets\nand list the three most urgent.';
    render(<SchedulesPage api={api} onOpenChat={() => undefined} draftPrompt={prompt} />);

    const dialog = await screen.findByRole('dialog', { name: 'Create Schedule' });
    expect(within(dialog).getByLabelText('Schedule Name')).toHaveValue(
      'Summarise the overnight support tickets',
    );
    expect(
      within(dialog).getByDisplayValue(prompt, { normalizer: (value) => value }),
    ).toBeInTheDocument();
    expect(api.createSchedule).not.toHaveBeenCalled();
  });

  it('opens a new schedule that runs as the agent named in the link', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(
      <SchedulesPage
        api={api}
        onOpenChat={() => undefined}
        agents={[{ id: '0190a000-0000-7000-8000-0000000000a1', name: 'Release notes writer' }]}
        draftAgentId="0190a000-0000-7000-8000-0000000000a1"
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Create Schedule' });
    expect(within(dialog).getByLabelText('Run as agent')).toHaveValue(
      '0190a000-0000-7000-8000-0000000000a1',
    );
    expect(within(dialog).getByLabelText('Schedule Name')).toHaveValue('Release notes writer');
    await user.type(within(dialog).getByLabelText('Task Instructions'), 'Draft the weekly notes.');
    fireEvent.change(within(dialog).getByLabelText('Run At'), {
      target: { value: '2099-07-16T09:00' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Create Schedule' }));
    await waitFor(() => expect(api.createSchedule).toHaveBeenCalled());
    expect(vi.mocked(api.createSchedule).mock.calls[0]?.[0]).toMatchObject({
      agentId: '0190a000-0000-7000-8000-0000000000a1',
    });
  });

  it('hides the agent choice from an account with no agents', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
    await screen.findByText('No schedules yet');
    await user.click(screen.getByRole('button', { name: 'Create Your First Schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Schedule' });
    expect(within(dialog).queryByLabelText('Run as agent')).toBeNull();
  });

  it('moves the Managed Cloud model constraint into the create dialog as helper text', async () => {
    const api = createApi();
    const user = userEvent.setup();
    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
    await screen.findByText('No schedules yet');

    await user.click(screen.getByRole('button', { name: 'Create Your First Schedule' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Schedule' });
    expect(
      within(dialog).getByText('Limited to the models Managed Cloud runs schedules on.'),
    ).toBeInTheDocument();
  });

  it('shows a real loading state, then an actionable empty state', async () => {
    const request = deferred<ReturnType<typeof page>>();
    const api = createApi({ listSchedules: vi.fn(() => request.promise) });

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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
    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        onOpenChat={() => undefined}
      />,
    );
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
    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        onOpenChat={() => undefined}
      />,
    );
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
    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        onOpenChat={() => undefined}
      />,
    );
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
    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        onOpenChat={() => undefined}
      />,
    );
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

    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        onOpenChat={() => undefined}
      />,
    );
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
    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        onOpenChat={() => undefined}
      />,
    );
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

  it('edits the selected routine notification policy from its own menu', async () => {
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule])) });
    const user = userEvent.setup();
    render(
      <SchedulesPage
        api={api}
        now={() => new Date('2026-07-15T12:00:00.000Z')}
        onOpenChat={() => undefined}
      />,
    );
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'More actions for Morning brief' }));
    await user.click(screen.getByRole('menuitem', { name: 'Notification settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Schedule' });
    await user.click(within(dialog).getByRole('switch', { name: 'When completed' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(api.updateSchedule).toHaveBeenCalledWith(
        'schedule-1',
        expect.objectContaining({
          notificationSettings: {
            onSuccess: false,
            onFailure: true,
            onApproval: true,
            push: true,
            email: true,
          },
        }),
      ),
    );
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
        onOpenChat={() => undefined}
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
    await user.click(screen.getByRole('button', { name: 'More actions for Updated brief' }));
    expect(screen.getByRole('menuitem', { name: 'Run now' })).toBeDisabled();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('switch', { name: 'Resume Updated brief' }));
    await user.click(screen.getByRole('button', { name: 'More actions for Updated brief' }));
    await user.click(screen.getByRole('menuitem', { name: 'Run now' }));

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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'More actions for Morning brief' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

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

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
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
    const user = userEvent.setup();

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
    await screen.findByRole('heading', { name: 'Legacy workflow' });

    const legacyCard = screen.getByRole('article', { name: 'Legacy workflow' });
    const finishedCard = screen.getByRole('article', { name: 'Finished brief' });

    expect(screen.getByText('Unsupported action type')).toBeInTheDocument();
    expect(within(legacyCard).getByRole('button', { name: 'Edit Legacy workflow' })).toBeDisabled();
    expect(
      within(finishedCard).getByRole('button', { name: 'Edit Finished brief' }),
    ).toBeDisabled();
    expect(
      within(finishedCard).getByRole('button', { name: 'View History for Finished brief' }),
    ).toBeEnabled();

    await user.click(
      within(legacyCard).getByRole('button', { name: 'More actions for Legacy workflow' }),
    );
    expect(within(legacyCard).getByRole('menuitem', { name: 'Run now' })).toBeDisabled();
    expect(
      within(legacyCard).getByRole('menuitem', { name: 'Notification settings' }),
    ).toBeDisabled();

    await user.click(
      within(finishedCard).getByRole('button', { name: 'More actions for Finished brief' }),
    );
    expect(within(finishedCard).getByRole('menuitem', { name: 'Run now' })).toBeDisabled();
    expect(within(finishedCard).getByRole('menuitem', { name: 'Delete' })).toBeEnabled();
  });

  it('shows which project a schedule belongs to and can filter the list by it', async () => {
    const scoped = { ...schedule, id: 'schedule-2', name: 'Launch brief', projectId: 'project-1' };
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule, scoped])) });
    const user = userEvent.setup();

    render(
      <SchedulesPage
        api={api}
        projects={[{ id: 'project-1', name: 'Marketing launch' }]}
        onOpenChat={() => undefined}
      />,
    );
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
        onOpenChat={() => undefined}
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

describe('SchedulesPage row menu and result panel (slice E item 6)', () => {
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

  it('lists Run now, Share, Pause, Notification settings, Delete in that order', async () => {
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule])) });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'More actions for Morning brief' }));

    const items = screen.getAllByRole('menuitem').map((el) => el.textContent?.trim());
    expect(items).toEqual(['Run now', 'Share', 'Pause', 'Notification settings', 'Delete']);
  });

  it('opens the result panel with the latest run and starts a chat about it', async () => {
    const listRuns = vi.fn(async () => runsPage([successfulRun]));
    const onOpenChat = vi.fn();
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule])), listRuns });
    const user = userEvent.setup();

    render(<SchedulesPage api={api} onOpenChat={onOpenChat} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'View latest result for Morning brief' }));

    expect(await screen.findByText('Three priorities are ready.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open chat' }));
    expect(onOpenChat).toHaveBeenCalledWith(schedule);
  });

  it('creates a share link and copies it when Share is chosen', async () => {
    const api = createApi({ listSchedules: vi.fn(async () => page([schedule])) });
    const user = userEvent.setup();
    // Defined after setup(): user-event installs its own clipboard stub on
    // navigator when it starts, which would otherwise shadow this one.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
    await screen.findByRole('heading', { name: 'Morning brief' });
    await user.click(screen.getByRole('button', { name: 'More actions for Morning brief' }));
    await user.click(screen.getByRole('menuitem', { name: 'Share' }));
    await user.click(await screen.findByRole('button', { name: 'Create link' }));
    await user.click(await screen.findByRole('button', { name: 'Copy link' }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('/share/schedules/abcdefghijklmnopqrstuvwx'),
      ),
    );
  });

  describe('header controls, search and templates', () => {
    const soonest: ScheduleTask = {
      ...schedule,
      id: 'schedule-soonest',
      name: 'Soonest brief',
      nextExecutionAt: '2026-07-15T09:00:00.000Z',
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    const newest: ScheduleTask = {
      ...schedule,
      id: 'schedule-newest',
      name: 'Newest digest',
      description: 'Competitor pricing watch',
      nextExecutionAt: '2026-07-20T09:00:00.000Z',
      createdAt: '2026-07-10T00:00:00.000Z',
    };
    const cardNames = new Set([soonest.name, newest.name]);

    afterEach(() => {
      vi.unstubAllGlobals();
    });
    const renderedOrder = () =>
      screen
        .getAllByRole('heading')
        .map((heading) => heading.textContent ?? '')
        .filter((name) => cardNames.has(name));

    function stubPointer(fine: boolean) {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          matches: fine && query === '(pointer: fine)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      );
    }

    it('sorts by next run by default and by creation date when chosen', async () => {
      const api = createApi({ listSchedules: vi.fn(async () => page([newest, soonest])) });
      const user = userEvent.setup();
      render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
      await screen.findByRole('heading', { name: soonest.name });

      expect(renderedOrder()).toEqual([soonest.name, newest.name]);
      const sort = screen.getByRole('button', { name: 'Sort by Next run' });
      expect(sort).toHaveTextContent('Sort byNext run');

      await user.click(sort);
      await user.click(await screen.findByRole('menuitemradio', { name: 'Recently created' }));

      expect(renderedOrder()).toEqual([newest.name, soonest.name]);
      expect(screen.getByRole('button', { name: 'Sort by Recently created' })).toBeInTheDocument();
    });

    it('offers create from scratch and from a template in the new task split menu', async () => {
      const api = createApi({ listSchedules: vi.fn(async () => page([schedule])) });
      const user = userEvent.setup();
      render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
      await screen.findByRole('heading', { name: schedule.name });

      const group = screen.getByRole('group', { name: 'Create a task' });
      await user.click(within(group).getByRole('button', { name: 'More ways to create a task' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Start from a template' }));

      const gallery = await screen.findByRole('region', { name: 'Start from a template' });
      const templates = within(gallery).getByRole('list', { name: 'Schedule templates' });
      await waitFor(() => expect(within(templates).getAllByRole('button')[0]).toHaveFocus());

      await user.click(within(gallery).getByRole('button', { name: 'Close templates' }));
      expect(screen.queryByRole('region', { name: 'Start from a template' })).toBeNull();

      await user.click(within(group).getByRole('button', { name: 'More ways to create a task' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Create from scratch' }));
      expect(await screen.findByRole('dialog', { name: 'Create Schedule' })).toBeInTheDocument();
    });

    it('opens the create dialog from the primary new task button', async () => {
      const api = createApi();
      const user = userEvent.setup();
      render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
      await screen.findByText('No schedules yet');

      await user.click(screen.getByRole('button', { name: 'New task' }));
      expect(await screen.findByRole('dialog', { name: 'Create Schedule' })).toBeInTheDocument();
      expect(api.createSchedule).not.toHaveBeenCalled();
    });

    it('focuses the search on a fine pointer and filters by name and description', async () => {
      stubPointer(true);
      const api = createApi({ listSchedules: vi.fn(async () => page([newest, soonest])) });
      const user = userEvent.setup();
      render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
      await screen.findByRole('heading', { name: soonest.name });

      const search = screen.getByRole('searchbox', { name: 'Search scheduled tasks' });
      expect(search).toHaveAttribute('placeholder', 'Search scheduled tasks...');
      expect(search).toHaveFocus();

      await user.type(search, 'competitor');
      expect(renderedOrder()).toEqual([newest.name]);

      await user.clear(search);
      await user.type(search, 'nothing like this');
      expect(renderedOrder()).toEqual([]);
      expect(screen.getByText(/No schedules matching "nothing like this"/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Show All Schedules' }));
      expect(search).toHaveValue('');
      expect(renderedOrder()).toEqual([soonest.name, newest.name]);
    });

    it('leaves focus alone on a touch screen and inside a project', async () => {
      stubPointer(false);
      const api = createApi();
      const { unmount } = render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
      const search = await screen.findByRole('searchbox', { name: 'Search scheduled tasks' });
      expect(search).not.toHaveFocus();
      unmount();

      stubPointer(true);
      render(
        <SchedulesPage
          api={api}
          onOpenChat={() => undefined}
          scope={{ projectId: 'project-1', projectName: 'Launch' }}
        />,
      );
      expect(
        await screen.findByRole('searchbox', { name: 'Search scheduled tasks' }),
      ).not.toHaveFocus();
    });

    it('lays the templates out in two columns in reading order', async () => {
      const api = createApi();
      const user = userEvent.setup();
      render(<SchedulesPage api={api} onOpenChat={() => undefined} />);
      await screen.findByText('No schedules yet');

      const templates = screen.getByRole('list', { name: 'Schedule templates' });
      expect(templates).toHaveClass('sm:grid-cols-2');
      expect(templates.className).not.toMatch(/grid-cols-3/);
      expect(
        within(templates)
          .getAllByRole('button')
          .map((button) => button.querySelector('span')?.textContent),
      ).toEqual([
        'Weekly review',
        'Meeting prep',
        'Inbox triage',
        'Content ideas',
        'Daily briefing',
        'Monitor a topic',
      ]);

      await user.click(screen.getByRole('button', { name: 'More ways to create a task' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Start from a template' }));
      await waitFor(() => expect(within(templates).getAllByRole('button')[0]).toHaveFocus());
    });
  });
});
