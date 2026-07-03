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

  // FIX (DESKTOP-AGENTMODE-GUARDRAIL-SURFACE-01, audit 2026-07-03): pins the
  // restart-persistence fix end-to-end across the Rust/frontend boundary.
  // The Rust `ToolConfirmationState` now persists agent_mode /
  // auto_approve_all itself and restores them on every launch. Before this
  // fix, `loadSettings()` unconditionally PUSHED this store's own
  // (frequently stale/default, since the only reachable Settings UI —
  // SafetyPolicies.tsx — calls `set_agent_mode` directly and never updates
  // this store or its on-disk `chatPreferences` blob) value down to the
  // backend on every load, silently clobbering whatever the backend had
  // just correctly restored. This test simulates exactly that scenario: the
  // on-disk legacy blob still says 'build' (the frontend default — nobody
  // ever wrote 'safe' into it), but the backend has actually persisted
  // 'safe' (e.g. set via SafetyPolicies.tsx in a prior session). After the
  // fix, the backend value must win, and the frontend must NOT push 'build'
  // back down and overwrite it.
  it('hydrates the stricter backend-persisted agent mode instead of pushing a stale frontend default', async () => {
    const invokeMock = vi.fn(async (command: string) => {
      switch (command) {
        case 'settings_load_from_disk':
          return {
            llmConfig: undefined,
            windowPreferences: undefined,
            // Legacy on-disk blob never learned about the Safe-mode change
            // the user made via SafetyPolicies.tsx (which bypasses this
            // store), so it still reports the frontend default.
            chatPreferences: {
              agentMode: 'build',
              autoApproveTools: false,
            },
            allowedDirectories: [],
          };
        case 'get_agent_mode':
          // The Rust backend restored the user's real, explicitly-set mode
          // from settings_v2 on this launch.
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

    // Must NOT have pushed the stale frontend 'build' value down — that
    // would reproduce the exact regression this fix closes.
    expect(invokeMock).not.toHaveBeenCalledWith('set_agent_mode', expect.anything());
    expect(invokeMock).not.toHaveBeenCalledWith('set_auto_approve_all', expect.anything());

    // The store must be hydrated with the backend's restored value.
    expect(useSettingsStore.getState().chatPreferences.agentMode).toBe('safe');
    expect(useSettingsStore.getState().chatPreferences.autoApproveTools).toBe(false);
  });

  // FIX (DESKTOP-AGENTMODE-GUARDRAIL-SURFACE-01, audit 2026-07-03): the save
  // path is the symmetric half of the clobber bug fixed above. SafetyPolicies
  // .tsx (the only reachable agent-mode UI) calls `set_agent_mode` /
  // `set_auto_approve_all` directly and never updates this store, so this
  // store's `chatPreferences.agentMode`/`autoApproveTools` can be stale
  // relative to the backend's real, persisted value at any time.
  // `saveSettings()` fires from several unrelated flows (general Settings
  // panel save, several individual toggle handlers). If it still pushed
  // `chatPreferences.agentMode`/`autoApproveTools` to the backend, any one of
  // those unrelated saves would silently downgrade a user's explicit
  // Safe/Plan choice back to this store's stale value — and, since the
  // backend now persists what it's told, that downgrade would survive
  // restarts too. `saveSettings()` must not touch these two fields at all.
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

    // Simulate the store holding a stale mirror value ('build') while the
    // backend actually has a different mode persisted (e.g. 'safe', set via
    // SafetyPolicies.tsx, which never touches this store). Set explicitly
    // rather than relying on the store's ambient default, since persisted
    // state can carry over between test cases via localStorage.
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
