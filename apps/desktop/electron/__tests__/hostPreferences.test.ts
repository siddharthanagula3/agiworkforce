import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_SHORTCUT_CHOICES, NO_HOST_SHORTCUT } from '@agiworkforce/local-runtime-contract';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

type Handler = (event: unknown, payload: unknown) => Promise<unknown>;

const handlers = new Map<string, Handler>();
const loginItem = vi.fn();
const trayCalls: string[] = [];
let registeredAccelerators: string[] = [];
let storedSettings: Record<string, unknown> = {};

vi.mock('electron', () => {
  class BrowserWindow {
    static fromWebContents = vi.fn(() => null);
    webContents = {
      on: vi.fn(),
      once: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      setZoomLevel: vi.fn(),
      getZoomLevel: vi.fn(() => 0),
      session: { setPermissionRequestHandler: vi.fn() },
      userAgent: 'test',
      navigationHistory: { canGoBack: () => false, canGoForward: () => false },
    };
    constructor(public options: unknown) {}
    once = vi.fn();
    on = vi.fn();
    loadURL = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    isDestroyed = () => false;
    isMinimized = () => false;
    setBackgroundColor = vi.fn();
  }

  return {
    BrowserWindow,
    Notification: Object.assign(
      vi.fn(() => ({ on: vi.fn(), show: vi.fn() })),
      { isSupported: () => false },
    ),
    Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() },
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    nativeTheme: { shouldUseDarkColors: true, on: vi.fn(), off: vi.fn() },
    app: {
      name: 'AGI Cloud',
      isPackaged: true,
      getVersion: () => '1.2.0',
      getPath: () => '/tmp/agi-cloud-test',
      requestSingleInstanceLock: () => true,
      setName: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      setLoginItemSettings: loginItem,
      on: vi.fn(),
      whenReady: () => Promise.resolve(),
      quit: vi.fn(),
      exit: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => {
        handlers.set(channel, handler);
      }),
    },
    protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
    session: { defaultSession: {}, fromPartition: vi.fn(() => ({})) },
    shell: { openExternal: vi.fn(), openPath: vi.fn() },
    dialog: { showMessageBox: vi.fn() },
    desktopCapturer: { getSources: vi.fn() },
    globalShortcut: {
      register: vi.fn((accelerator: string) => {
        registeredAccelerators.push(accelerator);
        return true;
      }),
      unregisterAll: vi.fn(() => {
        registeredAccelerators = [];
      }),
    },
  };
});

vi.mock('../settingsStore', () => ({
  getSettings: () => storedSettings,
  getShortcuts: () => ({
    quickAskShortcut: storedSettings['quickAskShortcut'] ?? HOST_SHORTCUT_CHOICES.quickAsk[0],
    screenshotShortcut: storedSettings['screenshotShortcut'] ?? HOST_SHORTCUT_CHOICES.screenshot[0],
    voiceShortcut: storedSettings['voiceShortcut'] ?? HOST_SHORTCUT_CHOICES.voice[0],
  }),
  getPreferences: () => ({
    launchAtLogin: storedSettings['launchAtLogin'] === true,
    showInMenuBar: storedSettings['showInMenuBar'] !== false,
    zoomLevel: typeof storedSettings['zoomLevel'] === 'number' ? storedSettings['zoomLevel'] : 0,
  }),
  saveSettings: vi.fn((patch: Record<string, unknown>) => {
    storedSettings = { ...storedSettings, ...patch };
    return storedSettings;
  }),
  settingsFilePath: () => '/tmp/agi-cloud-test/settings.json',
}));

vi.mock('../tray', () => ({
  createTray: vi.fn(() => trayCalls.push('create')),
  destroyTray: vi.fn(() => trayCalls.push('destroy')),
  refreshTrayMenu: vi.fn(),
}));

vi.mock('../browser/bridgeServer', () => ({
  startBrowserBridge: vi.fn(),
  stopBrowserBridge: vi.fn(),
}));
vi.mock('../quickAsk', () => ({
  destroyQuickAsk: vi.fn(),
  toggleQuickAsk: vi.fn(),
  warmUpQuickAsk: vi.fn(),
}));
vi.mock('../screenshot', () => ({ captureToChat: vi.fn() }));
vi.mock('../voiceDictation', () => ({ toggleGlobalDictation: vi.fn() }));
vi.mock('../windowPolicy', () => ({
  applyRemoteWindowPolicy: vi.fn(),
  openExternally: vi.fn(),
}));

await import('../main');
// The IPC handlers register inside app.whenReady(); give that microtask chain a
// turn before any test reaches for the channel.
await new Promise((resolve) => setTimeout(resolve, 0));

/**
 * `isTrustedSender` admits the app's own main frame and nothing else, so the
 * event has to carry a frame that is its sender's main frame.
 */
function invoke(payload: unknown): Promise<unknown> {
  const handler = handlers.get(ELECTRON_IPC_CHANNELS.hostPreferences);
  if (!handler) throw new Error('the preferences channel was never registered');
  const frame = { url: 'https://agiworkforce.com/settings' };
  return handler({ senderFrame: frame, sender: { mainFrame: frame } }, payload);
}

type State = {
  preferences: Record<string, unknown>;
  shortcutStatus: Record<string, string>;
};

beforeEach(() => {
  storedSettings = {};
  trayCalls.length = 0;
  registeredAccelerators = [];
  loginItem.mockClear();
});

describe('the host preferences channel', () => {
  it('reads the shell defaults', async () => {
    const state = (await invoke(null)) as State;

    expect(state.preferences['launchAtLogin']).toBe(false);
    expect(state.preferences['showInMenuBar']).toBe(true);
    expect(state.preferences['quickAskShortcut']).toBe(HOST_SHORTCUT_CHOICES.quickAsk[0]);
    expect(Object.keys(state.shortcutStatus).sort()).toEqual(['quickAsk', 'screenshot', 'voice']);
  });

  it('applies launch at login rather than only recording it', async () => {
    const state = (await invoke({ launchAtLogin: true })) as State;

    expect(state.preferences['launchAtLogin']).toBe(true);
    expect(loginItem).toHaveBeenCalledWith({ openAtLogin: true });
  });

  it('re-registers the global shortcuts when one changes', async () => {
    const chosen = HOST_SHORTCUT_CHOICES.quickAsk[2] as string;

    const state = (await invoke({ quickAskShortcut: chosen })) as State;

    expect(state.preferences['quickAskShortcut']).toBe(chosen);
    expect(registeredAccelerators).toContain(chosen);
    expect(state.shortcutStatus['quickAsk']).toBe('registered');
  });

  // A chord the user switched off is a setting, not a failure, and the panel
  // has to be able to tell the difference.
  it('reports a switched-off shortcut as off and never registers it', async () => {
    const state = (await invoke({ voiceShortcut: NO_HOST_SHORTCUT })) as State;

    expect(state.preferences['voiceShortcut']).toBe(NO_HOST_SHORTCUT);
    expect(state.shortcutStatus['voice']).toBe('off');
    expect(registeredAccelerators).not.toContain(NO_HOST_SHORTCUT);
  });

  it('creates and destroys the menu bar item as the switch moves', async () => {
    await invoke({ showInMenuBar: false });
    expect(trayCalls).toEqual(['destroy']);

    await invoke({ showInMenuBar: true });
    expect(trayCalls).toEqual(['destroy', 'create']);
  });

  it('does not touch the menu bar when the switch did not move', async () => {
    await invoke({ showInMenuBar: true });

    expect(trayCalls).toEqual([]);
  });

  it('refuses anything that is not a preferences object', async () => {
    await expect(invoke('launchAtLogin')).rejects.toThrow(/object/u);
    await expect(invoke([1, 2])).rejects.toThrow(/object/u);
  });
});
