import { beforeEach, describe, expect, it, vi } from 'vitest';

type ComputerUseServiceModule = typeof import('../runtime/computerUseService');
type ComputerUseSessionModule = typeof import('../runtime/computerUseSession');
type PermissionManagerModule = typeof import('../runtime/permissionManager');
type DevicePromptsModule = typeof import('../runtime/devicePrompts');
type NativeSurfaceModule = typeof import('../runtime/nativeSurface');

const mocks = vi.hoisted(() => ({
  front: { name: 'Notes', bundleId: 'com.apple.Notes', pid: 4001 } as {
    name: string;
    bundleId: string | null;
    pid: number | null;
  } | null,
  at: { name: 'Notes', bundleId: 'com.apple.Notes', pid: 4001 } as {
    name: string;
    bundleId: string | null;
    pid: number | null;
  } | null,
  states: new Map<string, string>(),
  whileAsking: null as (() => void) | null,
}));

vi.mock('electron', () => ({}));
vi.mock('../runtime/computerUseService', async (importOriginal) => ({
  ...(await importOriginal<ComputerUseServiceModule>()),
  ComputerUseRefused: class extends Error {
    readonly reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  },
  applicationInFront: vi.fn(async () => mocks.front),
  applicationAt: vi.fn(async () => mocks.at),
  readFrontWindow: vi.fn(async () => ({ front: null, secureInput: false })),
}));
vi.mock('../runtime/computerUseSession', async (importOriginal) => ({
  ...(await importOriginal<ComputerUseSessionModule>()),
  askUserDuringRun: vi.fn(async (_window: unknown, ask: () => Promise<unknown>) => ask()),
  computerUsePhase: vi.fn(() => 'active'),
  computerUseStatus: vi.fn(),
  confirmScreenStepStillWanted: vi.fn(async () => undefined),
  handBackComputerUse: vi.fn(),
  withoutInputWatch: vi.fn(async (action: () => Promise<unknown>) => action()),
}));
vi.mock('../runtime/permissionManager', async (importOriginal) => ({
  ...(await importOriginal<PermissionManagerModule>()),
  getPermissionState: vi.fn(
    (capability: string, scope: { target?: string }) =>
      mocks.states.get(`${capability}:${scope.target ?? ''}`) ?? 'prompt',
  ),
  requestPermission: vi.fn(
    async (_window: unknown, capability: string, scope: { target?: string }) => {
      mocks.whileAsking?.();
      mocks.states.set(`${capability}:${scope.target ?? ''}`, 'granted');
      return 'granted';
    },
  ),
  consumeSingleUse: vi.fn(),
}));
vi.mock('../runtime/devicePrompts', async (importOriginal) => ({
  ...(await importOriginal<DevicePromptsModule>()),
  showDevicePrompt: vi.fn(async () => {
    mocks.whileAsking?.();
    return { response: 1 };
  }),
}));
vi.mock('../runtime/nativeSurface', async (importOriginal) => ({
  ...(await importOriginal<NativeSurfaceModule>()),
  showNativeMessage: vi.fn(),
}));

const { runScreenAction } = await import('../runtime/computerUseSteps');

const NOTES = { name: 'Notes', bundleId: 'com.apple.Notes', pid: 4001 };
const MAIL = { name: 'Mail', bundleId: 'com.apple.mail', pid: 4002 };

beforeEach(() => {
  mocks.front = NOTES;
  mocks.at = NOTES;
  mocks.states = new Map();
  mocks.whileAsking = null;
});

describe('application approval at the input boundary', () => {
  it('types when the approved app is still the one in front', async () => {
    const action = vi.fn(async () => true);

    await runScreenAction(null, 'computer_type', { text: 'hello' }, action);

    expect(action).toHaveBeenCalledOnce();
  });

  it('refuses typing when another app takes focus while the app prompt is open', async () => {
    mocks.whileAsking = () => {
      mocks.front = MAIL;
    };
    const action = vi.fn(async () => true);

    await expect(runScreenAction(null, 'computer_type', { text: 'hello' }, action)).rejects.toThrow(
      /Mail is now where this step would land/,
    );
    expect(action).not.toHaveBeenCalled();
  });

  it('refuses a key press when focus moves during the step review', async () => {
    mocks.states.set('application.control:com.apple.Notes', 'granted');
    mocks.whileAsking = () => {
      mocks.front = MAIL;
    };
    const action = vi.fn(async () => true);

    await expect(
      runScreenAction(null, 'computer_key', { key: 'a', review: 'Press a' }, action),
    ).rejects.toThrow(/Mail is now where this step would land/);
    expect(action).not.toHaveBeenCalled();
  });

  it('refuses when the approval is withdrawn while the step review is open', async () => {
    mocks.states.set('application.control:com.apple.Notes', 'granted');
    mocks.whileAsking = () => {
      mocks.states.set('application.control:com.apple.Notes', 'denied');
    };
    const action = vi.fn(async () => true);

    await expect(
      runScreenAction(null, 'computer_type', { text: 'hi', review: 'Type hi' }, action),
    ).rejects.toThrow(/has not allowed AGI to control Notes/);
    expect(action).not.toHaveBeenCalled();
  });

  it('refuses a click when a different app now owns the point', async () => {
    mocks.states.set('application.control:com.apple.Notes', 'granted');
    mocks.whileAsking = () => {
      mocks.at = MAIL;
    };
    const action = vi.fn(async () => true);

    await expect(
      runScreenAction(null, 'computer_click', { x: 10, y: 10, review: 'Click' }, action),
    ).rejects.toThrow(/Mail is now where this step would land/);
    expect(action).not.toHaveBeenCalled();
  });

  it('does not read any app for a step that targets none', async () => {
    const service = await import('../runtime/computerUseService');
    vi.mocked(service.applicationInFront).mockClear();
    vi.mocked(service.applicationAt).mockClear();
    const action = vi.fn(async () => true);

    await runScreenAction(null, 'computer_move', { x: 1, y: 1 }, action);

    expect(action).toHaveBeenCalledOnce();
    expect(service.applicationInFront).not.toHaveBeenCalled();
    expect(service.applicationAt).not.toHaveBeenCalled();
  });
});
