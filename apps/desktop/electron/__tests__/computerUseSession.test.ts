import { beforeEach, describe, expect, it, vi } from 'vitest';

const withdrawGrant = vi.fn();
const revokePermission = vi.fn();
const stopComputerUseHelper = vi.fn();

vi.mock('electron', () => ({
  Notification: { isSupported: () => false },
  app: { focus: vi.fn(), hide: vi.fn() },
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
  powerMonitor: { getSystemIdleTime: vi.fn(() => 0) },
  screen: { getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })) },
}));
vi.mock('../settingsStore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPreferences: () => ({ computerUseEnabled: true }),
  saveSettings: vi.fn(),
}));
vi.mock('../runtime/computerUseService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  computerUseSupport: () => ({ supported: true }),
  forgetLastFrame: vi.fn(),
  stopComputerUseHelper,
}));
vi.mock('../runtime/desktopTelemetryService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recordDesktopEvent: vi.fn(),
}));
vi.mock('../runtime/permissionManager', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPermissionState: vi.fn(() => 'denied'),
  revokePermission,
  withdrawGrant,
}));
vi.mock('../runtime/systemPermissions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listForAccessibility: vi.fn(),
  systemPermissionStatus: vi.fn(() => 'granted'),
}));

const { configureComputerUse, stopComputerUse } = await import('../runtime/computerUseSession');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('stopping computer use', () => {
  it('withdraws the grant so the next step cannot simply restart it', () => {
    stopComputerUse();

    expect(withdrawGrant).toHaveBeenCalledWith('computer.use', { kind: 'global' });
    expect(stopComputerUseHelper).toHaveBeenCalledOnce();
  });

  // A refusal is the user's answer. Stopping takes access away; clearing a no
  // would let whatever asked raise the same prompt until it was allowed.
  it('never clears a refusal, so stopping cannot bring the prompt back', () => {
    const onChange = vi.fn();
    configureComputerUse({ onChange, onNotificationClick: vi.fn(), onResumeOwed: vi.fn() });

    stopComputerUse();

    expect(revokePermission).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledOnce();
  });
});
