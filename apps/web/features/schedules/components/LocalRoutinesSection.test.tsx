import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalRoutineState } from '@agiworkforce/local-runtime-contract';
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
