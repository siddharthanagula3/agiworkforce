import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  desktopSignInLink,
} from '@agiworkforce/local-runtime-contract';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';
import { readShellTokens } from '../shellTokens.mjs';

const shellTokens = readShellTokens(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
);
Object.assign(globalThis, {
  AGI_PAGE_INK_LIGHT: shellTokens.pageInkLight,
  AGI_PAGE_INK_DARK: shellTokens.pageInkDark,
  AGI_PAGE_SECONDARY_INK_LIGHT: shellTokens.pageSecondaryInkLight,
  AGI_PAGE_SECONDARY_INK_DARK: shellTokens.pageSecondaryInkDark,
});

const DEEP_LINK = 'agiworkforce-cloud://chat/conversation-1?nonce=nonce-abc123';
const LEGACY_SSO_LINK = 'agiworkforce-cloud://sso-callback?rotating_token_nonce=nonce-abc123';

const shell = vi.hoisted(() => ({
  ready: true,
  readyGate: null as Promise<void> | null,
  windows: [] as Array<{
    loadURL: unknown;
    webContents: { on: unknown };
  }>,
}));

const appHandlers = new Map<string, (...args: unknown[]) => void>();
const HOSTED_PAGE = 'https://agiworkforce.com/chat';
let pageUrl = HOSTED_PAGE;
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
    getURL: () => pageUrl,
    navigationHistory: { canGoBack: () => false, canGoForward: () => false },
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
    loadURL = vi.fn(async () => undefined);
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
    powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
    powerSaveBlocker: { start: vi.fn(() => 1), stop: vi.fn(), isStarted: vi.fn(() => false) },
    BrowserWindow,
    Notification: Object.assign(
      vi.fn(() => ({ on: vi.fn(), show: vi.fn() })),
      { isSupported: () => false },
    ),
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    nativeTheme: { shouldUseDarkColors: true, on: vi.fn(), off: vi.fn() },
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    app: {
      name: 'AGI Desktop',
      requestSingleInstanceLock: () => true,
      setName: vi.fn(),
      setPath: vi.fn(),
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
      setAboutPanelOptions: vi.fn(),
    },
    clipboard: { write: vi.fn(), readText: vi.fn(async () => ''), writeText: vi.fn() },
    ClipboardItem: class {},
    contextBridge: { exposeInMainWorld: vi.fn() },
    desktopCapturer: { getSources: vi.fn(async () => []) },
    dialog: {
      showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
    },
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
    ipcMain: { handle: vi.fn() },
    nativeImage: {
      createFromPath: vi.fn(() => ({ setTemplateImage: vi.fn(), isEmpty: () => true })),
    },
    net: { fetch: vi.fn(), isOnline: vi.fn(() => true) },
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

vi.mock('../tray', () => ({
  createTray: vi.fn(),
  destroyTray: vi.fn(),
  hasTray: () => false,
  refreshTrayMenu: vi.fn(),
}));
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
vi.mock('../windowPolicy', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyRemoteWindowPolicy: vi.fn(),
}));

async function bootMain() {
  pageUrl = HOSTED_PAGE;
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

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /**
   * The guarantee worth pinning is that an OAuth callback actually arrives,
   * and that the secret inside it never reaches a log.
   */
  it('delivers the callback over IPC', async () => {
    await bootMain();
    warn.mockClear();

    openUrl(DEEP_LINK);

    expect(webContentsSend).toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, DEEP_LINK);
    const warned = warn.mock.calls.flat().join(' ');
    expect(warned).not.toContain('dropped');
    expect(warned).not.toContain('nonce-abc123');
  });

  it('holds a link that arrives before the app is ready until the window exists', async () => {
    let becomeReady = () => {};
    shell.ready = false;
    shell.readyGate = new Promise<void>((resolve) => {
      becomeReady = resolve;
    });
    await bootMain();
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
    await bootMain();

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

  it('holds a link while the window shows a sign-in provider, which is not the page it is for', async () => {
    await bootMain();
    pageUrl = 'https://accounts.google.com/o/oauth2/auth';

    openUrl(DEEP_LINK);

    expect(webContentsSend).not.toHaveBeenCalled();
  });

  it('ignores URLs outside the deep-link scheme', async () => {
    await bootMain();
    warn.mockClear();

    openUrl('https://evil.example/sso-callback');

    expect(warn).not.toHaveBeenCalled();
  });

  it('opens a CLI session hand-off itself instead of handing it to the page', async () => {
    await bootMain();
    const link = 'agiworkforce-cloud://code/local/thread-1?folder=%2Fnowhere%2Fadded';

    openUrl(link);

    expect(webContentsSend).not.toHaveBeenCalledWith(ELECTRON_IPC_CHANNELS.deepLink, link);
    const loads = shell.windows.flatMap(
      (win) => (win.loadURL as ReturnType<typeof vi.fn>).mock.calls,
    );
    expect(loads.flat()).toContainEqual(expect.stringMatching(/\/code$/));
  });
});

const APP = 'https://agiworkforce.com';
const CODE = 'c'.repeat(43);

function loads(): string[] {
  return shell.windows.flatMap((win) =>
    (win.loadURL as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0])),
  );
}

function lastScreen(): string {
  const screen =
    loads()
      .filter((url) => url.startsWith('data:'))
      .at(-1) ?? '';
  return decodeURIComponent(screen.replace(/^data:text\/html;charset=utf-8,/, ''));
}

function buttonHref(html: string, index = 0): string {
  const hrefs = [...html.matchAll(/data-href="([^"]+)"/g)].map((match) =>
    (match[1] ?? '').replace(/&amp;/g, '&'),
  );
  return hrefs[index] ?? '';
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

async function requireSignIn(url: string): Promise<void> {
  const { applyRemoteWindowPolicy } = await import('../windowPolicy');
  const handlers = vi.mocked(applyRemoteWindowPolicy).mock.calls.at(-1)?.[1];
  if (!handlers) throw new Error('the main window was given no sign-in handler');
  handlers.onSignInRequired(url);
  await settle();
}

function pageEvent(event: string): (...args: unknown[]) => void {
  const on = shell.windows[0]?.webContents.on as ReturnType<typeof vi.fn>;
  const handlers = on.mock.calls
    .filter(([name]) => name === event)
    .map(([, handler]) => handler as (...args: unknown[]) => void);
  if (handlers.length === 0) throw new Error(`${event} was never followed`);
  return (...args) => {
    for (const handler of handlers) handler(...args);
  };
}

describe('browser sign-in in the window', () => {
  it('shows the shell sign-in screen where the web sign-in page would have been', async () => {
    await bootMain();
    await requireSignIn(`${APP}/login?redirectTo=%2Fchat`);

    expect(lastScreen()).toContain('Sign in to AGI');
    expect(lastScreen()).toContain('Continue in browser');
    expect(loads()).not.toContainEqual(expect.stringContaining('/login'));
  });

  it('opens the browser from the screen and finishes the sign-in the browser hands back', async () => {
    await bootMain();
    const { shell: electronShell } = await import('electron');
    await requireSignIn(`${APP}/login`);
    await requireSignIn(buttonHref(lastScreen()));

    const opened = new URL(String(vi.mocked(electronShell.openExternal).mock.calls.at(-1)?.[0]));
    expect(opened.pathname).toBe('/auth/desktop');
    expect(lastScreen()).toContain('Finish signing in in your browser');

    openUrl(desktopSignInLink(CODE, opened.searchParams.get('challenge')!));
    expect(loads().at(-1)).toMatch(new RegExp(`^${APP}/auth/desktop/complete#code=`));
  });

  it('shows a link from a sign-in started before a relaunch as expired on the screen', async () => {
    await bootMain();
    pageUrl = '';

    openUrl(desktopSignInLink(CODE, 'x'.repeat(43)));
    expect(webContentsSend).not.toHaveBeenCalledWith(DESKTOP_RUNTIME_EVENT_CHANNEL, {
      kind: 'browser-sign-in-expired',
    });
    expect(loads()).not.toContainEqual(expect.stringContaining('/auth/desktop/complete'));

    await requireSignIn(`${APP}/login?redirectTo=%2Fchat`);
    expect(lastScreen()).toContain('Sign-in link expired.');
    expect(lastScreen()).toContain('Try again');
  });

  it('lands a sign-out on the sign-in screen, not the web sign-in page', async () => {
    await bootMain();
    const { reportShellIdentity } = await import('../shellIdentity');
    reportShellIdentity({ signedIn: false, email: null });
    expect(lastScreen()).toContain('Sign in to AGI');

    const before = loads().length;
    pageEvent('did-navigate-in-page')({}, `${APP}/login`, true);
    expect(loads()).toHaveLength(before + 1);
    expect(lastScreen()).toContain('Sign in to AGI');
  });

  it('replaces a guest chat with the sign-in screen once the page says no one is signed in', async () => {
    await bootMain();
    pageUrl = `${APP}/chat`;
    const { reportShellIdentity } = await import('../shellIdentity');
    reportShellIdentity({ signedIn: false, email: null });
    expect(lastScreen()).toContain('Continue in browser');
  });

  it('sends a public page the site router reached to the browser and goes back, once', async () => {
    await bootMain();
    const { shell: electronShell } = await import('electron');
    const inPage = pageEvent('did-navigate-in-page');
    const before = loads().length;

    inPage({}, `${APP}/help`, true);
    expect(electronShell.openExternal).toHaveBeenCalledWith(`${APP}/help`);
    expect(loads().slice(before)).toEqual([`${APP}/chat`]);

    inPage({}, `${APP}/help`, true);
    inPage({}, `${APP}/help`, true);
    expect(vi.mocked(electronShell.openExternal).mock.calls).toHaveLength(1);
    expect(loads().slice(before)).toEqual([`${APP}/chat`]);
  });

  it('leaves the product and subframe navigations alone', async () => {
    await bootMain();
    const { BrowserWindow, Menu, shell: electronShell } = await import('electron');
    Object.assign(BrowserWindow, { getFocusedWindow: () => null });
    Object.assign(Menu, { setApplicationMenu: vi.fn() });
    const inPage = pageEvent('did-navigate-in-page');
    const before = loads().length;

    inPage({}, `${APP}/chat/abc`, true);
    inPage({}, `${APP}/connectors`, true);
    inPage({}, `${APP}/pricing`, false);
    expect(electronShell.openExternal).not.toHaveBeenCalled();
    expect(loads()).toHaveLength(before);
  });
});
