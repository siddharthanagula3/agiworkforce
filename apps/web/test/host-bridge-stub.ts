import {
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_STATUSES,
  type HostBridge,
  type HostPreferences,
  type HostPreferencesState,
} from '@agiworkforce/local-runtime-contract';

export function hostPreferencesStub(
  overrides: Partial<HostPreferences> = {},
): HostPreferencesState {
  return {
    preferences: {
      launchAtLogin: false,
      quickAskShortcut: HOST_SHORTCUT_CHOICES.quickAsk[0] ?? '',
      screenshotShortcut: HOST_SHORTCUT_CHOICES.screenshot[0] ?? '',
      voiceShortcut: HOST_SHORTCUT_CHOICES.voice[0] ?? '',
      showInMenuBar: true,
      cliPath: '',
      ...overrides,
    },
    shortcutStatus: {
      quickAsk: HOST_SHORTCUT_STATUSES[0],
      screenshot: HOST_SHORTCUT_STATUSES[0],
      voice: HOST_SHORTCUT_STATUSES[0],
    },
  };
}

export function hostBridgeStub(overrides: Partial<HostBridge> = {}): HostBridge {
  return {
    platform: 'electron-darwin',
    shell: 'electron',
    appVersion: '1.2.0',
    invokeRuntime: async () => ({
      ok: false as const,
      error: { code: 'unsupported-platform' as const, message: 'no runtime in this test host' },
    }),
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent: () => () => undefined,
    onHostCommand: () => () => undefined,
    readPreferences: async () => hostPreferencesStub(),
    writePreferences: async (patch) => hostPreferencesStub(patch),
    openExternal: async () => undefined,
    notify: async () => undefined,
    checkForUpdate: async () => ({
      available: false,
      currentVersion: '1.2.0',
      version: '1.2.0',
      downloadUrl: '',
    }),
    openUpdateInstaller: async () => undefined,
    ...overrides,
  };
}
