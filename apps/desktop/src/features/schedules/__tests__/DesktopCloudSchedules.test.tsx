import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAutoRoutingProfiles,
  getModelsForTierAndSurface,
  getPlanMaxScheduledTasks,
} from '@agiworkforce/types';
import type {
  ManagedCloudScheduleRun,
  ManagedCloudScheduleTask,
} from '@agiworkforce/cloud-contracts';
import type { CloudModelInfo } from '../../../api/cloudApi';
import type { DesktopCloudSchedulesApi } from '../../../services/desktopCloudSchedules';
import type { DesktopCloudScheduleModelsLoader } from '../DesktopCloudSchedules';

const auth = vi.hoisted(() => ({
  signedIn: true,
  accountId: 'account-a' as string | null,
  sessionEpoch: 1,
  plan: 'basic' as string | null,
}));

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: () => auth.signedIn,
  useAuthStore: (
    selector: (state: {
      user: { id: string } | null;
      cloudSessionEpoch: number;
      plan: string | null;
    }) => unknown,
  ) =>
    selector({
      user: auth.accountId ? { id: auth.accountId } : null,
      cloudSessionEpoch: auth.sessionEpoch,
      plan: auth.plan,
    }),
}));

const MODEL_TYPES = ['chat', 'code', 'reasoning', 'multimodal', 'search'] as const;

function discoveredModelsFor(plan: 'free' | 'basic' | 'pro'): CloudModelInfo[] {
  return getModelsForTierAndSurface(plan, 'desktop/cloud-chat', {
    modelTypes: [...MODEL_TYPES],
  }).map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
  }));
}

const BASIC_MODELS = discoveredModelsFor('basic');
const PRO_MODELS = discoveredModelsFor('pro');

function scheduleFor(
  id = 'schedule-1',
  name = 'Morning brief',
  model = BASIC_MODELS[0]!.id,
): ManagedCloudScheduleTask {
  return {
    id,
    userId: 'user-1',
    name,
    description: 'Daily priorities',
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    executeAt: null,
    intervalMs: null,
    timezone: 'America/Chicago',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 3,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Summarize my priorities.',
    model,
    status: 'active',
    lastExecutedAt: null,
    nextExecutionAt: '2026-08-01T14:00:00.000Z',
    lastError: null,
    metadata: { productRecurrence: 'daily', timeOfDay: '09:00' },
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-29T12:00:00.000Z',
  };
}

const schedule = scheduleFor();

const run: ManagedCloudScheduleRun = {
  id: 'run-1',
  taskId: schedule.id,
  status: 'success',
  triggerSource: 'manual',
  scheduledFor: null,
  startedAt: '2026-08-01T14:00:00.000Z',
  completedAt: '2026-08-01T14:00:01.000Z',
  durationMs: 1_000,
  result: { text: 'The brief is ready.' },
  error: null,
  idempotencyKey: 'manual-run-key',
  leaseExpiresAt: null,
  attemptCount: 1,
};

function schedulePage(schedules: ManagedCloudScheduleTask[] = []) {
  return {
    schedules,
    pagination: { limit: 50, offset: 0 },
    hasMore: false,
  };
}

function runsPage(runs: ManagedCloudScheduleRun[] = []) {
  return {
    runs,
    pagination: { limit: 20, offset: 0 },
    hasMore: false,
  };
}

function makeApi(overrides: Partial<DesktopCloudSchedulesApi> = {}): DesktopCloudSchedulesApi {
  return {
    listSchedules: vi.fn(async () => schedulePage([schedule])),
    getSchedule: vi.fn(async () => schedule),
    createSchedule: vi.fn(async () => schedule),
    updateSchedule: vi.fn(async () => schedule),
    setScheduleEnabled: vi.fn(async (_id, enabled) => ({
      ...schedule,
      isEnabled: enabled,
    })),
    deleteSchedule: vi.fn(async () => undefined),
    listRuns: vi.fn(async () => runsPage()),
    runNow: vi.fn(async () => ({ run, replay: false })),
    ...overrides,
  };
}

function loadModels(models = BASIC_MODELS): DesktopCloudScheduleModelsLoader {
  return vi.fn(async () => models);
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

const { DesktopCloudSchedules } = await import('../DesktopCloudSchedules');

describe('DesktopCloudSchedules', () => {
  beforeEach(() => {
    auth.signedIn = true;
    auth.accountId = 'account-a';
    auth.sessionEpoch = 1;
    auth.plan = 'basic';
  });

  it('keeps the Cloud surface honest while signed out', () => {
    auth.signedIn = false;
    auth.accountId = null;
    const api = makeApi();
    const models = loadModels();
    render(<DesktopCloudSchedules api={api} loadModels={models} />);

    expect(screen.getByText(/Sign in to manage Cloud schedules/i)).toBeTruthy();
    expect(screen.queryByText('Morning brief')).toBeNull();
    expect(api.listSchedules).not.toHaveBeenCalled();
    expect(models).not.toHaveBeenCalled();
  });

  it('lists account schedules and toggles them through the Cloud adapter', async () => {
    const api = makeApi();
    render(<DesktopCloudSchedules api={api} loadModels={loadModels()} />);

    expect(await screen.findByText('Morning brief')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => {
      expect(api.setScheduleEnabled).toHaveBeenCalledWith(
        'schedule-1',
        false,
        expect.any(AbortSignal),
      );
    });
    expect(await screen.findByText('Paused')).toBeTruthy();
  });

  it('loads run history instead of presenting a decorative History control', async () => {
    const api = makeApi();
    render(<DesktopCloudSchedules api={api} loadModels={loadModels()} />);

    await screen.findByText('Morning brief');
    fireEvent.click(screen.getByRole('button', { name: /History/i }));

    await waitFor(() => {
      expect(api.listRuns).toHaveBeenCalledWith('schedule-1', {
        limit: 20,
        offset: 0,
        signal: expect.any(AbortSignal),
      });
    });
    expect(await screen.findByText(/has not run yet/i)).toBeTruthy();
  });

  it('keeps Free and unknown-plan scheduling disabled while retaining safe cleanup controls', async () => {
    auth.plan = 'free';
    const freeApi = makeApi();
    const rendered = render(
      <DesktopCloudSchedules api={freeApi} loadModels={loadModels(discoveredModelsFor('free'))} />,
    );

    await screen.findByText('Morning brief');
    expect(screen.getByText(/Free does not include unattended scheduled runs/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create schedule' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Morning brief' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete Morning brief' })).toBeEnabled();
    expect(freeApi.runNow).not.toHaveBeenCalled();

    auth.plan = null;
    rendered.rerender(
      <DesktopCloudSchedules api={freeApi} loadModels={loadModels(discoveredModelsFor('free'))} />,
    );

    expect(screen.getByText(/plan is still loading or could not be confirmed/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create schedule' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run now' })).toBeDisabled();
  });

  it('enforces the canonical Basic schedule ceiling before opening the editor', async () => {
    const limit = getPlanMaxScheduledTasks('basic');
    expect(limit).not.toBeNull();
    const schedules = Array.from({ length: limit ?? 0 }, (_, index) =>
      scheduleFor(`schedule-${index}`, `Brief ${index + 1}`),
    );
    const api = makeApi({ listSchedules: vi.fn(async () => schedulePage(schedules)) });
    render(<DesktopCloudSchedules api={api} loadModels={loadModels()} />);

    expect(await screen.findByText(`${limit} of ${limit} schedule slots used`)).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create schedule' });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(screen.queryByRole('dialog', { name: 'Create schedule' })).toBeNull();
    expect(api.createSchedule).not.toHaveBeenCalled();
  });

  it('uses only live, tier-admitted models for a paid plan and adds canonical Auto', async () => {
    auth.plan = 'pro';
    const liveModel = PRO_MODELS[0]!;
    const undiscoveredModel = PRO_MODELS.find((model) => model.id !== liveModel.id)!;
    const api = makeApi({ listSchedules: vi.fn(async () => schedulePage()) });
    render(<DesktopCloudSchedules api={api} loadModels={loadModels([liveModel])} />);

    const create = await screen.findByRole('button', { name: 'Create schedule' });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    const dialog = screen.getByRole('dialog', { name: 'Create schedule' });
    const modelSelect = within(dialog).getByLabelText('Model');
    const auto = getAutoRoutingProfiles()[0]!;
    expect(within(modelSelect).getByRole('option', { name: auto.label })).toHaveValue(auto.id);
    expect(within(modelSelect).getByRole('option', { name: liveModel.name })).toHaveValue(
      liveModel.id,
    );
    expect(within(modelSelect).queryByRole('option', { name: undiscoveredModel.name })).toBeNull();
  });

  it('renders model catalog error and empty states, keeps creation closed, and retries', async () => {
    auth.plan = 'pro';
    const liveModel = PRO_MODELS[0]!;
    const models = vi
      .fn<DesktopCloudScheduleModelsLoader>()
      .mockRejectedValueOnce(new Error('Catalog is offline.'))
      .mockResolvedValueOnce([liveModel]);
    const api = makeApi({ listSchedules: vi.fn(async () => schedulePage()) });
    const rendered = render(<DesktopCloudSchedules api={api} loadModels={models} />);

    expect(await screen.findByText('Catalog is offline.')).toBeTruthy();
    expect(
      screen
        .getAllByRole('button', { name: 'Create schedule' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry models' }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: 'Create schedule' })
          .every((button) => !(button as HTMLButtonElement).disabled),
      ).toBe(true),
    );

    const emptyModels = loadModels([]);
    auth.sessionEpoch += 1;
    rendered.rerender(<DesktopCloudSchedules api={api} loadModels={emptyModels} />);
    expect(
      await screen.findByText(
        /No schedule-compatible Managed Cloud models are currently available/i,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole('button', { name: 'Create schedule' })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Retry models' })).toBeEnabled();
  });

  it('remounts on account and epoch changes, clearing draft/history/action state and aborting A work', async () => {
    auth.plan = 'pro';
    const accountASchedule = scheduleFor('schedule-a', 'Account A brief', PRO_MODELS[0]!.id);
    const accountBSchedule = scheduleFor('schedule-b', 'Account B brief', PRO_MODELS[0]!.id);
    const historyRequest = deferred<ReturnType<typeof runsPage>>();
    const runRequest = deferred<{ run: ManagedCloudScheduleRun; replay: boolean }>();
    let historySignal: AbortSignal | undefined;
    let runSignal: AbortSignal | undefined;
    const api = makeApi({
      listSchedules: vi.fn(async () =>
        schedulePage([auth.accountId === 'account-a' ? accountASchedule : accountBSchedule]),
      ),
      listRuns: vi.fn((_id, input) => {
        historySignal = input.signal;
        return historyRequest.promise;
      }),
      runNow: vi.fn((_id, _key, signal) => {
        runSignal = signal;
        return runRequest.promise;
      }),
    });
    const models = loadModels([PRO_MODELS[0]!]);
    const rendered = render(<DesktopCloudSchedules api={api} loadModels={models} />);

    await screen.findByText('Account A brief');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create schedule' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Account A draft' } });
    fireEvent.click(screen.getByRole('button', { name: /History/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(api.runNow).toHaveBeenCalled());

    auth.accountId = 'account-b';
    auth.sessionEpoch = 2;
    rendered.rerender(<DesktopCloudSchedules api={api} loadModels={models} />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Account A brief')).toBeNull();
    expect(historySignal?.aborted).toBe(true);
    expect(runSignal?.aborted).toBe(true);
    expect(await screen.findByText('Account B brief')).toBeTruthy();

    await act(async () => {
      historyRequest.resolve(runsPage([run]));
      runRequest.resolve({ run, replay: false });
      await Promise.resolve();
    });

    expect(screen.queryByText('Account A brief')).toBeNull();
    expect(screen.queryByText('Account A draft')).toBeNull();
    expect(screen.getByText('Account B brief')).toBeTruthy();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });

  it('ignores a deferred account A list after account B takes ownership', async () => {
    auth.plan = 'pro';
    const accountARequest = deferred<ReturnType<typeof schedulePage>>();
    const accountASchedule = scheduleFor('schedule-a', 'Late account A brief', PRO_MODELS[0]!.id);
    const accountBSchedule = scheduleFor(
      'schedule-b',
      'Current account B brief',
      PRO_MODELS[0]!.id,
    );
    let accountASignal: AbortSignal | undefined;
    const api = makeApi({
      listSchedules: vi.fn((input) => {
        if (auth.accountId === 'account-a') {
          accountASignal = input.signal;
          return accountARequest.promise;
        }
        return Promise.resolve(schedulePage([accountBSchedule]));
      }),
    });
    const rendered = render(
      <DesktopCloudSchedules api={api} loadModels={loadModels([PRO_MODELS[0]!])} />,
    );

    auth.accountId = 'account-b';
    auth.sessionEpoch = 2;
    rendered.rerender(
      <DesktopCloudSchedules api={api} loadModels={loadModels([PRO_MODELS[0]!])} />,
    );

    expect(accountASignal?.aborted).toBe(true);
    expect(await screen.findByText('Current account B brief')).toBeTruthy();

    await act(async () => {
      accountARequest.resolve(schedulePage([accountASchedule]));
      await Promise.resolve();
    });

    expect(screen.queryByText('Late account A brief')).toBeNull();
    expect(screen.getByText('Current account B brief')).toBeTruthy();
  });
});
