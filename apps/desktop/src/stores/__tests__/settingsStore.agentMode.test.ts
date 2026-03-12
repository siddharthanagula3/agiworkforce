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
      isTauriContext: () => true,
    }));

    const { useSettingsStore } = await import('../settingsStore');

    await useSettingsStore.getState().loadSettings();

    expect(invokeMock).toHaveBeenCalledWith('set_agent_mode', { mode: 'plan' });
    expect(useSettingsStore.getState().chatPreferences.agentMode).toBe('plan');
  });
});
