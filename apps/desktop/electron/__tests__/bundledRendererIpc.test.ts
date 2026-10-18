import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_RUNTIME_CHANNEL } from '@agiworkforce/local-runtime-contract';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

type Handler = (...args: unknown[]) => unknown;

const appHandlers = new Map<string, Handler>();
const ipcHandlers = new Map<string, Handler>();
const showMessageBox = vi.fn();
const windowOptions: Array<{ webPreferences?: { additionalArguments?: string[] } }> = [];
const relaunch = vi.fn();
const quit = vi.fn();
const exit = vi.fn();

vi.mock('electron', () => {
  class BrowserWindow {
    static fromWebContents = vi.fn(() => null);
    static getAllWindows = vi.fn(() => []);
    static getFocusedWindow = vi.fn(() => null);
    id = 1;
    webContents = {
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      isLoading: () => false,
      isDestroyed: () => false,
      getURL: () => 'https://agiworkforce.com/chat',
      setWindowOpenHandler: vi.fn(),
      setZoomLevel: vi.fn(),
      userAgent: 'test',
      focus: vi.fn(),
    };
    constructor(public options: { webPreferences?: { additionalArguments?: string[] } }) {
      windowOptions.push(options);
    }
    once = vi.fn();
    on = vi.fn();
    loadURL = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    maximize = vi.fn();
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
    powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
    powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn(), isStarted: vi.fn(() => false) },
    BrowserWindow,
    Notification: Object.assign(
      vi.fn(function Notification() {
        return { on: vi.fn(), show: vi.fn(), close: vi.fn() };
      }),
      { isSupported: () => false },
    ),
    Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() },
    nativeTheme: { shouldUseDarkColors: true, on: vi.fn(), off: vi.fn() },
    app: {
      name: 'AGI Cloud',
      isPackaged: true,
      requestSingleInstanceLock: () => true,
      setName: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      setLoginItemSettings: vi.fn(),
      setBadgeCount: vi.fn(),
      on: vi.fn((event: string, handler: Handler) => appHandlers.set(event, handler)),
      whenReady: () => Promise.resolve(),
      isReady: () => true,
      getVersion: () => '1.2.0',
      getAppPath: () => '/app',
      getPath: () => '/userData',
      quit,
      relaunch,
      exit,
    },
    autoUpdater: {
      setFeedURL: vi.fn(),
      on: vi.fn(),
      checkForUpdates: vi.fn(),
      quitAndInstall: vi.fn(),
    },
    clipboard: { writeText: vi.fn() },
    desktopCapturer: { getSources: vi.fn(async () => []) },
    dialog: { showMessageBox, showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => ipcHandlers.set(channel, handler)),
    },
    protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
    screen: {
      getAllDisplays: vi.fn(() => [{ workArea: { x: 0, y: 0, width: 1440, height: 900 } }]),
      getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })),
    },
    session: { defaultSession: session, fromPartition: () => session },
    shell: { openExternal: vi.fn(), openPath: vi.fn() },
  };
});

let shellRuns = 0;
const cancelAllShellRuns = vi.fn();
vi.mock('../runtime/shellService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  activeShellRunCount: () => shellRuns,
  cancelAllShellRuns,
}));
const killAllDeveloperRuntimes = vi.fn();
vi.mock('../runtime/developerSessionService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureDeveloperSessions: vi.fn(),
  killAllDeveloperRuntimes,
}));
vi.mock('../tray', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createTray: vi.fn(),
  destroyTray: vi.fn(),
  hasTray: () => false,
  refreshTrayMenu: vi.fn(),
}));
vi.mock('../shortcuts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  registerGarnishShortcuts: vi.fn(() => []),
  unregisterGarnishShortcuts: vi.fn(),
  shortcutRegistrations: () => [],
}));
vi.mock('../quickAsk', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  destroyQuickAsk: vi.fn(),
  toggleQuickAsk: vi.fn(),
  warmUpQuickAsk: vi.fn(),
}));
vi.mock('../screenshot', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  captureToChat: vi.fn(),
}));
vi.mock('../windowPolicy', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyRemoteWindowPolicy: vi.fn(),
  openExternally: vi.fn(),
}));
vi.mock('../accountBridge', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  handleBridgeCommand: vi.fn(),
}));
vi.mock('../appMenu', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  installAppMenu: vi.fn(),
}));
vi.mock('../launchAtLogin', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyLaunchAtLogin: vi.fn(),
  setLaunchAtLogin: vi.fn(),
}));
vi.mock('../browser/bridgeServer', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  startBrowserBridge: vi.fn(async () => undefined),
  stopBrowserBridge: vi.fn(async () => undefined),
}));
vi.mock('../settingsStore', async (importOriginal) => {
  const core = await import('../garnishCore');
  return {
    ...(await importOriginal<object>()),
    getShortcuts: () => ({ ...core.DEFAULT_SHORTCUTS }),
    getPreferences: () => ({ ...core.DEFAULT_PREFERENCES, showInMenuBar: false }),
    saveSettings: vi.fn(),
  };
});
vi.mock('../shellWindowStore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  patchShellWindowState: vi.fn(),
  readShellWindowState: () => ({ frames: {}, lastRoute: null, lastAccount: null }),
}));

const BUNDLED_ONLY_CHANNELS = [
  ELECTRON_IPC_CHANNELS.invokeBridge,
  ELECTRON_IPC_CHANNELS.windowControl,
  ELECTRON_IPC_CHANNELS.dialog,
  ELECTRON_IPC_CHANNELS.relaunch,
];

const originalMode = process.env['AGI_CLOUD_RENDERER'];

async function bootMain(mode: 'remote' | 'bundled'): Promise<void> {
  process.env['AGI_CLOUD_RENDERER'] = mode;
  vi.resetModules();
  vi.clearAllMocks();
  appHandlers.clear();
  ipcHandlers.clear();
  windowOptions.length = 0;
  shellRuns = 0;
  await import('../main');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function bundledPageEvent(): unknown {
  const frame = { url: 'agi://cloud/index.html' };
  return { senderFrame: frame, sender: { mainFrame: frame } };
}

function beforeQuit(): { preventDefault: ReturnType<typeof vi.fn> } {
  const handler = appHandlers.get('before-quit');
  if (!handler) throw new Error('no before-quit handler');
  const event = { preventDefault: vi.fn() };
  handler(event);
  return event;
}

afterEach(() => {
  if (originalMode === undefined) delete process.env['AGI_CLOUD_RENDERER'];
  else process.env['AGI_CLOUD_RENDERER'] = originalMode;
});

describe('the bridge only the bundled renderer drives', () => {
  it('is not registered when the window shows the hosted app', async () => {
    await bootMain('remote');

    for (const channel of BUNDLED_ONLY_CHANNELS) {
      expect(ipcHandlers.has(channel), channel).toBe(false);
    }
    expect(ipcHandlers.has(DESKTOP_RUNTIME_CHANNEL)).toBe(true);
    expect(ipcHandlers.has(ELECTRON_IPC_CHANNELS.openExternal)).toBe(true);
    expect(ipcHandlers.has(ELECTRON_IPC_CHANNELS.hostPreferences)).toBe(true);
    expect(ipcHandlers.has(ELECTRON_IPC_CHANNELS.restartToUpdate)).toBe(true);
    expect(windowOptions[0]?.webPreferences?.additionalArguments).toContain(
      '--agi-renderer=remote',
    );
  });

  it('is registered for the bundled renderer, and still refuses any other caller', async () => {
    await bootMain('bundled');

    for (const channel of BUNDLED_ONLY_CHANNELS) {
      expect(ipcHandlers.has(channel), channel).toBe(true);
    }
    expect(windowOptions[0]?.webPreferences?.additionalArguments).toContain(
      '--agi-renderer=bundled',
    );
    const hostedPage = { url: 'https://agiworkforce.com/chat' };
    await expect(
      ipcHandlers.get(ELECTRON_IPC_CHANNELS.relaunch)?.({
        senderFrame: hostedPage,
        sender: { mainFrame: hostedPage },
      }),
    ).rejects.toThrow('Untrusted bridge caller.');
    expect(relaunch).not.toHaveBeenCalled();
  });
});

describe('restarting from the bundled renderer', () => {
  it('quits through will-quit, so agents and commands are stopped, and never calls app.exit', async () => {
    await bootMain('bundled');

    await expect(
      ipcHandlers.get(ELECTRON_IPC_CHANNELS.relaunch)?.(bundledPageEvent()),
    ).resolves.toBe(true);

    expect(showMessageBox).not.toHaveBeenCalled();
    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    expect(relaunch.mock.invocationCallOrder[0]).toBeLessThan(
      quit.mock.invocationCallOrder[0] ?? 0,
    );

    appHandlers.get('will-quit')?.();
    expect(cancelAllShellRuns).toHaveBeenCalledTimes(1);
    expect(killAllDeveloperRuntimes).toHaveBeenCalledTimes(1);
  });

  it('asks first while work is running, and Cancel restarts nothing', async () => {
    await bootMain('bundled');
    shellRuns = 2;
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    await expect(
      ipcHandlers.get(ELECTRON_IPC_CHANNELS.relaunch)?.(bundledPageEvent()),
    ).resolves.toBe(false);

    const options = showMessageBox.mock.calls[0]?.at(-1) as { detail: string; defaultId: number };
    expect(options.detail).toContain('2 local commands still running');
    expect(options.defaultId).toBe(0);
    expect(relaunch).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it('restarts once the user confirms, and the quit that follows is not asked about again', async () => {
    await bootMain('bundled');
    shellRuns = 1;
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    await expect(
      ipcHandlers.get(ELECTRON_IPC_CHANNELS.relaunch)?.(bundledPageEvent()),
    ).resolves.toBe(true);

    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });
});
