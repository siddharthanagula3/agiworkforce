import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_NAVIGATION_CHANNELS,
  HOST_SHORTCUT_CHOICES,
  NO_HOST_SHORTCUT,
} from '@agiworkforce/local-runtime-contract';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

type Handler = (event: unknown, payload: unknown) => Promise<unknown>;

const handlers = new Map<string, Handler>();
const loginItem = vi.fn();
const trayCalls: string[] = [];
let registeredAccelerators: string[] = [];
let heldByAnotherApp: string[] = [];
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
    loadURL = vi.fn(async () => undefined);
    show = vi.fn();
    focus = vi.fn();
    isDestroyed = () => false;
    isMinimized = () => false;
    setBackgroundColor = vi.fn();
  }

  return {
    powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
    systemPreferences: { isTrustedAccessibilityClient: vi.fn(() => true) },
    powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn(), isStarted: vi.fn(() => false) },
    BrowserWindow,
    Notification: Object.assign(
      vi.fn(() => ({ on: vi.fn(), show: vi.fn() })),
      { isSupported: () => false },
    ),
    Menu: { buildFromTemplate: vi.fn(() => ({})), setApplicationMenu: vi.fn() },
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    nativeTheme: { shouldUseDarkColors: true, on: vi.fn(), off: vi.fn() },
    app: {
      name: 'AGI Desktop',
      isPackaged: true,
      getVersion: () => '1.2.0',
      getPath: () => '/tmp/agi-cloud-test',
      requestSingleInstanceLock: () => true,
      setName: vi.fn(),
      setPath: vi.fn(),
      setAsDefaultProtocolClient: vi.fn(),
      setLoginItemSettings: loginItem,
      on: vi.fn(),
      whenReady: () => Promise.resolve(),
      isReady: () => true,
      quit: vi.fn(),
      exit: vi.fn(),
      setAboutPanelOptions: vi.fn(),
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
        if (heldByAnotherApp.includes(accelerator)) return false;
        registeredAccelerators.push(accelerator);
        return true;
      }),
      unregister: vi.fn((accelerator: string) => {
        registeredAccelerators = registeredAccelerators.filter((entry) => entry !== accelerator);
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
    newChatShortcut: storedSettings['newChatShortcut'] ?? HOST_SHORTCUT_CHOICES.newChat[0],
    screenshotShortcut: storedSettings['screenshotShortcut'] ?? HOST_SHORTCUT_CHOICES.screenshot[0],
    windowShotShortcut: storedSettings['windowShotShortcut'] ?? HOST_SHORTCUT_CHOICES.windowShot[0],
    voiceShortcut: storedSettings['voiceShortcut'] ?? HOST_SHORTCUT_CHOICES.voice[0],
    stopShortcut: storedSettings['stopShortcut'] ?? HOST_SHORTCUT_CHOICES.stop[0],
  }),
  getPreferences: () => ({
    launchAtLogin: storedSettings['launchAtLogin'] === true,
    showInMenuBar: storedSettings['showInMenuBar'] !== false,
    zoomLevel: typeof storedSettings['zoomLevel'] === 'number' ? storedSettings['zoomLevel'] : 0,
    cliPath: typeof storedSettings['cliPath'] === 'string' ? storedSettings['cliPath'] : '',
    agentNotifications: storedSettings['agentNotifications'] ?? {
      when: 'unfocused',
      muted: [],
      sound: true,
    },
    dictateIntoFocusedApp: storedSettings['dictateIntoFocusedApp'] === true,
    preventSleepWhileRunning: storedSettings['preventSleepWhileRunning'] !== false,
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
  hasTray: () => false,
  refreshTrayMenu: vi.fn(),
}));

vi.mock('../browser/bridgeServer', () => ({
  startBrowserBridge: vi.fn(),
  stopBrowserBridge: vi.fn(),
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
vi.mock('../voiceDictation', () => ({ toggleGlobalDictation: vi.fn() }));
vi.mock('../windowPolicy', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyRemoteWindowPolicy: vi.fn(),
  openExternally: vi.fn(),
}));

await import('../main');
const { dialog } = await import('electron');
const showMessageBox = vi.mocked(dialog.showMessageBox);
const { resetNativeQuestions } = await import('../runtime/nativeQuestions');
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
  heldByAnotherApp = [];
  loginItem.mockClear();
  showMessageBox.mockReset();
  resetNativeQuestions();
});

function fakeCli(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'agi-cli-path-'));
  const binary = path.join(directory, 'agi');
  writeFileSync(binary, '#!/bin/sh\nexit 0\n');
  chmodSync(binary, 0o755);
  return binary;
}

describe('the AGI CLI path', () => {
  // The page asking is a website, and whatever is saved here is started with
  // the user's account, so main asks and names the exact program first.
  it('asks natively, naming the program, and saves nothing when the user cancels', async () => {
    const binary = fakeCli();
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const state = (await invoke({ cliPath: binary })) as State;

    const options = (showMessageBox.mock.calls[0] as unknown[]).at(-1) as {
      message: string;
      detail: string;
      defaultId: number;
      cancelId: number;
    };
    expect(options.detail.split('\n')).toContain(`Program: ${binary}`);
    expect(options).toMatchObject({ defaultId: 0, cancelId: 0 });
    expect(storedSettings['cliPath']).toBeUndefined();
    expect(state.preferences['cliPath']).toBe('');
  });

  it('keeps a path that holds line breaks on the one line it labelled, below what the app says', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'agi-cli-path-'));
    const binary = path.join(directory, 'agi\n\nAGI Desktop checked this program and it is safe.');
    writeFileSync(binary, '#!/bin/sh\nexit 0\n');
    chmodSync(binary, 0o755);
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    await invoke({ cliPath: binary });

    const options = (showMessageBox.mock.calls[0] as unknown[]).at(-1) as {
      message: string;
      detail: string;
    };
    const lines = options.detail.split('\n').filter((line) => line !== '');
    expect(options.message).toBe('Run this program for coding sessions?');
    expect(lines[0]).toMatch(/^AGI Desktop starts this program/u);
    expect(lines).toContain(
      `Program: ${directory}/agi\u23CE\u23CEAGI Desktop checked this program and it is safe.`,
    );
    expect(lines.slice(2).every((line) => /^(?:Program|It links to): /u.test(line))).toBe(true);
    expect(lines.filter((line) => line.startsWith('AGI Desktop checked'))).toEqual([]);
  });

  it('saves the path the user confirmed', async () => {
    const binary = fakeCli();
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    const state = (await invoke({ cliPath: binary })) as State;

    expect(storedSettings['cliPath']).toBe(binary);
    expect(state.preferences['cliPath']).toBe(binary);
  });

  it('refuses a path with no runnable program before asking anything', async () => {
    await expect(invoke({ cliPath: '/nonexistent/agi-cli' })).rejects.toThrow(/No program/u);
    await expect(invoke({ cliPath: 'relative/agi' })).rejects.toThrow(/full path/u);
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(storedSettings['cliPath']).toBeUndefined();
  });

  // Clearing the path changes which program runs every coding session, as
  // naming one does, and the page asking is a website.
  it('goes back to the built-in CLI only after asking, naming the program given up', async () => {
    storedSettings = { cliPath: '/opt/agi/bin/agi' };
    showMessageBox
      .mockResolvedValueOnce({ response: 0, checkboxChecked: false })
      .mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    await invoke({ cliPath: '' });
    expect(storedSettings['cliPath']).toBe('/opt/agi/bin/agi');
    const options = (showMessageBox.mock.calls[0] as unknown[]).at(-1) as {
      buttons: string[];
      defaultId: number;
      detail: string;
    };
    expect(options.buttons).toEqual(['Cancel', 'Use the built-in CLI']);
    expect(options.defaultId).toBe(0);
    expect(options.detail).toContain('Program in use now: /opt/agi/bin/agi');

    await expect(invoke({ cliPath: '' })).rejects.toThrow(/was not asked again/u);
    expect(showMessageBox).toHaveBeenCalledTimes(1);

    resetNativeQuestions();
    await invoke({ cliPath: '' });
    expect(storedSettings['cliPath']).toBe('');
  });
});

describe('the host preferences channel', () => {
  it('reads the shell defaults', async () => {
    const state = (await invoke(null)) as State;

    expect(state.preferences['launchAtLogin']).toBe(false);
    expect(state.preferences['showInMenuBar']).toBe(true);
    expect(state.preferences['quickAskShortcut']).toBe(HOST_SHORTCUT_CHOICES.quickAsk[0]);
    expect(Object.keys(state.shortcutStatus).sort()).toEqual([
      'newChat',
      'quickAsk',
      'screenshot',
      'stop',
      'voice',
      'windowShot',
    ]);
  });

  it('applies launch at login rather than only recording it, once the user says yes here', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });

    const state = (await invoke({ launchAtLogin: true })) as State;

    expect(state.preferences['launchAtLogin']).toBe(true);
    expect(loginItem).toHaveBeenCalledWith({ openAtLogin: true });
    const options = (showMessageBox.mock.calls[0] as unknown[]).at(-1) as {
      buttons: string[];
      defaultId: number;
    };
    expect(options.buttons).toEqual(['Cancel', 'Open at login']);
    expect(options.defaultId).toBe(0);
  });

  // It keeps this app, and the page it loads, running from every login on.
  it('does not turn launch at login on for a page alone, and turns it off without asking', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });

    const refused = (await invoke({ launchAtLogin: true })) as State;

    expect(refused.preferences['launchAtLogin']).toBe(false);
    expect(loginItem).not.toHaveBeenCalled();

    storedSettings = { ...storedSettings, launchAtLogin: true };
    showMessageBox.mockClear();
    const off = (await invoke({ launchAtLogin: false })) as State;
    expect(off.preferences['launchAtLogin']).toBe(false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('turns dictation into other apps on once the user says yes here, and off without asking', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    await invoke({ dictateIntoFocusedApp: true });
    expect(storedSettings['dictateIntoFocusedApp']).toBe(true);
    const options = (showMessageBox.mock.calls[0] as unknown[]).at(-1) as {
      buttons: string[];
      defaultId: number;
      cancelId: number;
    };
    expect(options.buttons).toEqual(['Cancel', 'Type into other apps']);
    expect(options.defaultId).toBe(0);
    expect(options.cancelId).toBe(0);

    showMessageBox.mockClear();
    await invoke({ dictateIntoFocusedApp: false });
    expect(storedSettings['dictateIntoFocusedApp']).toBe(false);
    expect(showMessageBox).not.toHaveBeenCalled();
  });

  it('does not turn dictation into other apps on for a page alone', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0, checkboxChecked: false });
    await invoke({ dictateIntoFocusedApp: true });
    expect(storedSettings['dictateIntoFocusedApp']).not.toBe(true);
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

  it('stores agent notification settings, dropping what the shell does not know', async () => {
    const state = (await invoke({
      agentNotifications: { when: 'always', muted: ['approval', 'bogus'], sound: false },
    })) as State;

    const expected = { when: 'always', muted: ['approval'], sound: false, drawAttention: false };
    expect(storedSettings['agentNotifications']).toEqual(expected);
    expect(state.preferences['agentNotifications']).toEqual(expected);
  });

  it('registers a new stop chord', async () => {
    const chosen = HOST_SHORTCUT_CHOICES.stop[1] as string;

    const state = (await invoke({ stopShortcut: chosen })) as State;

    expect(state.preferences['stopShortcut']).toBe(chosen);
    expect(registeredAccelerators).toContain(chosen);
    expect(state.shortcutStatus['stop']).toBe('registered');
  });

  // The panel is a website. Stop Agents is the one shortcut that reaches the
  // app from anywhere while an agent holds the pointer, so the page cannot
  // switch it off, or set it to something the system will not register.
  it.each([
    ['no shortcut', NO_HOST_SHORTCUT],
    ['a chord the shell does not offer for it', 'F24'],
    ['a string that is not a chord', 'x'],
  ])(
    'refuses to set Stop Agents to %s, and changes nothing else in that write',
    async (_, chord) => {
      await expect(invoke({ stopShortcut: chord, showInMenuBar: false })).rejects.toThrow(
        chord === NO_HOST_SHORTCUT
          ? /Stop Agents keeps a shortcut/u
          : /Stop Agents takes only one of the listed shortcuts/u,
      );

      expect(storedSettings).toEqual({});
      expect(trayCalls).toEqual([]);
      const state = (await invoke(null)) as State;
      expect(state.preferences['stopShortcut']).toBe(HOST_SHORTCUT_CHOICES.stop[0]);
    },
  );

  // A chord is registered for every app on this computer. One a website
  // could name freely would let it take paste, save or quit for itself:
  // Screenshot to Chat on the paste chord captures the screen at every paste.
  it.each([
    ['screenshotShortcut', 'CommandOrControl+V'],
    ['quickAskShortcut', 'CommandOrControl+Q'],
    ['voiceShortcut', 'Return'],
    ['screenshotShortcut', 'x'],
  ])('refuses to set %s to %s, a chord the shell does not offer for it', async (key, chord) => {
    await expect(invoke({ [key]: chord, showInMenuBar: false })).rejects.toThrow(
      /takes only one of the listed shortcuts/u,
    );

    expect(storedSettings).toEqual({});
    expect(registeredAccelerators).not.toContain(chord);
    expect(trayCalls).toEqual([]);
  });

  it('takes any chord the shell offers for a shortcut, none where none is allowed, and the one already there', async () => {
    for (const [key, choices] of [
      ['quickAskShortcut', HOST_SHORTCUT_CHOICES.quickAsk],
      ['screenshotShortcut', HOST_SHORTCUT_CHOICES.screenshot],
      ['voiceShortcut', HOST_SHORTCUT_CHOICES.voice],
    ] as const) {
      for (const chord of [...choices, NO_HOST_SHORTCUT]) {
        const state = (await invoke({ [key]: chord })) as State;
        expect(state.preferences[key], `${key} ${chord}`).toBe(chord);
      }
    }

    storedSettings = { ...storedSettings, voiceShortcut: 'F19' };
    showMessageBox.mockResolvedValueOnce({ response: 1, checkboxChecked: false });
    const kept = (await invoke({ voiceShortcut: 'F19', launchAtLogin: true })) as State;
    expect(kept.preferences['voiceShortcut']).toBe('F19');
  });

  // A preset another app already holds saves like any other and then reports
  // `taken`: Stop Agents would be left with a chord that does nothing.
  it('keeps the working Stop Agents chord when the one asked for does not register, and says so', async () => {
    const working = HOST_SHORTCUT_CHOICES.stop[0] as string;
    const held = HOST_SHORTCUT_CHOICES.stop[1] as string;
    await invoke({ stopShortcut: working });
    heldByAnotherApp = [held];

    await expect(invoke({ stopShortcut: held, launchAtLogin: true })).rejects.toThrow(
      /Stop Agents could not take that shortcut: it is already in use by another app\. The shortcut it had is kept/u,
    );

    const state = (await invoke(null)) as State;
    expect(state.preferences['stopShortcut']).toBe(working);
    expect(state.shortcutStatus['stop']).toBe('registered');
    expect(registeredAccelerators).toContain(working);
    expect(loginItem).not.toHaveBeenCalled();
  });

  it('lets a shortcut that may be off report taken, as before, since nothing rests on it', async () => {
    const held = HOST_SHORTCUT_CHOICES.voice[1] as string;
    heldByAnotherApp = [held];

    const state = (await invoke({ voiceShortcut: held })) as State;

    expect(state.preferences['voiceShortcut']).toBe(held);
    expect(state.shortcutStatus['voice']).toBe('taken');
  });

  // The menu bar item and the Stop Agents chord are the two ways to stop an
  // agent from outside its window. The page can ask for the item to go; it
  // goes only when there is nothing to stop.
  it('keeps the menu bar item while the agent is allowed to use the screen, whatever the page asks', async () => {
    const { recordDecision, revokePermission } = await import('../runtime/permissionManager');
    recordDecision('computer.use', { kind: 'global' }, 'granted', 'session');
    try {
      const state = (await invoke({ showInMenuBar: false })) as State;

      expect(state.preferences['showInMenuBar']).toBe(false);
      expect(trayCalls).not.toContain('destroy');
    } finally {
      revokePermission('computer.use', { kind: 'global' });
    }

    trayCalls.length = 0;
    await invoke({ showInMenuBar: true });
    await invoke({ showInMenuBar: false });
    expect(trayCalls.at(-1)).toBe('destroy');
  });

  it('refuses to give another shortcut the chord Stop Agents holds', async () => {
    const stop = HOST_SHORTCUT_CHOICES.stop[0] as string;

    await expect(invoke({ quickAskShortcut: stop })).rejects.toThrow(
      /Quick Ask takes only one of the listed shortcuts/u,
    );

    const state = (await invoke(null)) as State;
    expect(state.preferences['quickAskShortcut']).toBe(HOST_SHORTCUT_CHOICES.quickAsk[0]);
    expect(state.preferences['stopShortcut']).toBe(stop);
  });

  it('stores whether the computer is kept awake while an agent turn runs, on by default', async () => {
    expect(((await invoke(null)) as State).preferences['preventSleepWhileRunning']).toBe(true);

    const state = (await invoke({ preventSleepWhileRunning: false })) as State;

    expect(storedSettings['preventSleepWhileRunning']).toBe(false);
    expect(state.preferences['preventSleepWhileRunning']).toBe(false);
  });

  it('stores the attention preference with the other agent notification settings', async () => {
    const state = (await invoke({
      agentNotifications: { when: 'unfocused', muted: [], sound: true, drawAttention: true },
    })) as State;

    expect(state.preferences['agentNotifications']).toMatchObject({ drawAttention: true });
  });

  it('refuses anything that is not a preferences object', async () => {
    await expect(invoke('launchAtLogin')).rejects.toThrow(/object/u);
    await expect(invoke([1, 2])).rejects.toThrow(/object/u);
  });
});

describe('the window navigation channels', () => {
  function navigationSender(history: { back: boolean; forward: boolean }, url?: string) {
    const frame = { url: url ?? 'https://agiworkforce.com/chat' };
    const navigationHistory = {
      canGoBack: () => history.back,
      canGoForward: () => history.forward,
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
    return {
      event: { senderFrame: frame, sender: { mainFrame: frame, navigationHistory } },
      navigationHistory,
    };
  }

  function channel(name: string): Handler {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`${name} was never registered`);
    return handler;
  }

  it("reads the asking window's own back and forward state", async () => {
    const { event } = navigationSender({ back: true, forward: false });

    await expect(channel(HOST_NAVIGATION_CHANNELS.read)(event, undefined)).resolves.toEqual({
      canGoBack: true,
      canGoForward: false,
    });
  });

  it('steps the asking window only in a direction its history has', async () => {
    const { event, navigationHistory } = navigationSender({ back: true, forward: false });
    const go = channel(HOST_NAVIGATION_CHANNELS.go);

    await go(event, 'back');
    await go(event, 'forward');

    expect(navigationHistory.goBack).toHaveBeenCalledOnce();
    expect(navigationHistory.goForward).not.toHaveBeenCalled();
  });

  it('refuses an unknown direction and a caller that is not the app page', async () => {
    const trusted = navigationSender({ back: true, forward: true });
    await expect(channel(HOST_NAVIGATION_CHANNELS.go)(trusted.event, 'sideways')).rejects.toThrow(
      /direction/u,
    );

    const stranger = navigationSender({ back: true, forward: true }, 'https://example.com/');
    await expect(channel(HOST_NAVIGATION_CHANNELS.go)(stranger.event, 'back')).rejects.toThrow(
      /Untrusted/u,
    );
    await expect(channel(HOST_NAVIGATION_CHANNELS.read)(stranger.event, undefined)).rejects.toThrow(
      /Untrusted/u,
    );
    expect(stranger.navigationHistory.goBack).not.toHaveBeenCalled();
  });
});
