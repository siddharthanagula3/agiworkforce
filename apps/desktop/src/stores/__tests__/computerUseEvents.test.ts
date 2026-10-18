import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMock = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  invoke: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: tauriMock.invoke,
  isTauri: false,
  isTauriContext: () => false,
  listen: (event: string, handler: (payload: { payload: unknown }) => void) => {
    tauriMock.handlers.set(event, handler);
    return Promise.resolve(() => tauriMock.handlers.delete(event));
  },
}));

const toastMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  }),
);
vi.mock('sonner', () => ({ toast: toastMock }));

import {
  parseCompletedAction,
  STOP_AGENTS_SHORTCUT_ACTION,
  subscribeToComputerUseEvents,
  useComputerUseStore,
} from '../computerUseStore';

type TauriMockModule = typeof import('../../lib/tauri-mock');

function emit(event: string, payload: unknown): void {
  const handler = tauriMock.handlers.get(event);
  if (!handler) throw new Error(`nothing subscribed to ${event}`);
  handler({ payload });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('computer-use event subscription', () => {
  let unsubscribe: () => void;

  beforeAll(() => {
    unsubscribe = subscribeToComputerUseEvents();
  });

  afterAll(() => unsubscribe());

  beforeEach(() => {
    vi.clearAllMocks();
    tauriMock.invoke.mockImplementation((command: string) => {
      if (command === 'computer_use_take_over') {
        return Promise.resolve({ taken_over: true, epoch: 1 });
      }
      if (command === 'computer_use_hand_back') {
        return Promise.resolve({ taken_over: false, epoch: 2 });
      }
      if (command === 'computer_use_cancel_opa_task') return Promise.resolve(true);
      return Promise.resolve(null);
    });
    useComputerUseStore.getState().reset();
    useComputerUseStore.setState({ takenOver: false });
  });

  it('logs a step the native loop completed, with where it clicked', () => {
    emit('computer_use:action_completed', {
      event: 'action_completed',
      session_id: 'session-1',
      action: { action: 'click', x: 120, y: 48, button: 'left' },
      success: true,
      duration_ms: 31,
    });

    const [logged] = useComputerUseStore.getState().actionLog;
    expect(logged?.action_type).toBe('click');
    expect(logged?.coordinates).toEqual([120, 48]);
  });

  it('logs a step the vendor agent reports by name only', () => {
    emit('computer_use:action_completed', { action: 'screenshot', success: true });

    const [logged] = useComputerUseStore.getState().actionLog;
    expect(logged?.action_type).toBe('screenshot');
    expect(logged?.coordinates).toBeNull();
  });

  it('does not log a step the screen view cannot draw', () => {
    emit('computer_use:action_completed', {
      action: { action: 'launch_application', name: 'Notes' },
    });
    emit('computer_use:action_completed', null);

    expect(useComputerUseStore.getState().actionLog).toEqual([]);
  });

  it('reads typed text and hotkeys from the step', () => {
    expect(parseCompletedAction({ action: { action: 'type', text: 'hello' } })?.text).toBe('hello');
    expect(
      parseCompletedAction({ action: { action: 'hotkey', modifiers: ['cmd'], key: 's' } }),
    ).toMatchObject({ action_type: 'key_press', key: 's' });
  });

  it('takes the screen back on the stop shortcut and offers to hand it back', async () => {
    emit('shortcut_action', STOP_AGENTS_SHORTCUT_ACTION);
    await settle();

    expect(tauriMock.invoke).toHaveBeenCalledWith('computer_use_take_over');
    expect(useComputerUseStore.getState().takenOver).toBe(true);
    expect(toastMock).toHaveBeenCalledWith(
      'Screen control is yours',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Hand back' }),
      }),
    );

    const options = toastMock.mock.calls[0]?.[1] as { action: { onClick: () => void } };
    options.action.onClick();
    await settle();
    expect(tauriMock.invoke).toHaveBeenCalledWith('computer_use_hand_back');
    expect(useComputerUseStore.getState().takenOver).toBe(false);
  });

  it('ignores every other shortcut', async () => {
    emit('shortcut_action', 'new_composer');
    await settle();

    expect(tauriMock.invoke).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});
