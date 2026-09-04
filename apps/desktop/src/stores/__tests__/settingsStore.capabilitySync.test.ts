import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invoke(command, args),
  isTauri: true,
  isCloudWeb: false,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isTauriContext: () => true,
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {}),
}));

const { useSettingsStore } = await import('../settingsStore');

const DISK_SETTINGS = {
  llmConfig: undefined,
  windowPreferences: undefined,
  allowedDirectories: [],
  customModels: [],
  featureFlags: { terminalAccess: false },
};

function mockInvoke(overrides: Record<string, () => unknown> = {}) {
  invoke.mockImplementation(async (command: string) => {
    const override = overrides[command];
    if (override) return override();
    if (command === 'settings_load_from_disk' || command === 'settings_load') {
      return DISK_SETTINGS;
    }
    return undefined;
  });
}

describe('settingsStore, capability sync failures are not reported as success', () => {
  beforeEach(() => {
    invoke.mockReset();
    useSettingsStore.setState({
      features: { terminalAccess: false },
      loading: false,
      error: null,
    });
  });

  it('rejects saveSettings when the capability sync fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke({
      sync_capabilities: () => {
        throw new Error('capability sync failed');
      },
    });

    await expect(useSettingsStore.getState().saveSettings()).rejects.toThrow(
      'capability sync failed',
    );
    expect(useSettingsStore.getState().loading).toBe(false);
    expect(useSettingsStore.getState().error).toBe('Something went wrong. Please try again.');

    consoleErrorSpy.mockRestore();
  });

  it('does not persist settings when the capability sync fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke({
      sync_capabilities: () => {
        throw new Error('capability sync failed');
      },
    });

    await expect(useSettingsStore.getState().saveSettings()).rejects.toThrow(
      'capability sync failed',
    );
    expect(invoke).not.toHaveBeenCalledWith('settings_save', expect.anything());

    consoleErrorSpy.mockRestore();
  });

  it('surfaces an error when the capability sync fails during load', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInvoke({
      sync_capabilities: () => {
        throw new Error('capability sync failed');
      },
    });

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().error).toMatch(/not being enforced/);

    consoleErrorSpy.mockRestore();
  });

  it('leaves no error behind when the capability sync succeeds during load', async () => {
    mockInvoke();

    await useSettingsStore.getState().loadSettings();

    expect(invoke).toHaveBeenCalledWith('sync_capabilities', {
      capabilities: { terminalAccess: false },
    });
    expect(useSettingsStore.getState().error).toBeNull();
  });
});
