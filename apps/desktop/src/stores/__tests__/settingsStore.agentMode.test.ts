import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('settingsStore agent mode backend sync', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('syncs agent mode and auto-approve immediately when mode changes', async () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../../lib/tauri-mock', () => ({
      invoke: invokeMock,
      isTauri: true,
      isDesktopUiDevLocal: false,
      supportsLocalAppMode: true,
      isCloudWeb: false,
      isTauriContext: () => true,
    }));

    const { useSettingsStore } = await import('../settingsStore');

    await useSettingsStore.getState().setAgentMode('autopilot');

    expect(invokeMock).toHaveBeenCalledWith('set_agent_mode', { mode: 'autopilot' });
    expect(invokeMock).toHaveBeenCalledWith('set_auto_approve_all', { enabled: true });
    expect(useSettingsStore.getState().chatPreferences.agentMode).toBe('autopilot');
    expect(useSettingsStore.getState().chatPreferences.autoApproveTools).toBe(true);
  });

  it('syncs auto-approve immediately when toggled directly', async () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../../lib/tauri-mock', () => ({
      invoke: invokeMock,
      isTauri: true,
      isDesktopUiDevLocal: false,
      supportsLocalAppMode: true,
      isCloudWeb: false,
      isTauriContext: () => true,
    }));

    const { useSettingsStore } = await import('../settingsStore');

    await useSettingsStore.getState().setAutoApproveTools(true);

    expect(invokeMock).toHaveBeenCalledWith('set_auto_approve_all', { enabled: true });
    expect(useSettingsStore.getState().chatPreferences.autoApproveTools).toBe(true);
  });

  it('restores persisted agent mode into the backend during settings load', async () => {
    const invokeMock = vi.fn(async (command: string) => {
      switch (command) {
        case 'settings_load_from_disk':
          return {
            llmConfig: undefined,
            windowPreferences: undefined,
            chatPreferences: {
              agentMode: 'plan',
              autoApproveTools: false,
            },
            allowedDirectories: [],
          };
        case 'llm_configure_provider':
        case 'llm_set_default_provider':
        case 'set_auto_approve_all':
        case 'set_agent_mode':
        case 'sync_capabilities':
        case 'update_allowed_directories':
          return undefined;
        default:
          throw new Error(`Unexpected command: ${command}`);
      }
    });

    vi.doMock('../../lib/tauri-mock', () => ({
      invoke: invokeMock,
      isTauri: true,
      isDesktopUiDevLocal: false,
      supportsLocalAppMode: true,
      isCloudWeb: false,
      isTauriContext: () => true,
    }));

    const { useSettingsStore } = await import('../settingsStore');

    await useSettingsStore.getState().loadSettings();

    expect(invokeMock).toHaveBeenCalledWith('set_agent_mode', { mode: 'plan' });
    expect(useSettingsStore.getState().chatPreferences.agentMode).toBe('plan');
  });

  it('hydrates the stricter backend-persisted agent mode instead of pushing a stale frontend default', async () => {
    const invokeMock = vi.fn(async (command: string) => {
      switch (command) {
        case 'settings_load_from_disk':
          return {
            llmConfig: undefined,
            windowPreferences: undefined,
            // the user made via SafetyPolicies.tsx (which bypasses this
            chatPreferences: {
              agentMode: 'build',
              autoApproveTools: false,
            },
            allowedDirectories: [],
          };
        case 'get_agent_mode':
          return 'safe';
        case 'get_auto_approve_all':
          return false;
        case 'llm_configure_provider':
        case 'llm_set_default_provider':
        case 'sync_capabilities':
        case 'update_allowed_directories':
          return undefined;
        default:
          throw new Error(`Unexpected command: ${command}`);
      }
    });

    vi.doMock('../../lib/tauri-mock', () => ({
      invoke: invokeMock,
      isTauri: true,
      isDesktopUiDevLocal: false,
      supportsLocalAppMode: true,
      isCloudWeb: false,
      isTauriContext: () => true,
    }));

    const { useSettingsStore } = await import('../settingsStore');

    await useSettingsStore.getState().loadSettings();

    expect(invokeMock).not.toHaveBeenCalledWith('set_agent_mode', expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith('set_auto_approve_all', expect.anything());

    expect(useSettingsStore.getState().chatPreferences.agentMode).toBe('safe');
    expect(useSettingsStore.getState().chatPreferences.autoApproveTools).toBe(false);
  });

  // path is the symmetric half of the clobber bug fixed above. SafetyPolicies
  it('does not push agent mode or auto-approve-all when saving unrelated settings', async () => {
    const invokeMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock('../../lib/tauri-mock', () => ({
      invoke: invokeMock,
      isTauri: true,
      isDesktopUiDevLocal: false,
      supportsLocalAppMode: true,
      isCloudWeb: false,
      isTauriContext: () => true,
    }));

    const { useSettingsStore } = await import('../settingsStore');

    // SafetyPolicies.tsx, which never touches this store). Set explicitly
    useSettingsStore.setState((state) => ({
      chatPreferences: { ...state.chatPreferences, agentMode: 'build', autoApproveTools: false },
    }));
    expect(useSettingsStore.getState().chatPreferences.agentMode).toBe('build');

    await useSettingsStore.getState().saveSettings();

    expect(invokeMock).toHaveBeenCalledWith('settings_save', expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith('set_agent_mode', expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith('set_auto_approve_all', expect.anything());
  });
});
