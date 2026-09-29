import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_RUNTIME_EVENT_CHANNEL } from '@agiworkforce/local-runtime-contract';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

const DEEP_LINK = 'agiworkforce-cloud://chat/conversation-1?nonce=nonce-abc123';
const LEGACY_SSO_LINK = 'agiworkforce-cloud://sso-callback?rotating_token_nonce=nonce-abc123';

const shell = vi.hoisted(() => ({
  ready: true,
  readyGate: null as Promise<void> | null,
  windows: [] as Array<{ loadURL: unknown }>,
}));

const appHandlers = new Map<string, (...args: unknown[]) => void>();
const webContentsSend = vi.fn();

function makeWebContents() {
  return {
    send: webContentsSend,
    on: vi.fn(),
    once: vi.fn((event: string, cb: () => void) => {
      if (event === 'did-finish-load') cb();
    }),
    isLoading: () => false,
    isDestroyed: () => false,
    setWindowOpenHandler: vi.fn(),
    userAgent: 'test',
    focus: vi.fn(),
  };
}

vi.mock('electron', () => {
  class BrowserWindow {
    static fromWebContents = vi.fn(() => null);
    static getAllWindows = vi.fn(() => []);
    webContents = makeWebContents();
    constructor(public options: unknown) {
      shell.windows.push(this);
    }
    once = vi.fn((event: string, cb: () => void) => {
      if (event === 'ready-to-show') cb();
    });
    on = vi.fn();
    loadURL = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    getBounds = () => ({ x: 0, y: 0, width: 1280, height: 800 });
    isMinimized = () => false;
    isDestroyed = () => false;
    isMaximized = () => false;
    isFullScreen = () => false;
  }

  const session = {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
  };

  return {
    BrowserWindow,
    Notification: Object.assign(
      vi.fn(() => ({ on: vi.fn(), show: vi.fn() })),
      { isSupported: () => false },
    ),
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    nativeTheme: { shouldUseDarkColors: true, on: vi.fn(), off: vi.fn() },
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    app: {
      name: 'AGI Cloud',
      requestSingleInstanceLock: () => true,
      setName: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        appHandlers.set(event, cb);
      }),
      whenReady: () => shell.readyGate ?? Promise.resolve(),
      isReady: () => shell.ready,
      getVersion: () => '1.2.0',
      getAppPath: () => '/app',
      getPath: () => '/userData',
      quit: vi.fn(),
      relaunch: vi.fn(),
      exit: vi.fn(),
    },
    clipboard: { write: vi.fn(), readText: vi.fn(async () => ''), writeText: vi.fn() },
    ClipboardItem: class {},
    contextBridge: { exposeInMainWorld: vi.fn() },
    desktopCapturer: { getSources: vi.fn(async () => []) },
    dialog: { showMessageBox: vi.fn(), showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
    ipcMain: { handle: vi.fn() },
    nativeImage: {
      createFromPath: vi.fn(() => ({ setTemplateImage: vi.fn(), isEmpty: () => true })),
    },
    net: { fetch: vi.fn() },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    safeStorage: { isEncryptionAvailable: () => false },
    screen: {
      getAllDisplays: vi.fn(() => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }]),
      getCursorScreenPoint: vi.fn(),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
      getDisplayNearestPoint: vi.fn(),
    },
    session: { defaultSession: session, fromPartition: () => session },
    shell: { openExternal: vi.fn() },
    systemPreferences: { getMediaAccessStatus: vi.fn(() => 'granted') },
  };
});

vi.mock('../tray', () => ({ createTray: vi.fn() }));
vi.mock('../shortcuts', () => ({
  registerGarnishShortcuts: vi.fn(),
  unregisterGarnishShortcuts: vi.fn(),
}));
vi.mock('../quickAsk', () => ({
  configureQuickAskBridge: vi.fn(),
  destroyQuickAsk: vi.fn(),
  toggleQuickAsk: vi.fn(),
  warmUpQuickAsk: vi.fn(),
}));
vi.mock('../screenshot', () => ({
  captureToChat: vi.fn(),
  captureWindowToChat: vi.fn(),
  takeCaptureBackFromClipboard: vi.fn(),
}));
vi.mock('../windowPolicy', () => ({ applyRemoteWindowPolicy: vi.fn() }));
vi.mock('../accountBridge', () => ({ handleBridgeCommand: vi.fn() }));

async function bootMain(mode: 'remote' | 'bundled' | 'unset') {
  if (mode === 'unset') delete process.env['AGI_CLOUD_RENDERER'];
  else process.env['AGI_CLOUD_RENDERER'] = mode;
  vi.resetModules();
  appHandlers.clear();
  webContentsSend.mockClear();
  shell.windows.length = 0;
  await import('../main');
  await Promise.resolve();
  await Promise.resolve();
}

function openUrl(url: string): void {
  const handler = appHandlers.get('open-url');
  if (!handler) throw new Error('open-url handler was never registered');
  handler({ preventDefault: vi.fn() }, url);
}

describe('deep-link delivery', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const originalMode = process.env['AGI_CLOUD_RENDERER'];

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    if (originalMode === undefined) delete process.env['AGI_CLOUD_RENDERER'];
    else process.env['AGI_CLOUD_RENDERER'] = originalMode;
  });

  it('delivers the callback over IPC when nothing sets the renderer mode', async () => {
    await bootMain('unset');

    openUrl(DEEP_LINK);

    expect(webContentsSend).toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, DEEP_LINK);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('dropped');
  });

  /**
   * This used to assert the opposite: that remote mode dropped the link and
   * said so. That was true while remote attached no preload, which is the
   * limitation the wrap removed. Both modes now carry the bridge, so the
   * guarantee worth pinning is that an OAuth callback actually arrives, and
   * that the secret inside it still never reaches a log.
   */
  it('delivers the callback over IPC in remote mode too', async () => {
    await bootMain('remote');
    warn.mockClear();

    openUrl(DEEP_LINK);

    expect(webContentsSend).toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, DEEP_LINK);
    const warned = warn.mock.calls.flat().join(' ');
    expect(warned).not.toContain('dropped');
    expect(warned).not.toContain('nonce-abc123');
  });

  it('delivers over IPC when the bundled renderer attaches the bridge', async () => {
    await bootMain('bundled');

    openUrl(DEEP_LINK);

    expect(webContentsSend).toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, DEEP_LINK);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('dropped');
  });

  it('holds a link that arrives before the app is ready until the window exists', async () => {
    let becomeReady = () => {};
    shell.ready = false;
    shell.readyGate = new Promise<void>((resolve) => {
      becomeReady = resolve;
    });
    await bootMain('remote');
    openUrl(DEEP_LINK);
    expect(shell.windows).toHaveLength(0);

    shell.ready = true;
    becomeReady();
    shell.readyGate = null;
    await Promise.resolve();
    await Promise.resolve();

    expect(webContentsSend).toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, DEEP_LINK);
  });

  it('tells the page a legacy sign-in callback expired without navigating the window', async () => {
    await bootMain('remote');

    openUrl(LEGACY_SSO_LINK);

    const loads = shell.windows.flatMap(
      (win) => (win.loadURL as ReturnType<typeof vi.fn>).mock.calls,
    );
    expect(loads.flat()).not.toContainEqual(expect.stringContaining('/auth/desktop/complete'));
    expect(webContentsSend).toHaveBeenCalledWith(DESKTOP_RUNTIME_EVENT_CHANNEL, {
      kind: 'browser-sign-in-expired',
    });
    expect(webContentsSend).not.toHaveBeenCalledWith(
      ELECTRON_IPC_CHANNELS.deepLink,
      LEGACY_SSO_LINK,
    );
  });

  it('ignores URLs outside the deep-link scheme', async () => {
    await bootMain('remote');
    warn.mockClear();

    openUrl('https://evil.example/sso-callback');

    expect(warn).not.toHaveBeenCalled();
  });
});
