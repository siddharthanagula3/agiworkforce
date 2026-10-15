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
  featureFlags: { terminalAccess: false },
};

function mockInvoke(overrides: Record<string, (args?: Record<string, unknown>) => unknown> = {}) {
  invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    const override = overrides[command];
    if (override) return override(args);
    if (command === 'settings_load_from_disk' || command === 'settings_load') {
      return DISK_SETTINGS;
    }
    return undefined;
  });
}

function commandsSent(): string[] {
  return invoke.mock.calls.map(([command]) => command as string);
}

describe('settingsStore, the capability switches belong to the host', () => {
  beforeEach(() => {
    invoke.mockReset();
    useSettingsStore.setState({ features: {}, loading: false, error: null });
  });

  it('shows the switches the host holds and never pushes its own on load', async () => {
    mockInvoke();

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().features).toEqual({ terminalAccess: false });
    expect(commandsSent()).not.toContain('sync_capabilities');
    expect(commandsSent()).not.toContain('set_capability');
    expect(useSettingsStore.getState().error).toBeNull();
  });

  it('saves the settings document without the switches', async () => {
    mockInvoke();
    useSettingsStore.setState({ features: { terminalAccess: true, fileOperations: true } });

    await useSettingsStore.getState().saveSettings();

    const saved = invoke.mock.calls.find(([command]) => command === 'settings_save')?.[1] as
      { settings: Record<string, unknown> } | undefined;
    expect(saved).toBeDefined();
    expect(saved?.settings).not.toHaveProperty('featureFlags');
    expect(commandsSent()).not.toContain('sync_capabilities');
  });

  it('turns a capability off once the host has saved it', async () => {
    mockInvoke({ set_capability: () => true });

    await expect(useSettingsStore.getState().setFeature('terminalAccess', false)).resolves.toBe(
      true,
    );

    expect(invoke).toHaveBeenCalledWith('set_capability', {
      name: 'terminalAccess',
      enabled: false,
    });
    expect(useSettingsStore.getState().features).toEqual({ terminalAccess: false });
  });

  it('leaves a capability off when the person declines the host dialog for turning it on', async () => {
    mockInvoke({ set_capability: () => false });
    useSettingsStore.setState({ features: { terminalAccess: false } });

    await expect(useSettingsStore.getState().setFeature('terminalAccess', true)).resolves.toBe(
      false,
    );

    expect(useSettingsStore.getState().features).toEqual({ terminalAccess: false });
  });

  it('does not show a capability as on until the host says it is', async () => {
    let answer: (changed: boolean) => void = () => {};
    mockInvoke({
      set_capability: () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    });
    useSettingsStore.setState({ features: { terminalAccess: false } });

    const pending = useSettingsStore.getState().setFeature('terminalAccess', true);
    await Promise.resolve();
    expect(useSettingsStore.getState().features).toEqual({ terminalAccess: false });

    answer(true);
    await expect(pending).resolves.toBe(true);
    expect(useSettingsStore.getState().features).toEqual({ terminalAccess: true });
  });

  it('changes nothing and reports the failure when the host cannot save a switch', async () => {
    mockInvoke({
      set_capability: () => {
        throw new Error('Failed to write settings file');
      },
    });

    await expect(useSettingsStore.getState().setFeature('fileOperations', false)).rejects.toThrow(
      'Failed to write settings file',
    );
    expect(useSettingsStore.getState().features).toEqual({});
  });
});
