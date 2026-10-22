import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeveloperSessionEvent } from '@agiworkforce/local-runtime-contract';
import { DESKTOP_RUNTIME_CHANNEL, localSessionPath } from '@agiworkforce/local-runtime-contract';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

type Listener = (...args: unknown[]) => void;

const userData = mkdtempSync(path.join(os.tmpdir(), 'agi-lifecycle-'));
const queueFile = path.join(userData, 'deep-link-queue.json');
writeFileSync(
  queueFile,
  JSON.stringify([
    { url: 'agiworkforce-cloud://chat/held-1', receivedAt: Date.now() - 1_000 },
    { url: 'agiworkforce-cloud://chat/held-2', receivedAt: Date.now() - 500 },
    { url: 'agiworkforce-cloud://chat/stale', receivedAt: Date.now() - 60 * 60_000 },
  ]),
);

const appHandlers = new Map<string, Listener>();
const ipcHandlers = new Map<string, Listener>();
const loadedUrls: string[] = [];
const sent: Array<[string, unknown]> = [];
const windowHandlers = new Map<string, Listener[]>();
let loading = true;
let pageUrl = 'https://agiworkforce.com/chat';

vi.mock('electron', () => {
  class BrowserWindow {
    static fromWebContents = vi.fn(() => null);
    static getAllWindows = vi.fn(() => []);
    static getFocusedWindow = vi.fn(() => null);
    id = 1;
    webContents = {
      send: (channel: string, payload: unknown) => sent.push([channel, payload]),
      on: vi.fn((event: string, listener: Listener) => {
        windowHandlers.set(event, [...(windowHandlers.get(event) ?? []), listener]);
      }),
      isDestroyed: () => false,
      once: vi.fn(),
      isLoading: () => loading,
      getURL: () => pageUrl,
      setWindowOpenHandler: vi.fn(),
      setZoomLevel: vi.fn(),
      focus: vi.fn(),
    };
    constructor(public options: unknown) {}
    once = vi.fn();
    on = vi.fn();
    loadURL = vi.fn((url: string) => {
      loadedUrls.push(url);
    });
    show = vi.fn();
    focus = vi.fn();
    restore = vi.fn();
    maximize = vi.fn();
    getBounds = () => ({ x: 0, y: 0, width: 1280, height: 800 });
    isMinimized = () => false;
    isDestroyed = () => false;
    isMaximized = () => false;
    isFullScreen = () => false;
    isVisible = () => true;
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
      { isSupported: () => true },
    ),
    Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() },
    nativeTheme: { shouldUseDarkColors: true, on: vi.fn(), off: vi.fn() },
    app: {
      name: 'AGI Desktop',
      isPackaged: true,
      requestSingleInstanceLock: () => true,
      setName: vi.fn(),
      setPath: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      setLoginItemSettings: vi.fn(),
      setBadgeCount: vi.fn(),
      on: vi.fn((event: string, listener: Listener) => appHandlers.set(event, listener)),
      whenReady: () => Promise.resolve(),
      isReady: () => true,
      getVersion: () => '1.2.0',
      getAppPath: () => '/app',
      getPath: () => userData,
      quit: vi.fn(),
      exit: vi.fn(),
    },
    autoUpdater: {
      setFeedURL: vi.fn(),
      on: vi.fn(),
      checkForUpdates: vi.fn(),
      quitAndInstall: vi.fn(),
    },
    clipboard: { writeText: vi.fn() },
    desktopCapturer: { getSources: vi.fn(async () => []) },
    dialog: { showMessageBox: vi.fn() },
    ipcMain: {
      handle: vi.fn((channel: string, handler: Listener) => ipcHandlers.set(channel, handler)),
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

let preferences = { showInMenuBar: true };

let downloadedVersion: string | null = null;
const installDownloadedUpdate = vi.fn(() => downloadedVersion !== null);
vi.mock('../desktopAutoUpdate', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadedUpdate: () => downloadedVersion,
  installDownloadedUpdate,
  startAutoUpdate: vi.fn(),
}));

vi.mock('../settingsStore', async (importOriginal) => {
  const core = await import('../garnishCore');
  return {
    ...(await importOriginal<object>()),
    getSettings: () => ({}),
    getShortcuts: () => ({ ...core.DEFAULT_SHORTCUTS }),
    getPreferences: () => ({ ...core.DEFAULT_PREFERENCES, ...preferences }),
    saveSettings: vi.fn(),
    settingsFilePath: () => path.join(userData, 'settings.json'),
  };
});

let trayHandlers: Record<string, unknown> | null = null;
let trayShown = false;
const refreshTrayMenu = vi.fn();
vi.mock('../tray', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createTray: vi.fn((handlers: Record<string, unknown>) => {
    trayHandlers = handlers;
    trayShown = true;
  }),
  destroyTray: vi.fn(() => {
    trayShown = false;
  }),
  hasTray: () => trayShown,
  refreshTrayMenu: (handlers: unknown) => refreshTrayMenu(handlers),
}));

let shortcutHandlers: Record<string, () => void> | null = null;
vi.mock('../shortcuts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  registerGarnishShortcuts: vi.fn((handlers: Record<string, () => void>) => {
    shortcutHandlers = handlers;
    return [];
  }),
  unregisterGarnishShortcuts: vi.fn(),
  shortcutRegistrations: () => [],
}));

let emitSessionEvent: ((rootId: string, event: DeveloperSessionEvent) => void) | null = null;
const interruptDeveloperTurn = vi.fn(async () => true);
const killAllDeveloperRuntimes = vi.fn();
vi.mock('../runtime/developerSessionService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureDeveloperSessions: vi.fn(
    (config: { emit: (rootId: string, event: DeveloperSessionEvent) => void }) => {
      emitSessionEvent = config.emit;
    },
  ),
  answerDeveloperApproval: vi.fn(async () => true),
  interruptDeveloperTurn,
  resolveBinaryPath: vi.fn(),
  killAllDeveloperRuntimes,
}));

let shellRuns = 0;
const cancelAllShellRuns = vi.fn();
vi.mock('../runtime/shellService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  activeShellRunCount: () => shellRuns,
  cancelAllShellRuns,
}));

let remoteStatus: 'idle' | 'connected' = 'idle';
const stopRemoteControl = vi.fn();
vi.mock('../remote/remoteControlService', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  configureRemoteControl: vi.fn(),
  relayDeveloperSessionEvent: vi.fn(),
  remoteControlState: () => ({
    status: remoteStatus,
    pairingCode: null,
    expiresAt: null,
    phoneName: 'Pixel',
    attachedSessions: 0,
    error: null,
  }),
  stopRemoteControl,
}));

let takenOver = false;
const takeOverComputerUse = vi.fn(() => {
  takenOver = true;
});
vi.mock('../runtime/computerUseSession', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  computerUsePhase: () => (takenOver ? 'paused' : 'idle'),
  configureComputerUse: vi.fn(),
  handBackComputerUse: vi.fn(() => {
    takenOver = false;
  }),
  shutDownComputerUse: vi.fn(),
  takeOverComputerUse,
}));

let computerUseGrant: 'granted' | 'prompt' = 'prompt';
vi.mock('../runtime/permissionManager', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPermissionState: (capability: string) =>
    capability === 'computer.use' ? computerUseGrant : 'prompt',
}));

const dispatchRuntime = vi.fn(async (_window: unknown, command: string) => {
  if (command === 'computer_stop') computerUseGrant = 'prompt';
  if (command === 'computer_screenshot') computerUseGrant = 'granted';
  return { ok: true, value: null };
});
vi.mock('../runtime/dispatcher', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  dispatch: (window: unknown, command: string) => dispatchRuntime(window, command),
}));

vi.mock('../runtime/workspaceStore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRoot: (id: string) => (id === 'root-1' ? { id, name: 'agiworkforce' } : undefined),
}));
vi.mock('../browser/bridgeServer', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  BrowserBridgeError: class extends Error {},
  pairingState: vi.fn(),
  startBrowserBridge: vi.fn(async () => undefined),
  stopBrowserBridge: vi.fn(async () => undefined),
}));
vi.mock('../quickAsk', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  destroyQuickAsk: vi.fn(),
  hideQuickAsk: vi.fn(),
  isQuickAskVisible: () => false,
  toggleQuickAsk: vi.fn(),
  warmUpQuickAsk: vi.fn(),
}));
vi.mock('../screenshot', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  captureToChat: vi.fn(),
}));
vi.mock('../voiceDictation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toggleGlobalDictation: vi.fn(),
}));
vi.mock('../windowPolicy', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyRemoteWindowPolicy: vi.fn(),
  openExternally: vi.fn(),
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

await import('../main');
await new Promise((resolve) => setTimeout(resolve, 0));
const electron = await import('electron');
const showMessageBox = vi.mocked(electron.dialog.showMessageBox);
const quit = vi.mocked(electron.app.quit);

function emit(event: DeveloperSessionEvent, rootId = 'root-1'): void {
  if (!emitSessionEvent) throw new Error('developer sessions were never configured');
  emitSessionEvent(rootId, event);
}

function beforeQuit(): { preventDefault: ReturnType<typeof vi.fn> } {
  const handler = appHandlers.get('before-quit');
  if (!handler) throw new Error('no before-quit handler');
  const event = { preventDefault: vi.fn() };
  handler(event);
  return event;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pageLoaded(): void {
  for (const listener of windowHandlers.get('did-finish-load') ?? []) listener();
  for (const listener of windowHandlers.get('did-stop-loading') ?? []) listener();
}

function deepLinksSent(): unknown[] {
  return sent
    .filter(([channel]) => channel === ELECTRON_IPC_CHANNELS.deepLink)
    .map(([, url]) => url);
}

describe('deep links held until the renderer is ready', () => {
  it('replays links held from the last run, then new ones, in order once the page loads', () => {
    appHandlers.get('open-url')?.({ preventDefault: vi.fn() }, 'agiworkforce-cloud://chat/new-1');
    appHandlers.get('open-url')?.({ preventDefault: vi.fn() }, 'agiworkforce-cloud://chat/new-2');
    expect(deepLinksSent()).toEqual([]);

    for (const listener of windowHandlers.get('did-finish-load') ?? []) listener();
    expect(deepLinksSent()).toEqual([]);

    loading = false;
    pageLoaded();

    expect(deepLinksSent()).toEqual([
      'agiworkforce-cloud://chat/held-1',
      'agiworkforce-cloud://chat/held-2',
      'agiworkforce-cloud://chat/new-1',
      'agiworkforce-cloud://chat/new-2',
    ]);

    sent.length = 0;
    pageLoaded();
    expect(deepLinksSent()).toEqual([]);
  });
});

describe('what main sends to a window', () => {
  const runtimeEvents = () =>
    sent.filter(([channel]) => channel === 'agi:desktop-runtime-event').map(([, event]) => event);

  beforeEach(() => {
    sent.length = 0;
    pageUrl = 'https://agiworkforce.com/chat';
    emit({ type: 'runtime-stopped', message: 'reset' });
    sent.length = 0;
  });

  it('reaches the app page, and not a sign-in provider or an offline screen the window is on', () => {
    const started = { type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' } as const;

    emit(started);
    expect(runtimeEvents()).toEqual([
      { kind: 'developer-session', rootId: 'root-1', event: started },
    ]);

    sent.length = 0;
    for (const elsewhere of [
      'https://accounts.google.com/o/oauth2/auth',
      'https://agiworkforce.com.evil.example/chat',
      'data:text/html,offline',
    ]) {
      pageUrl = elsewhere;
      emit({ type: 'output-delta', threadId: 'thread-1', turnId: 'turn-1', delta: 'private' });
      appHandlers.get('open-url')?.({ preventDefault: vi.fn() }, 'agiworkforce-cloud://chat/x');
    }
    expect(sent).toEqual([]);

    pageUrl = 'https://agiworkforce.com/chat';
    pageLoaded();
    expect(deepLinksSent()).toEqual(['agiworkforce-cloud://chat/x']);
  });
});

describe('quitting with work in flight', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
    quit.mockClear();
    cancelAllShellRuns.mockClear();
    killAllDeveloperRuntimes.mockClear();
    stopRemoteControl.mockClear();
    shellRuns = 0;
    remoteStatus = 'idle';
    emit({ type: 'runtime-stopped', message: 'reset' });
  });

  it('quits without asking when nothing is running', () => {
    const event = beforeQuit();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('asks, naming the work, and Cancel keeps everything running', async () => {
    shellRuns = 1;
    remoteStatus = 'connected';
    emit({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const event = beforeQuit();
    await settle();

    expect(event.preventDefault).toHaveBeenCalled();
    const options = showMessageBox.mock.calls[0]?.at(-1) as { detail: string; defaultId: number };
    expect(options.detail).toContain('1 coding agent turn');
    expect(options.detail).toContain('1 local command');
    expect(options.detail).toContain('Remote Control with Pixel');
    expect(options.defaultId).toBe(0);
    expect(quit).not.toHaveBeenCalled();
    expect(cancelAllShellRuns).not.toHaveBeenCalled();
    expect(killAllDeveloperRuntimes).not.toHaveBeenCalled();
    expect(stopRemoteControl).not.toHaveBeenCalled();
  });

  it('quits once the user confirms', async () => {
    shellRuns = 2;
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    beforeQuit();
    await settle();

    expect(quit).toHaveBeenCalledTimes(1);
    expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
  });
});

describe('closing the last window', () => {
  const realPlatform = process.platform;
  const runAs = (platform: NodeJS.Platform, body: () => void): void => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    try {
      body();
    } finally {
      Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
    }
  };

  beforeEach(() => {
    quit.mockClear();
  });

  it('keeps the app running on Windows and Linux while a tray icon exists', () => {
    trayShown = true;
    runAs('linux', () => appHandlers.get('window-all-closed')?.());
    runAs('win32', () => appHandlers.get('window-all-closed')?.());

    expect(quit).not.toHaveBeenCalled();
  });

  it('quits as before when the preference is on but no tray icon was made', () => {
    trayShown = false;
    preferences = { showInMenuBar: true };
    runAs('linux', () => appHandlers.get('window-all-closed')?.());

    expect(quit).toHaveBeenCalledTimes(1);
    trayShown = true;
  });

  it('never quits on macOS', () => {
    trayShown = false;
    runAs('darwin', () => appHandlers.get('window-all-closed')?.());

    expect(quit).not.toHaveBeenCalled();
    trayShown = true;
  });
});

describe('stopping agents', () => {
  beforeEach(() => {
    showMessageBox.mockReset();
    interruptDeveloperTurn.mockClear();
    takeOverComputerUse.mockClear();
    takenOver = false;
    emit({ type: 'runtime-stopped', message: 'reset' });
  });

  it('the global shortcut takes the screen back and interrupts every running turn', () => {
    emit({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
    emit({ type: 'turn-started', threadId: 'thread-2', turnId: 'turn-2' });

    shortcutHandlers?.['onStop']?.();

    expect(takeOverComputerUse).toHaveBeenCalledTimes(1);
    expect(interruptDeveloperTurn).toHaveBeenCalledWith('root-1', 'thread-1', 'turn-1');
    expect(interruptDeveloperTurn).toHaveBeenCalledWith('root-1', 'thread-2', 'turn-2');
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('the tray stop-all asks first, and Cancel stops nothing', async () => {
    emit({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    (trayHandlers?.['onStopAll'] as () => void)();
    await settle();

    expect(showMessageBox).toHaveBeenCalledTimes(1);
    expect(interruptDeveloperTurn).not.toHaveBeenCalled();
    expect(takeOverComputerUse).not.toHaveBeenCalled();

    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    (trayHandlers?.['onStopAll'] as () => void)();
    await settle();
    expect(interruptDeveloperTurn).toHaveBeenCalledWith('root-1', 'thread-1', 'turn-1');
  });
});

describe('tray activity and the dock badge', () => {
  it('lists running sessions and pending approvals and counts approvals on the badge', () => {
    emit({ type: 'runtime-stopped', message: 'reset' });
    takenOver = false;
    refreshTrayMenu.mockClear();
    emit({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
    emit({
      type: 'approval-requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'req-1',
      kind: 'command',
      summary: 'Run pnpm test',
      detail: '',
      command: 'pnpm test',
      riskLevel: 'low',
      reversible: true,
    });

    const activity = (trayHandlers?.['activity'] as () => unknown)();
    expect(activity).toEqual({
      runningTurns: [{ rootId: 'root-1', threadId: 'thread-1', label: 'Coding in agiworkforce' }],
      pendingApprovals: [
        { rootId: 'root-1', threadId: 'thread-1', label: 'Run pnpm test (agiworkforce)' },
      ],
      screenTakenOver: false,
      computerUseGranted: false,
    });
    expect(refreshTrayMenu).toHaveBeenCalled();
    expect(electron.app.setBadgeCount).toHaveBeenLastCalledWith(1);

    emit({
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'req-1',
      decision: 'approve_once',
      approved: true,
    });
    expect(electron.app.setBadgeCount).toHaveBeenLastCalledWith(0);
  });
});

describe('revoking computer use from the tray', () => {
  const runtimeCall = (command: string) => {
    const handler = ipcHandlers.get(DESKTOP_RUNTIME_CHANNEL);
    if (!handler) throw new Error('the runtime channel was never registered');
    const frame = { url: 'https://agiworkforce.com/chat' };
    return handler({ senderFrame: frame, sender: { mainFrame: frame } }, command, {});
  };

  beforeEach(() => {
    showMessageBox.mockReset();
    dispatchRuntime.mockClear();
    refreshTrayMenu.mockClear();
    computerUseGrant = 'prompt';
  });

  it('offers the item only while a grant is live, and rebuilds the tray when one is given', async () => {
    expect((trayHandlers?.['activity'] as () => { computerUseGranted: boolean })()).toMatchObject({
      computerUseGranted: false,
    });

    await runtimeCall('computer_screenshot');

    expect(refreshTrayMenu).toHaveBeenCalledTimes(1);
    expect((trayHandlers?.['activity'] as () => { computerUseGranted: boolean })()).toMatchObject({
      computerUseGranted: true,
    });

    await runtimeCall('computer_screenshot');
    expect(refreshTrayMenu).toHaveBeenCalledTimes(1);
  });

  it('asks first, naming that the agent loses the screen, and Cancel revokes nothing', async () => {
    computerUseGrant = 'granted';
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    (trayHandlers?.['onRevokeComputerUse'] as () => void)();
    await settle();

    const options = showMessageBox.mock.calls[0]?.at(-1) as { message: string; defaultId: number };
    expect(options.message).toContain('lose control of this screen until you allow it again');
    expect(options.defaultId).toBe(0);
    expect(dispatchRuntime).not.toHaveBeenCalled();
    expect(computerUseGrant).toBe('granted');
  });

  it('sends the same computer_stop the page sends once confirmed', async () => {
    computerUseGrant = 'granted';
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    (trayHandlers?.['onRevokeComputerUse'] as () => void)();
    await settle();

    expect(dispatchRuntime).toHaveBeenCalledWith(expect.anything(), 'computer_stop');
    expect(computerUseGrant).toBe('prompt');
  });
});

describe('opening a local session', () => {
  it('loads the code page on that session, and only raises a window already on it', async () => {
    const { CLOUD_APP_ORIGIN } = await import('../config');
    const open = trayHandlers?.['onOpenSession'] as (rootId: string, threadId: string) => void;
    loadedUrls.length = 0;

    open('root-1', 'thread-9');
    expect(loadedUrls).toEqual([`${CLOUD_APP_ORIGIN}${localSessionPath('root-1', 'thread-9')}`]);
    expect(loadedUrls[0]).toContain('/code?local=root-1&thread=thread-9');

    open('root-1', 'thread-9');
    expect(loadedUrls).toHaveLength(1);
  });
});

describe('keeping the computer awake while an agent works', () => {
  it('holds off system sleep for a running turn and lets go when it finishes', () => {
    const blocker = vi.mocked(electron.powerSaveBlocker);
    blocker.isStarted.mockReturnValue(true);
    emit({ type: 'runtime-stopped', message: 'reset' });
    blocker.start.mockClear();
    blocker.stop.mockClear();
    try {
      emit({ type: 'turn-started', threadId: 'thread-keep', turnId: 'turn-keep' });
      expect(blocker.start).toHaveBeenCalledWith('prevent-app-suspension');

      emit({
        type: 'turn-finished',
        threadId: 'thread-keep',
        turnId: 'turn-keep',
        outcome: 'completed',
        response: 'Done.',
      } as DeveloperSessionEvent);
      expect(blocker.stop).toHaveBeenCalledOnce();
    } finally {
      blocker.isStarted.mockReturnValue(false);
    }
  });
});

describe('notifications the page asks for', () => {
  const caller = { senderFrame: { url: 'https://agiworkforce.com/chat' } } as {
    senderFrame: { url: string };
    sender?: unknown;
  };
  caller.sender = { mainFrame: caller.senderFrame };

  function windowThat(focused: boolean, visible = true) {
    return { isDestroyed: () => false, isVisible: () => visible, isFocused: () => focused };
  }

  async function ask(window: ReturnType<typeof windowThat> | null): Promise<number> {
    const notify = ipcHandlers.get(ELECTRON_IPC_CHANNELS.notify);
    if (!notify) throw new Error('the notify channel was never registered');
    const created = vi.mocked(electron.Notification);
    created.mockClear();
    vi.mocked(electron.BrowserWindow.fromWebContents).mockReturnValueOnce(
      window as unknown as null,
    );
    await notify(caller, { title: 'Reply ready', body: 'The sea is wide.' });
    return created.mock.calls.length;
  }

  it('shows one when the window that asked is behind another app, hidden or minimized', async () => {
    expect(await ask(windowThat(false))).toBe(1);
    expect(await ask(windowThat(false, false))).toBe(1);
    expect(await ask(null)).toBe(1);
  });

  it('stays quiet while the user is looking at the window that asked', async () => {
    expect(await ask(windowThat(true))).toBe(0);
  });
});

describe('the update buttons', () => {
  const trustedCaller = () => {
    const frame = { url: 'https://agiworkforce.com/chat' };
    return { senderFrame: frame, sender: { mainFrame: frame } };
  };

  it('opens the installer download while no update is downloaded, and restart says not ready', async () => {
    const download = ipcHandlers.get(ELECTRON_IPC_CHANNELS.openUpdateInstaller);
    const restart = ipcHandlers.get(ELECTRON_IPC_CHANNELS.restartToUpdate);
    if (!download || !restart) throw new Error('the update channels were never registered');
    const openExternal = vi.mocked(electron.shell.openExternal);
    openExternal.mockClear();

    await download(trustedCaller());

    expect(openExternal).toHaveBeenCalledTimes(1);
    await expect(restart(trustedCaller())).resolves.toBe('not-ready');
    expect(installDownloadedUpdate).not.toHaveBeenCalled();
  });

  // The shipped page restarts into a downloaded update through the installer
  // button, so both buttons restart through the quit guard.
  it('restarts into a downloaded update only once work a quit would stop is agreed to', async () => {
    const download = ipcHandlers.get(ELECTRON_IPC_CHANNELS.openUpdateInstaller);
    const restart = ipcHandlers.get(ELECTRON_IPC_CHANNELS.restartToUpdate);
    if (!download || !restart) throw new Error('the update channels were never registered');
    const openExternal = vi.mocked(electron.shell.openExternal);
    openExternal.mockClear();
    showMessageBox.mockReset();
    installDownloadedUpdate.mockClear();
    downloadedVersion = '1.3.0';
    shellRuns = 1;
    try {
      showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
      await expect(restart(trustedCaller())).resolves.toBe('deferred');
      expect(installDownloadedUpdate).not.toHaveBeenCalled();

      showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
      await download(trustedCaller());
      expect(installDownloadedUpdate).toHaveBeenCalledTimes(1);
      expect(openExternal).not.toHaveBeenCalled();
      expect(beforeQuit().preventDefault).not.toHaveBeenCalled();
    } finally {
      downloadedVersion = null;
      shellRuns = 0;
    }
  });
});
