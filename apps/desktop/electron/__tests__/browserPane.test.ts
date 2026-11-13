import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import {
  BROWSER_PANE_TAB_LIMIT,
  BROWSER_PANE_TITLE_LIMIT,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  type BrowserPaneState,
} from '@agiworkforce/local-runtime-contract';

type Listener = (...args: never[]) => void;
type Details = Record<string, unknown>;

interface WindowOpenResponse {
  action: string;
}

const fakes = vi.hoisted(() => {
  class Emitter {
    listeners = new Map<string, Listener[]>();
    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }
    once(event: string, listener: Listener): this {
      return this.on(event, listener);
    }
    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.listeners.get(event) ?? []) {
        (listener as (...rest: unknown[]) => void)(...args);
      }
    }
  }

  class FakeImage {
    constructor(
      private readonly empty: boolean,
      private readonly size = { width: 640, height: 480 },
    ) {}
    isEmpty(): boolean {
      return this.empty;
    }
    getSize(): { width: number; height: number } {
      return this.size;
    }
    toDataURL(): string {
      return 'data:image/png;base64,AAAA';
    }
  }

  class FakeWebContents extends Emitter {
    url = '';
    destroyed = false;
    openHandler: ((details: { url: string }) => { action: string }) | null = null;
    setWindowOpenHandler = vi.fn((handler: (details: { url: string }) => { action: string }) => {
      this.openHandler = handler;
    });
    navigationHistory = {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
    };
    loadURL = vi.fn(async (url: string) => {
      this.url = url;
    });
    reload = vi.fn();
    stop = vi.fn();
    close = vi.fn(() => {
      this.destroyed = true;
    });
    capturePage = vi.fn(async () => new FakeImage(false));
    getURL(): string {
      return this.url;
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
  }

  class FakeWebContentsView {
    static created: FakeWebContentsView[] = [];
    webContents = new FakeWebContents();
    shown = true;
    bounds: { x: number; y: number; width: number; height: number } | null = null;
    setVisible = vi.fn((visible: boolean) => {
      this.shown = visible;
    });
    setBounds = vi.fn((bounds: { x: number; y: number; width: number; height: number }) => {
      this.bounds = bounds;
    });
    constructor(readonly options: { webPreferences: Record<string, unknown> }) {
      FakeWebContentsView.created.push(this);
    }
  }

  class FakeHostContents extends Emitter {
    url = 'https://agiworkforce.com/code';
    zoom = 1;
    send = vi.fn();
    getURL(): string {
      return this.url;
    }
    getZoomFactor(): number {
      return this.zoom;
    }
    isDestroyed(): boolean {
      return false;
    }
  }

  let nextWindowId = 1;
  class FakeWindow extends Emitter {
    id = nextWindowId++;
    destroyed = false;
    webContents = new FakeHostContents();
    contentView = {
      addChildView: vi.fn<(view: FakeWebContentsView) => void>(),
      removeChildView: vi.fn<(view: FakeWebContentsView) => void>(),
    };
    isDestroyed(): boolean {
      return this.destroyed;
    }
  }

  class FakeSession extends Emitter {
    permissionRequestHandler:
      | ((contents: unknown, permission: string, callback: (granted: boolean) => void) => void)
      | null = null;
    permissionCheckHandler: (() => boolean) | null = null;
    devicePermissionHandler: (() => boolean) | null = null;
    setPermissionRequestHandler = vi.fn((handler: FakeSession['permissionRequestHandler']) => {
      this.permissionRequestHandler = handler;
    });
    setPermissionCheckHandler = vi.fn((handler: () => boolean) => {
      this.permissionCheckHandler = handler;
    });
    setDevicePermissionHandler = vi.fn((handler: () => boolean) => {
      this.devicePermissionHandler = handler;
    });
    setSpellCheckerEnabled = vi.fn();
  }

  const sessions: FakeSession[] = [];
  const partitions: string[] = [];
  const fromPartition = vi.fn((partition: string) => {
    partitions.push(partition);
    const created = new FakeSession();
    sessions.push(created);
    return created;
  });
  const showsTrustedPage = vi.fn((_contents: unknown) => true);

  return {
    FakeImage,
    FakeWebContentsView,
    FakeWindow,
    fromPartition,
    partitions,
    sessions,
    showsTrustedPage,
  };
});

vi.mock('electron', () => ({
  WebContentsView: fakes.FakeWebContentsView,
  session: { fromPartition: fakes.fromPartition },
  shell: { openExternal: vi.fn() },
  app: { getPath: () => '/tmp', getVersion: () => '1.0.0' },
}));
vi.mock('../permissionPolicy', () => ({ showsTrustedPage: fakes.showsTrustedPage }));

type PaneModule = typeof import('../browserPane');
let pane: PaneModule;

const PAGE = 'http://localhost:5173/';
const REMOTE = 'https://example.com/docs';

type HostWindow = InstanceType<typeof fakes.FakeWindow>;

function makeWindow(): HostWindow {
  return new fakes.FakeWindow();
}

const asWindow = (window: HostWindow): BrowserWindow => window as unknown as BrowserWindow;

function views() {
  return fakes.FakeWebContentsView.created;
}

function lastView() {
  const view = views().at(-1);
  if (!view) throw new Error('no view was created');
  return view;
}

function activeTabOf(state: BrowserPaneState) {
  const tab = state.tabs.find((entry) => entry.id === state.activeTabId);
  if (!tab) throw new Error('no active tab');
  return tab;
}

function reasonOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return (error as { reason?: string }).reason ?? 'no-reason';
  }
  return 'did-not-throw';
}

async function reasonOfAsync(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return (error as { reason?: string }).reason ?? 'no-reason';
  }
  return 'did-not-throw';
}

function openAt(window: HostWindow, paneId: string, url?: string) {
  const state = pane.openBrowserPaneTab(asWindow(window), paneId, url);
  return { state, view: lastView() };
}

function sentStates(window: HostWindow): BrowserPaneState[] {
  return window.webContents.send.mock.calls
    .filter(([channel, event]) => {
      return (
        channel === DESKTOP_RUNTIME_EVENT_CHANNEL &&
        (event as Details)['kind'] === 'browser-pane-changed'
      );
    })
    .map(([, event]) => (event as { state: BrowserPaneState }).state);
}

beforeEach(async () => {
  vi.resetModules();
  fakes.FakeWebContentsView.created.length = 0;
  fakes.partitions.length = 0;
  fakes.sessions.length = 0;
  fakes.fromPartition.mockClear();
  fakes.showsTrustedPage.mockReset();
  fakes.showsTrustedPage.mockReturnValue(true);
  pane = await import('../browserPane');
});

describe('the session pages in the pane run in', () => {
  it('is an in-memory partition of its own, shared by every tab', () => {
    const window = makeWindow();
    openAt(window, 'code');
    openAt(window, 'code');

    expect(fakes.partitions).toHaveLength(1);
    expect(fakes.partitions[0]).toMatch(/^[a-z0-9-]+$/);
    expect(fakes.partitions[0]?.startsWith('persist:')).toBe(false);
    expect(views()).toHaveLength(2);
    for (const view of views()) {
      expect(view.options.webPreferences['session']).toBe(fakes.sessions[0]);
    }
  });

  it('refuses every permission request and check, and every device', () => {
    openAt(makeWindow(), 'code');
    const [created] = fakes.sessions;
    if (!created) throw new Error('no session');

    for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read']) {
      const callback = vi.fn();
      created.permissionRequestHandler?.({}, permission, callback);
      expect(callback, permission).toHaveBeenCalledWith(false);
    }
    expect(created.permissionCheckHandler?.()).toBe(false);
    expect(created.devicePermissionHandler?.()).toBe(false);
    expect(created.setSpellCheckerEnabled).toHaveBeenCalledWith(false);
  });

  it('prevents a download and tells the person it was refused', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    const [created] = fakes.sessions;
    const event = { preventDefault: vi.fn() };

    created?.emit('will-download', event, {}, view.webContents);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(sentStates(window).at(-1)?.notice).toMatch(/downloads are off/i);
  });

  it('prevents a download that belongs to no pane without telling anyone', () => {
    const window = makeWindow();
    openAt(window, 'code');
    const event = { preventDefault: vi.fn() };

    fakes.sessions[0]?.emit('will-download', event, {}, { unknown: true });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(sentStates(window)).toHaveLength(0);
  });
});

describe('the view of a tab', () => {
  it('is sandboxed, isolated, without node or a preload, in the pane session', () => {
    openAt(makeWindow(), 'code');
    const { webPreferences } = lastView().options;

    expect(webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      devTools: false,
    });
    expect(webPreferences['preload']).toBeUndefined();
    expect(webPreferences['session']).toBe(fakes.sessions[0]);
  });

  it('is added to the window hidden until the pane is laid out', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code');

    expect(window.contentView.addChildView).toHaveBeenCalledWith(view);
    expect(view.setVisible).toHaveBeenCalledWith(false);
  });
});

describe('opening an address in the pane', () => {
  it('refuses what is not an http or https address, and loads nothing', async () => {
    const window = makeWindow();
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'mailto:a@b.c',
      'ftp://example.com/x',
      'http://user:pass@example.com/',
      'https://user@example.com/',
      'not an address',
      '',
    ]) {
      expect(
        reasonOf(() => pane.navigateBrowserPane(asWindow(window), 'code', url)),
        url,
      ).toBe('invalid');
      expect(
        reasonOf(() => pane.openBrowserPaneTab(asWindow(window), 'code', url)),
        url,
      ).toBe('invalid');
    }

    expect(views()).toHaveLength(0);
    expect(pane.browserPaneState(asWindow(window), 'code').tabs).toEqual([]);
  });

  it('loads an http or https address into a first tab it makes', () => {
    const window = makeWindow();
    const state = pane.navigateBrowserPane(asWindow(window), 'code', REMOTE);

    expect(views()).toHaveLength(1);
    expect(lastView().webContents.loadURL).toHaveBeenCalledWith(REMOTE);
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
    expect(state.tabs[0]).toMatchObject({ url: REMOTE, loading: true, local: false });
  });

  it('loads into the active tab again rather than opening another', () => {
    const window = makeWindow();
    pane.navigateBrowserPane(asWindow(window), 'code', REMOTE);
    pane.navigateBrowserPane(asWindow(window), 'code', 'https://example.org/');

    expect(views()).toHaveLength(1);
    expect(lastView().webContents.loadURL).toHaveBeenLastCalledWith('https://example.org/');
  });

  it('opens 0.0.0.0 as localhost', () => {
    const window = makeWindow();
    pane.navigateBrowserPane(asWindow(window), 'code', 'http://0.0.0.0:5173/');

    expect(lastView().webContents.loadURL).toHaveBeenCalledWith(PAGE);
  });

  it('opens a new tab blank, or on an address, and makes it the active one', () => {
    const window = makeWindow();
    const blank = openAt(window, 'code');
    expect(blank.view.webContents.loadURL).not.toHaveBeenCalled();
    expect(blank.state.tabs[0]).toMatchObject({ url: '', local: false });

    const loaded = openAt(window, 'code', PAGE);
    expect(loaded.view.webContents.loadURL).toHaveBeenCalledWith(PAGE);
    expect(loaded.state.tabs).toHaveLength(2);
    expect(loaded.state.activeTabId).toBe(loaded.state.tabs[1]?.id);
    expect(loaded.state.tabs[1]).toMatchObject({ local: true });
  });

  it('refuses a tab past the limit', () => {
    const window = makeWindow();
    for (let index = 0; index < BROWSER_PANE_TAB_LIMIT; index += 1) openAt(window, 'code');

    expect(reasonOf(() => pane.openBrowserPaneTab(asWindow(window), 'code'))).toBe('limit');
    expect(views()).toHaveLength(BROWSER_PANE_TAB_LIMIT);
  });

  it('refuses a pane identifier that is not a short identifier, and a missing window', () => {
    const window = makeWindow();
    for (const paneId of ['', 'has space', '../x', 'a'.repeat(81), 'x/y']) {
      expect(
        reasonOf(() => pane.openBrowserPaneTab(asWindow(window), paneId)),
        paneId,
      ).toBe('invalid');
    }
    expect(reasonOf(() => pane.openBrowserPaneTab(null, 'code'))).toBe('unavailable');
    const gone = makeWindow();
    gone.destroyed = true;
    expect(reasonOf(() => pane.openBrowserPaneTab(asWindow(gone), 'code'))).toBe('unavailable');
  });
});

describe('what the page in a tab may navigate to', () => {
  function openPage() {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    return { window, contents: view.webContents };
  }

  it.each(['will-navigate', 'will-redirect'])(
    'prevents %s to a file, a mail link or a custom scheme, and says so',
    (event) => {
      const { window, contents } = openPage();
      for (const url of [
        'file:///etc/passwd',
        'mailto:a@b.c',
        'myapp://open?x=1',
        'javascript:1',
      ]) {
        const prevented = { preventDefault: vi.fn() };
        contents.emit(event, prevented, url);
        expect(prevented.preventDefault, `${event} ${url}`).toHaveBeenCalledOnce();
      }
      expect(sentStates(window).at(-1)?.notice).toMatch(/not a web address/i);
    },
  );

  it.each(['will-navigate', 'will-redirect'])('allows %s to http and https', (event) => {
    const { contents } = openPage();
    for (const url of ['https://example.org/', 'http://localhost:3000/a?b=1']) {
      const allowed = { preventDefault: vi.fn() };
      contents.emit(event, allowed, url);
      expect(allowed.preventDefault, `${event} ${url}`).not.toHaveBeenCalled();
    }
  });

  it.each(['will-navigate', 'will-redirect'])(
    'prevents %s to an address with credentials',
    (event) => {
      const { contents } = openPage();
      const prevented = { preventDefault: vi.fn() };
      contents.emit(event, prevented, 'https://user:pass@example.org/');
      expect(prevented.preventDefault).toHaveBeenCalledOnce();
    },
  );

  it('prevents a sub-frame from loading a file or a custom scheme', () => {
    const { contents } = openPage();
    for (const url of [
      'file:///etc/passwd',
      'myapp://open',
      'javascript:1',
      'ftp://example.com/',
    ]) {
      const prevented = { preventDefault: vi.fn(), isMainFrame: false, url };
      contents.emit('will-frame-navigate', prevented);
      expect(prevented.preventDefault, url).toHaveBeenCalledOnce();
    }
  });

  it('lets a sub-frame load about:blank, blob:, data:, http and https', () => {
    const { contents } = openPage();
    for (const url of [
      'about:blank',
      'blob:https://example.com/1b2c',
      'data:text/html,<p>x</p>',
      'https://example.org/frame',
      'http://localhost:3000/frame',
    ]) {
      const allowed = { preventDefault: vi.fn(), isMainFrame: false, url };
      contents.emit('will-frame-navigate', allowed);
      expect(allowed.preventDefault, url).not.toHaveBeenCalled();
    }
  });

  it('prevents a sub-frame address that does not parse', () => {
    const { contents } = openPage();
    const prevented = { preventDefault: vi.fn(), isMainFrame: false, url: 'not a url' };
    contents.emit('will-frame-navigate', prevented);
    expect(prevented.preventDefault).toHaveBeenCalledOnce();
  });

  it('refuses a client certificate rather than offering one from the keychain', () => {
    const { contents } = openPage();
    const event = { preventDefault: vi.fn() };
    const callback = vi.fn();

    contents.emit('select-client-certificate', event, 'https://example.com', [{}], callback);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith();
  });
});

describe('a page that opens a window', () => {
  function openPage() {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    return { window, view, open: (url: string) => view.webContents.openHandler?.({ url }) };
  }

  it('opens an http or https address in a new tab of the pane and denies the window', () => {
    const { window, open } = openPage();

    expect(open('https://example.org/next')).toEqual({ action: 'deny' });

    expect(views()).toHaveLength(2);
    expect(lastView().webContents.loadURL).toHaveBeenCalledWith('https://example.org/next');
    const state = pane.browserPaneState(asWindow(window), 'code');
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(state.tabs[1]?.id);
    expect(sentStates(window).at(-1)?.tabs).toHaveLength(2);
  });

  it('opens nothing for any other address, and denies the window', () => {
    const { window, open } = openPage();

    for (const url of [
      'file:///etc/passwd',
      'javascript:1',
      'myapp://x',
      'https://u:p@example.org/',
    ]) {
      expect(open(url), url).toEqual({ action: 'deny' });
    }

    expect(views()).toHaveLength(1);
    expect(pane.browserPaneState(asWindow(window), 'code').tabs).toHaveLength(1);
    expect(sentStates(window).at(-1)?.notice).toMatch(/not a web address/i);
  });

  it('opens nothing past the tab limit, and says why', () => {
    const { window, open } = openPage();
    for (let index = 1; index < BROWSER_PANE_TAB_LIMIT; index += 1) openAt(window, 'code');
    expect(views()).toHaveLength(BROWSER_PANE_TAB_LIMIT);

    expect(open('https://example.org/next')).toEqual({ action: 'deny' });

    expect(views()).toHaveLength(BROWSER_PANE_TAB_LIMIT);
    expect(sentStates(window).at(-1)?.notice).toContain(String(BROWSER_PANE_TAB_LIMIT));
  });
});

describe('where the pane is drawn', () => {
  const bounds = { x: 10, y: 20, width: 200, height: 100 };

  it('multiplies the bounds by the zoom of the window that holds the pane', () => {
    const window = makeWindow();
    window.webContents.zoom = 1.5;
    const { view } = openAt(window, 'code', REMOTE);

    expect(pane.layoutBrowserPane(asWindow(window), 'code', bounds, true)).toBe(true);

    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 15, y: 30, width: 300, height: 150 });
    expect(view.shown).toBe(true);
  });

  it('shows only the active tab', () => {
    const window = makeWindow();
    const first = openAt(window, 'code', REMOTE);
    const second = openAt(window, 'code', PAGE);
    pane.layoutBrowserPane(asWindow(window), 'code', bounds, true);

    expect(first.view.shown).toBe(false);
    expect(second.view.shown).toBe(true);
    expect(first.view.setBounds).not.toHaveBeenCalled();

    const state = pane.browserPaneState(asWindow(window), 'code');
    pane.selectBrowserPaneTab(asWindow(window), 'code', state.tabs[0]?.id ?? '');

    expect(first.view.shown).toBe(true);
    expect(second.view.shown).toBe(false);
    expect(first.view.setBounds).toHaveBeenLastCalledWith(bounds);
  });

  it('hides every tab when the pane is not visible', () => {
    const window = makeWindow();
    const first = openAt(window, 'code', REMOTE);
    const second = openAt(window, 'code', PAGE);
    pane.layoutBrowserPane(asWindow(window), 'code', bounds, true);

    expect(pane.layoutBrowserPane(asWindow(window), 'code', bounds, false)).toBe(true);

    expect(first.view.shown).toBe(false);
    expect(second.view.shown).toBe(false);
  });

  it('hides the view of a pane with no size', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);

    pane.layoutBrowserPane(asWindow(window), 'code', bounds, true);
    expect(view.shown).toBe(true);
    pane.layoutBrowserPane(asWindow(window), 'code', { ...bounds, width: 0 }, true);
    expect(view.shown).toBe(false);
    pane.layoutBrowserPane(asWindow(window), 'code', bounds, true);
    pane.layoutBrowserPane(asWindow(window), 'code', { ...bounds, height: 0 }, true);
    expect(view.shown).toBe(false);
  });

  it('does not make a pane just to hide it', () => {
    const window = makeWindow();

    expect(pane.layoutBrowserPane(asWindow(window), 'code', bounds, false)).toBe(false);
    expect(pane.browserPaneState(asWindow(window), 'code')).toEqual({
      tabs: [],
      activeTabId: null,
      notice: null,
    });
  });

  it('keeps the bounds it was given for a tab opened after the layout', () => {
    const window = makeWindow();
    openAt(window, 'code', REMOTE);
    pane.layoutBrowserPane(asWindow(window), 'code', bounds, true);

    const { view } = openAt(window, 'code', PAGE);

    expect(view.shown).toBe(true);
    expect(view.setBounds).toHaveBeenLastCalledWith(bounds);
  });
});

describe('closing tabs and panes', () => {
  function threeTabs() {
    const window = makeWindow();
    const first = openAt(window, 'code', 'https://a.example/');
    const second = openAt(window, 'code', 'https://b.example/');
    const third = openAt(window, 'code', 'https://c.example/');
    const state = pane.browserPaneState(asWindow(window), 'code');
    return {
      window,
      views: [first.view, second.view, third.view],
      ids: state.tabs.map((t) => t.id),
    };
  }

  it('removes the view and closes the page of the tab', () => {
    const {
      window,
      views: [first],
    } = threeTabs();
    const ids = pane.browserPaneState(asWindow(window), 'code').tabs.map((tab) => tab.id);

    const state = pane.closeBrowserPaneTab(asWindow(window), 'code', ids[0] ?? '');

    expect(window.contentView.removeChildView).toHaveBeenCalledWith(first);
    expect(first?.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false });
    expect(state.tabs.map((tab) => tab.id)).toEqual(ids.slice(1));
  });

  it('selects the tab after the one closed, or the one before when it was last', () => {
    const { window, ids } = threeTabs();

    pane.selectBrowserPaneTab(asWindow(window), 'code', ids[1] ?? '');
    let state = pane.closeBrowserPaneTab(asWindow(window), 'code', ids[1] ?? '');
    expect(state.activeTabId).toBe(ids[2]);

    state = pane.closeBrowserPaneTab(asWindow(window), 'code', ids[2] ?? '');
    expect(state.activeTabId).toBe(ids[0]);

    state = pane.closeBrowserPaneTab(asWindow(window), 'code', ids[0] ?? '');
    expect(state).toEqual({ tabs: [], activeTabId: null, notice: null });
  });

  it('keeps the active tab when another one is closed', () => {
    const { window, ids } = threeTabs();

    const state = pane.closeBrowserPaneTab(asWindow(window), 'code', ids[0] ?? '');

    expect(state.activeTabId).toBe(ids[2]);
  });

  it('shows the neighbour that was selected when the visible tab closes', () => {
    const {
      window,
      views: [first, second, third],
      ids,
    } = threeTabs();
    pane.layoutBrowserPane(asWindow(window), 'code', { x: 0, y: 0, width: 50, height: 50 }, true);
    expect(third?.shown).toBe(true);

    pane.closeBrowserPaneTab(asWindow(window), 'code', ids[2] ?? '');

    expect(second?.shown).toBe(true);
    expect(first?.shown).toBe(false);
  });

  it('refuses a tab that is not open, and answers an unknown pane with an empty state', () => {
    const { window } = threeTabs();

    expect(reasonOf(() => pane.closeBrowserPaneTab(asWindow(window), 'code', 'nope'))).toBe(
      'not-found',
    );
    expect(reasonOf(() => pane.selectBrowserPaneTab(asWindow(window), 'code', 'nope'))).toBe(
      'not-found',
    );
    expect(pane.closeBrowserPaneTab(asWindow(window), 'other', 'nope')).toEqual({
      tabs: [],
      activeTabId: null,
      notice: null,
    });
  });

  it('removes every view of a pane that is closed, and forgets the pane', () => {
    const { window, views: all } = threeTabs();

    expect(pane.closeBrowserPane(asWindow(window), 'code')).toBe(true);

    for (const view of all) {
      expect(window.contentView.removeChildView).toHaveBeenCalledWith(view);
      expect(view.webContents.close).toHaveBeenCalledOnce();
    }
    expect(pane.browserPaneState(asWindow(window), 'code').tabs).toEqual([]);
    expect(pane.closeBrowserPane(asWindow(window), 'code')).toBe(false);
  });

  it('removes everything in every window when all panes are closed', () => {
    const one = makeWindow();
    const two = makeWindow();
    openAt(one, 'code');
    openAt(one, 'docs');
    openAt(two, 'code');

    pane.closeAllBrowserPanes();

    expect(views().every((view) => view.webContents.destroyed)).toBe(true);
    expect(one.contentView.removeChildView).toHaveBeenCalledTimes(2);
    expect(two.contentView.removeChildView).toHaveBeenCalledTimes(1);
    expect(pane.browserPaneState(asWindow(one), 'code').tabs).toEqual([]);
    expect(pane.browserPaneState(asWindow(two), 'code').tabs).toEqual([]);
  });
});

describe('when the window that holds the pane goes away', () => {
  it('closes its panes when the window navigates to another page', () => {
    const window = makeWindow();
    const other = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    openAt(other, 'code', REMOTE);

    window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });

    expect(view.webContents.close).toHaveBeenCalledOnce();
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(pane.browserPaneState(asWindow(window), 'code').tabs).toEqual([]);
    expect(pane.browserPaneState(asWindow(other), 'code').tabs).toHaveLength(1);
  });

  it('keeps its panes through a same-document or sub-frame navigation', () => {
    const window = makeWindow();
    openAt(window, 'code', REMOTE);

    window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    window.webContents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });

    expect(pane.browserPaneState(asWindow(window), 'code').tabs).toHaveLength(1);
  });

  it('closes its panes when the window closes, and leaves other windows alone', () => {
    const window = makeWindow();
    const other = makeWindow();
    openAt(window, 'code', REMOTE);
    openAt(window, 'docs', REMOTE);
    openAt(other, 'code', REMOTE);

    window.emit('closed');

    expect(pane.browserPaneState(asWindow(window), 'code').tabs).toEqual([]);
    expect(pane.browserPaneState(asWindow(window), 'docs').tabs).toEqual([]);
    expect(pane.browserPaneState(asWindow(other), 'code').tabs).toHaveLength(1);
  });

  it('does not touch a view of a window that is already destroyed', () => {
    const window = makeWindow();
    openAt(window, 'code', REMOTE);
    window.destroyed = true;

    window.emit('closed');

    expect(window.contentView.removeChildView).not.toHaveBeenCalled();
    expect(lastView().webContents.close).toHaveBeenCalledOnce();
  });

  it('closes its panes when the page of the window stops working', () => {
    const window = makeWindow();
    openAt(window, 'code', REMOTE);

    window.webContents.emit('render-process-gone', {}, { reason: 'crashed' });

    expect(pane.browserPaneState(asWindow(window), 'code').tabs).toEqual([]);
  });

  it('watches a window once however many panes it holds', () => {
    const window = makeWindow();
    openAt(window, 'code');
    openAt(window, 'docs');

    expect(window.webContents.listeners.get('did-start-navigation')).toHaveLength(1);
    expect(window.listeners.get('closed')).toHaveLength(1);
  });
});

describe('how many panes a window holds', () => {
  it('evicts the stalest pane that is hidden when a fourth is opened', () => {
    const window = makeWindow();
    const shown = openAt(window, 'one', REMOTE);
    pane.layoutBrowserPane(asWindow(window), 'one', { x: 0, y: 0, width: 10, height: 10 }, true);
    const stale = openAt(window, 'two', REMOTE);
    const recent = openAt(window, 'three', REMOTE);

    openAt(window, 'four', REMOTE);

    expect(stale.view.webContents.close).toHaveBeenCalledOnce();
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(stale.view);
    expect(pane.browserPaneState(asWindow(window), 'two').tabs).toEqual([]);
    expect(pane.browserPaneState(asWindow(window), 'one').tabs).toHaveLength(1);
    expect(pane.browserPaneState(asWindow(window), 'three').tabs).toHaveLength(1);
    expect(pane.browserPaneState(asWindow(window), 'four').tabs).toHaveLength(1);
    expect(shown.view.webContents.close).not.toHaveBeenCalled();
    expect(recent.view.webContents.close).not.toHaveBeenCalled();
  });

  it('counts a pane as recent when it is used again', () => {
    const window = makeWindow();
    const first = openAt(window, 'one', REMOTE);
    const second = openAt(window, 'two', REMOTE);
    openAt(window, 'three', REMOTE);
    openAt(window, 'one');

    openAt(window, 'four', REMOTE);

    expect(second.view.webContents.close).toHaveBeenCalledOnce();
    expect(first.view.webContents.close).not.toHaveBeenCalled();
  });

  it('counts panes of each window separately', () => {
    const one = makeWindow();
    const two = makeWindow();
    for (const id of ['a', 'b', 'c']) openAt(one, id);
    for (const id of ['a', 'b', 'c']) openAt(two, id);

    expect(views().some((view) => view.webContents.destroyed)).toBe(false);
  });
});

describe('what the pane tells the window', () => {
  it('sends the state to the window that holds the pane, and to no other', () => {
    const window = makeWindow();
    const other = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    openAt(other, 'code', REMOTE);

    view.webContents.emit('page-title-updated', {}, 'Docs');

    expect(sentStates(other)).toEqual([]);
    expect(window.webContents.send).toHaveBeenLastCalledWith(DESKTOP_RUNTIME_EVENT_CHANNEL, {
      kind: 'browser-pane-changed',
      paneId: 'code',
      state: expect.objectContaining({ tabs: [expect.objectContaining({ title: 'Docs' })] }),
    });
  });

  it('sends nothing while the window shows a page that is not the app', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    fakes.showsTrustedPage.mockReturnValue(false);

    view.webContents.emit('page-title-updated', {}, 'Docs');
    view.webContents.emit('did-start-loading');

    expect(window.webContents.send).not.toHaveBeenCalled();
    expect(fakes.showsTrustedPage).toHaveBeenCalledWith(window.webContents);
  });

  it('sends nothing to a destroyed window', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    window.destroyed = true;

    view.webContents.emit('did-stop-loading');

    expect(window.webContents.send).not.toHaveBeenCalled();
  });

  it('reports a tab as the page does: title, address, loading, and whether it is local', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', PAGE);
    view.webContents.navigationHistory.canGoBack.mockReturnValue(true);
    view.webContents.emit('page-title-updated', {}, 'x'.repeat(BROWSER_PANE_TITLE_LIMIT + 50));
    view.webContents.emit('did-stop-loading');

    const tab = activeTabOf(pane.browserPaneState(asWindow(window), 'code'));

    expect(tab).toMatchObject({
      url: PAGE,
      loading: false,
      canGoBack: true,
      canGoForward: false,
      local: true,
      failure: null,
    });
    expect(tab.title).toHaveLength(BROWSER_PANE_TITLE_LIMIT);
  });

  it('falls back to the address for a title, and shows no address for a blank page', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);

    expect(activeTabOf(pane.browserPaneState(asWindow(window), 'code')).title).toBe(REMOTE);

    view.webContents.url = 'about:blank';
    expect(activeTabOf(pane.browserPaneState(asWindow(window), 'code'))).toMatchObject({
      url: '',
      title: '',
    });
  });

  it('says why a page did not load, and forgets it when the next page does', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', PAGE);
    const contents = view.webContents;

    contents.emit('did-fail-load', {}, -3, 'aborted', PAGE, true);
    contents.emit('did-fail-load', {}, -105, 'name not resolved', 'https://ads.example/x', false);
    expect(activeTabOf(pane.browserPaneState(asWindow(window), 'code')).failure).toBeNull();

    contents.emit('did-fail-load', {}, -102, 'refused', PAGE, true);
    const local = activeTabOf(pane.browserPaneState(asWindow(window), 'code'));
    expect(local.failure).toContain(PAGE);
    expect(local.loading).toBe(false);

    contents.emit('did-fail-load', {}, -105, 'not resolved', REMOTE, true);
    expect(activeTabOf(pane.browserPaneState(asWindow(window), 'code')).failure).toContain(REMOTE);

    contents.emit('did-navigate');
    expect(activeTabOf(pane.browserPaneState(asWindow(window), 'code')).failure).toBeNull();
  });

  it('says a page stopped working, and that it can be reloaded', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);

    view.webContents.emit('render-process-gone', {}, { reason: 'crashed' });

    const tab = activeTabOf(pane.browserPaneState(asWindow(window), 'code'));
    expect(tab.failure).toMatch(/stopped working/i);
    expect(tab.loading).toBe(false);
  });

  it('clears the last notice when something loads', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    view.webContents.emit('will-navigate', { preventDefault: vi.fn() }, 'file:///x');
    expect(pane.browserPaneState(asWindow(window), 'code').notice).not.toBeNull();

    pane.navigateBrowserPane(asWindow(window), 'code', 'https://example.org/');

    expect(pane.browserPaneState(asWindow(window), 'code').notice).toBeNull();
  });
});

describe('history in a tab', () => {
  function openPage() {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    return { window, contents: view.webContents };
  }

  it('goes back and forward only where there is somewhere to go', () => {
    const { window, contents } = openPage();

    pane.moveBrowserPaneHistory(asWindow(window), 'code', 'back');
    pane.moveBrowserPaneHistory(asWindow(window), 'code', 'forward');
    expect(contents.navigationHistory.goBack).not.toHaveBeenCalled();
    expect(contents.navigationHistory.goForward).not.toHaveBeenCalled();

    contents.navigationHistory.canGoBack.mockReturnValue(true);
    contents.navigationHistory.canGoForward.mockReturnValue(true);
    pane.moveBrowserPaneHistory(asWindow(window), 'code', 'back');
    pane.moveBrowserPaneHistory(asWindow(window), 'code', 'forward');
    expect(contents.navigationHistory.goBack).toHaveBeenCalledOnce();
    expect(contents.navigationHistory.goForward).toHaveBeenCalledOnce();
  });

  it('reloads a page that is open, not a blank tab, and clears what failed', () => {
    const { window, contents } = openPage();
    contents.emit('did-fail-load', {}, -102, 'refused', REMOTE, true);

    pane.moveBrowserPaneHistory(asWindow(window), 'code', 'reload');

    expect(contents.reload).toHaveBeenCalledOnce();
    expect(activeTabOf(pane.browserPaneState(asWindow(window), 'code')).failure).toBeNull();

    contents.url = '';
    pane.moveBrowserPaneHistory(asWindow(window), 'code', 'reload');
    expect(contents.reload).toHaveBeenCalledOnce();
  });

  it('stops loading', () => {
    const { window, contents } = openPage();

    pane.moveBrowserPaneHistory(asWindow(window), 'code', 'stop');

    expect(contents.stop).toHaveBeenCalledOnce();
  });

  it('answers an unknown pane with an empty state', () => {
    expect(pane.moveBrowserPaneHistory(asWindow(makeWindow()), 'code', 'reload').tabs).toEqual([]);
  });
});

describe('capturing the page', () => {
  it('refuses when no pane or no page is open', async () => {
    const window = makeWindow();
    expect(await reasonOfAsync(() => pane.captureBrowserPane(asWindow(window), 'code'))).toBe(
      'not-found',
    );

    openAt(window, 'code');
    expect(await reasonOfAsync(() => pane.captureBrowserPane(asWindow(window), 'code'))).toBe(
      'not-found',
    );
    expect(lastView().webContents.capturePage).not.toHaveBeenCalled();
  });

  it('refuses when the image is empty', async () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    view.webContents.capturePage.mockResolvedValueOnce(new fakes.FakeImage(true));

    expect(await reasonOfAsync(() => pane.captureBrowserPane(asWindow(window), 'code'))).toBe(
      'unavailable',
    );
  });

  it('refuses when the window has nothing drawn to capture', async () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', REMOTE);
    view.webContents.capturePage.mockRejectedValueOnce(
      new Error('Current display surface not available for capture'),
    );

    expect(await reasonOfAsync(() => pane.captureBrowserPane(asWindow(window), 'code'))).toBe(
      'unavailable',
    );
  });

  it('returns the image, its size and the address it shows', async () => {
    const window = makeWindow();
    openAt(window, 'code', REMOTE);

    expect(await pane.captureBrowserPane(asWindow(window), 'code')).toEqual({
      dataUrl: 'data:image/png;base64,AAAA',
      width: 640,
      height: 480,
      url: REMOTE,
    });
  });
});

describe('reading the errors of a local page in the pane', () => {
  const fail = (contents: { emit(event: string, ...args: unknown[]): void }, message: string) =>
    contents.emit('console-message', { level: 'error', message, sourceId: '', lineNumber: 0 });

  it('reports nothing and no page while no local page is open', () => {
    expect(pane.readBrowserPaneConsoleErrors(false)).toEqual({ url: null, errors: [], dropped: 0 });

    openAt(makeWindow(), 'code', REMOTE);
    expect(pane.readBrowserPaneConsoleErrors(false)).toEqual({ url: null, errors: [], dropped: 0 });
  });

  it('keeps console errors and a crashed page, and ignores other console levels', () => {
    const { view } = openAt(makeWindow(), 'code', PAGE);
    const contents = view.webContents;
    contents.emit('console-message', {
      level: 'error',
      message: 'Uncaught ReferenceError: foo is not defined',
      sourceId: `${PAGE}src/main.ts`,
      lineNumber: 4,
    });
    for (const level of ['warning', 'info', 'debug']) {
      contents.emit('console-message', { level, message: level, sourceId: '', lineNumber: 1 });
    }
    contents.emit('render-process-gone', {}, { reason: 'crashed' });

    const report = pane.readBrowserPaneConsoleErrors(false);

    expect(report.url).toBe(PAGE);
    expect(report.errors.map((error) => error.message)).toEqual([
      'Uncaught ReferenceError: foo is not defined',
      'The preview page stopped (crashed).',
    ]);
    expect(report.errors[0]).toMatchObject({ source: `${PAGE}src/main.ts`, line: 4 });
  });

  it('records nothing for a page that is not served on this computer', () => {
    const { view } = openAt(makeWindow(), 'code', REMOTE);
    fail(view.webContents, 'from a stranger');

    view.webContents.url = PAGE;
    expect(pane.readBrowserPaneConsoleErrors(false)).toEqual({ url: PAGE, errors: [], dropped: 0 });
  });

  it('forgets errors once they are read with clear, and when the page loads again', () => {
    const { view } = openAt(makeWindow(), 'code', PAGE);
    const contents = view.webContents;

    fail(contents, 'first');
    expect(pane.readBrowserPaneConsoleErrors(true).errors).toHaveLength(1);
    expect(pane.readBrowserPaneConsoleErrors(false).errors).toHaveLength(0);

    fail(contents, 'second');
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    expect(pane.readBrowserPaneConsoleErrors(false).errors).toHaveLength(1);
    contents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
    expect(pane.readBrowserPaneConsoleErrors(false).errors).toHaveLength(1);
    contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    expect(pane.readBrowserPaneConsoleErrors(false).errors).toHaveLength(0);
  });

  it('reads and clears nothing for a server other than the one asked about', () => {
    const { view } = openAt(makeWindow(), 'code', PAGE);
    fail(view.webContents, 'mine');

    expect(pane.readBrowserPaneConsoleErrors(true, 'http://localhost:3000')).toEqual({
      url: PAGE,
      errors: [],
      dropped: 0,
    });
    expect(pane.readBrowserPaneConsoleErrors(false).errors).toHaveLength(1);

    expect(pane.readBrowserPaneConsoleErrors(true, 'http://localhost:5173').errors).toHaveLength(1);
    expect(pane.readBrowserPaneConsoleErrors(false).errors).toHaveLength(0);
  });

  it('answers with the local page looked at last, and with the one asked about by origin', () => {
    const window = makeWindow();
    const older = openAt(window, 'code', PAGE);
    const newer = openAt(window, 'code', 'http://localhost:3000/');
    fail(older.view.webContents, 'from 5173');
    fail(newer.view.webContents, 'from 3000');

    expect(pane.readBrowserPaneConsoleErrors(false).url).toBe('http://localhost:3000/');
    expect(pane.readBrowserPaneConsoleErrors(false).errors[0]?.message).toBe('from 3000');
    expect(
      pane.readBrowserPaneConsoleErrors(false, 'http://localhost:5173').errors[0]?.message,
    ).toBe('from 5173');

    const state = pane.browserPaneState(asWindow(window), 'code');
    pane.selectBrowserPaneTab(asWindow(window), 'code', state.tabs[0]?.id ?? '');
    expect(pane.readBrowserPaneConsoleErrors(false).errors[0]?.message).toBe('from 5173');
  });

  it('drops what it held when the pane closes', () => {
    const window = makeWindow();
    const { view } = openAt(window, 'code', PAGE);
    fail(view.webContents, 'late');

    pane.closeBrowserPane(asWindow(window), 'code');

    expect(pane.readBrowserPaneConsoleErrors(false)).toEqual({ url: null, errors: [], dropped: 0 });
  });
});
