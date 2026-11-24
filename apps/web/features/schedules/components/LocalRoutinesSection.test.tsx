import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalRoutine, LocalRoutineState } from '@agiworkforce/local-runtime-contract';
type LocalRuntimeModule = typeof import('@agiworkforce/local-runtime-contract');
const mocks = vi.hoisted(() => ({
  available: true,
  invoke: vi.fn(),
  models: vi.fn(),
  allowed: vi.fn(),
}));
vi.mock('@agiworkforce/local-runtime-contract', async (original) => ({
  ...(await original<LocalRuntimeModule>()),
  getHostBridge: () => (mocks.available ? { invokeRuntime: mocks.invoke } : null),
}));
vi.mock('@/features/desktop-host', () => ({
  listWorkspaceRoots: async () => [{ id: 'root', name: 'Owned folder' }],
  listDeveloperModels: mocks.models,
  allowDeveloperSessions: mocks.allowed,
  onWorkspaceChanged: () => () => undefined,
  pickWorkspaceRoot: vi.fn(),
}));
import { LocalRoutinesSection } from './LocalRoutinesSection';
const empty: LocalRoutineState = {
  deviceId: 'device',
  suspended: false,
  error: null,
  routines: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.available = true;
  mocks.models.mockResolvedValue({
    models: [{ id: 'fixture-model', provider: 'fixture', local: false }],
    defaultModelId: 'fixture-model',
  });
  mocks.allowed.mockResolvedValue(true);
  mocks.invoke.mockImplementation(async (command: string) => ({
    ok: true,
    value: command === 'local_routine_list' ? empty : {},
  }));
});

describe('mounted local routine controls', () => {
  it('shows a paused recurring schedule and preserves its completed run when resuming', async () => {
    const user = userEvent.setup();
    const nextRun = '2032-01-15T03:45:00.000Z';
    const routine: LocalRoutine = {
      id: 'routine',
      deviceId: 'device',
      creationDigest: 'digest',
      rootIdentity: 'identity',
      grantRevision: 'revision',
      name: 'Daily project check',
      rootId: 'root',
      model: 'fixture-model',
      prompt: 'Inspect this project',
      schedule: { type: 'cron', cron: '15 9 * * *', enabled: true, timezone: 'Asia/Kolkata' },
      missedExecutionPolicy: 'run_once',
      keepAwake: false,
      notificationSettings: {
        onSuccess: false,
        onFailure: true,
        onApproval: true,
        push: false,
        email: false,
      },
      executionCount: 1,
      nextExecutionAt: nextRun,
      pausedReason: null,
      createdAt: '2032-01-14T03:40:00.000Z',
      updatedAt: '2032-01-14T03:46:00.000Z',
      runs: [
        {
          id: 'run',
          state: 'completed',
          dueAt: '2032-01-14T03:45:00.000Z',
          startedAt: '2032-01-14T03:45:00.000Z',
          threadId: 'thread',
        },
      ],
    };
    mocks.invoke.mockImplementation(async (command: string, args: { enabled: boolean }) => {
      if (command === 'local_routine_set_enabled') routine.schedule.enabled = args.enabled;
      return {
        ok: true,
        value: { ...empty, routines: [{ ...routine, schedule: { ...routine.schedule } }] },
      };
    });
    render(<LocalRoutinesSection />);

    await user.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(await screen.findByText('Paused', { exact: true })).toBeVisible();
    expect(screen.getByText('Last run: completed', { exact: true })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open run' })).toHaveAttribute(
      'href',
      '/code?local=root&thread=thread',
    );
    expect(screen.queryByText(/Asia\/Kolkata/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(await screen.findByText(/Asia\/Kolkata/)).toHaveAttribute('datetime', nextRun);
    expect(screen.getByRole('link', { name: 'Open run' })).toBeVisible();
    expect(mocks.invoke).toHaveBeenCalledWith('local_routine_set_enabled', {
      id: routine.id,
      enabled: true,
    });
  });

  it('offers local routines only with a host bridge', async () => {
    mocks.available = false;
    render(<LocalRoutinesSection />);
    expect(screen.queryByRole('region', { name: 'Local routines' })).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('creates via the native host with scoped scheduling and notification consent', async () => {
    const user = userEvent.setup();
    render(<LocalRoutinesSection />);
    await user.click(await screen.findByRole('button', { name: 'New local routine' }));
    await screen.findByRole('option', { name: 'fixture-model' });
    await user.type(screen.getByLabelText('Name'), 'Owned daily check');
    await user.type(screen.getByLabelText('Instructions'), 'Inspect this project');
    await user.click(screen.getByLabelText('Keep this computer awake while running'));
    await user.click(screen.getByLabelText('Notify on success'));
    await user.click(screen.getByRole('button', { name: 'Allow and create routine' }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'local_routine_create',
        expect.objectContaining({
          rootId: 'root',
          model: 'fixture-model',
          keepAwake: true,
          missedExecutionPolicy: 'run_once',
          schedule: expect.objectContaining({ type: 'interval', intervalMs: 3_600_000 }),
          notificationSettings: {
            onSuccess: false,
            onFailure: true,
            onApproval: true,
            push: true,
            email: false,
          },
          requestId: expect.any(String),
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('saves a one-time routine at the wall-clock time in the selected time zone', async () => {
    const user = userEvent.setup();
    render(<LocalRoutinesSection />);
    await user.click(await screen.findByRole('button', { name: 'New local routine' }));
    await screen.findByRole('option', { name: 'fixture-model' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Timed check' } });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Inspect this project' },
    });
    await user.selectOptions(screen.getByLabelText('Repeat'), 'once');
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Kolkata' } });
    fireEvent.change(screen.getByLabelText('Run at'), { target: { value: '2032-01-14T09:15' } });
    await user.click(screen.getByRole('button', { name: 'Allow and create routine' }));

    expect(mocks.invoke).toHaveBeenCalledWith(
      'local_routine_create',
      expect.objectContaining({
        schedule: {
          type: 'once',
          enabled: true,
          timezone: 'Asia/Kolkata',
          executeAt: '2032-01-14T03:45:00.000Z',
        },
      }),
    );
  });

  it.each([
    ['daily', '5 17 * * *'],
    ['weekly', '5 17 * * 1,4'],
    ['monthly', '5 17 31 * *'],
  ])('creates a %s routine from the visible schedule controls', async (cadence, cron) => {
    const user = userEvent.setup();
    render(<LocalRoutinesSection />);
    await user.click(await screen.findByRole('button', { name: 'New local routine' }));
    await screen.findByRole('option', { name: 'fixture-model' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Recurring check' } });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Inspect this project' },
    });
    await user.selectOptions(screen.getByLabelText('Repeat'), cadence);
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Kolkata' } });
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: '17:05' } });
    expect(screen.queryByLabelText('Cron expression')).not.toBeInTheDocument();

    const create = screen.getByRole('button', { name: 'Allow and create routine' });
    if (cadence === 'weekly') {
      expect(create).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Thursday' }));
      await user.click(screen.getByRole('button', { name: 'Monday' }));
    }
    if (cadence === 'monthly') {
      fireEvent.change(screen.getByLabelText('Day of month'), { target: { value: '31' } });
      expect(screen.getByText('Runs only in months with this day.')).toBeVisible();
    }
    await user.click(create);

    expect(mocks.invoke).toHaveBeenCalledWith(
      'local_routine_create',
      expect.objectContaining({
        schedule: { type: 'cron', enabled: true, timezone: 'Asia/Kolkata', cron },
      }),
    );
  });

  it.each([
    ['2027-03-14T02:30', 'does not exist'],
    ['2027-11-07T01:30', 'occurs twice'],
  ])(
    'leaves a one-time draft open when %s is ambiguous or missing in its time zone',
    async (time, message) => {
      const user = userEvent.setup();
      render(<LocalRoutinesSection />);
      await user.click(await screen.findByRole('button', { name: 'New local routine' }));
      await screen.findByRole('option', { name: 'fixture-model' });
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Timed check' } });
      fireEvent.change(screen.getByLabelText('Instructions'), {
        target: { value: 'Inspect this project' },
      });
      await user.selectOptions(screen.getByLabelText('Repeat'), 'once');
      fireEvent.change(screen.getByLabelText('Time zone'), {
        target: { value: 'America/New_York' },
      });
      fireEvent.change(screen.getByLabelText('Run at'), { target: { value: time } });
      await user.click(screen.getByRole('button', { name: 'Allow and create routine' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByLabelText('Run at')).toHaveValue(time);
      expect(mocks.invoke).not.toHaveBeenCalledWith('local_routine_create', expect.anything());
    },
  );

  it('shows creation failure in the dialog and reuses its identity on an unchanged retry', async () => {
    const user = userEvent.setup();
    const requests: Record<string, unknown>[] = [];
    mocks.invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command === 'local_routine_create') {
        requests.push(args);
        return requests.length === 1
          ? { ok: false, error: { code: 'io-error', message: 'The response did not arrive.' } }
          : { ok: true, value: {} };
      }
      return { ok: true, value: empty };
    });
    render(<LocalRoutinesSection />);
    await user.click(await screen.findByRole('button', { name: 'New local routine' }));
    await screen.findByRole('option', { name: 'fixture-model' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Owned check' } });
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Inspect owned project' },
    });
    await user.click(screen.getByRole('button', { name: 'Allow and create routine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The response did not arrive.');
    await user.click(screen.getByRole('button', { name: 'Allow and create routine' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]!['requestId']).toBe(requests[1]!['requestId']);
  });

  it('can request the existing folder grant before loading models', async () => {
    mocks.models.mockRejectedValueOnce(new Error('Allow this folder first.'));
    const user = userEvent.setup();
    render(<LocalRoutinesSection />);
    await user.click(await screen.findByRole('button', { name: 'New local routine' }));
    await user.click(await screen.findByRole('button', { name: 'Allow agent and load models' }));
    expect(mocks.allowed).toHaveBeenCalledWith('root');
    await screen.findByRole('option', { name: 'fixture-model' });
  });
});
