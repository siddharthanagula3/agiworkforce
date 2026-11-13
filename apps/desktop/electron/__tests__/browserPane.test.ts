import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const userData = { dir: '' };
const showMessageBox = vi.fn();
const sessionHandlers: Record<string, unknown> = {};
const views: FakeView[] = [];

class FakeContents {
  url = '';
  title = '';
  destroyed = false;
  listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  openHandler: ((details: { url: string }) => { action: string }) | null = null;
  loadURL = vi.fn(async (url: string) => {
    this.url = url;
    this.entries.push(url);
  });
  reload = vi.fn();
  entries: string[] = [];
  navigationHistory = {
    canGoBack: () => this.entries.length > 1,
    canGoForward: () => false,
    goBack: vi.fn(),
    goForward: vi.fn(),
    getActiveIndex: () => this.entries.length - 1,
    getEntryAtIndex: (index: number) =>
      this.entries[index] === undefined ? null : { url: this.entries[index] },
  };
  on(name: string, listener: (...args: unknown[]) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  emit(name: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(name) ?? []) listener(...args);
  }
  setWindowOpenHandler(handler: (details: { url: string }) => { action: string }) {
    this.openHandler = handler;
  }
  getURL() {
    return this.url;
  }
  getTitle() {
    return this.title;
  }
  isLoading() {
    return false;
  }
  isDestroyed() {
    return this.destroyed;
  }
  close() {
    this.destroyed = true;
  }
}

class FakeView {
  webContents = new FakeContents();
  bounds: unknown = null;
  visible = true;
  constructor(public options: unknown) {
    views.push(this);
  }
  setBounds(bounds: unknown) {
    this.bounds = bounds;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
  }
}

vi.mock('electron', () => ({
  app: { getPath: () => userData.dir },
  dialog: { showMessageBox: (...args: unknown[]) => showMessageBox(...args) },
  session: {
    fromPartition: () => ({
      setPermissionRequestHandler: (handler: unknown) => (sessionHandlers['request'] = handler),
      setPermissionCheckHandler: (handler: unknown) => (sessionHandlers['check'] = handler),
      setDevicePermissionHandler: (handler: unknown) => (sessionHandlers['device'] = handler),
      setDisplayMediaRequestHandler: (handler: unknown) => (sessionHandlers['display'] = handler),
      webRequest: {
        onBeforeRequest: (handler: unknown) => (sessionHandlers['beforeRequest'] = handler),
      },
      clearStorageData: vi.fn(async () => undefined),
      clearCache: vi.fn(async () => undefined),
    }),
  },
  WebContentsView: FakeView,
}));

function fakeWindow(id = 1, zoom = 1) {
  return {
    id,
    isDestroyed: () => false,
    webContents: { getZoomFactor: () => zoom },
    getContentBounds: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    once: vi.fn(),
  };
}

const BOUNDS = { x: 600, y: 48, width: 600, height: 752 };

async function load() {
  vi.resetModules();
  return import('../browserPane');
}

beforeEach(async () => {
  userData.dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agi-pane-'));
  views.length = 0;
  showMessageBox.mockReset();
});

afterEach(async () => {
  await fs.rm(userData.dir, { recursive: true, force: true });
});

describe('the browser pane', () => {
  it('opens a page on this computer without asking', async () => {
    const pane = await load();
    const window = fakeWindow();
    const state = await pane.openBrowserPane(window as never, BOUNDS, 'localhost:3000');
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(views[0]?.webContents.loadURL).toHaveBeenCalledWith('http://localhost:3000/');
    expect(state.url).toBe('http://localhost:3000/');
    expect(views[0]?.options).toMatchObject({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
  });

  it('asks before another site, refuses on cancel, and remembers an allow', async () => {
    const pane = await load();
    const window = fakeWindow();
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    const refused = await pane.openBrowserPane(window as never, BOUNDS, 'example.com');
    expect(refused.refusedHost).toBe('example.com');
    expect(views[0]?.webContents.loadURL).not.toHaveBeenCalled();

    showMessageBox.mockResolvedValueOnce({ response: 1 });
    const allowed = await pane.navigateBrowserPane(window as never, 'example.com/docs');
    expect(allowed.refusedHost).toBeNull();
    expect(views[0]?.webContents.loadURL).toHaveBeenCalledWith('https://example.com/docs');
    expect(pane.readBrowserSites().allowed).toEqual(['example.com']);

    await pane.navigateBrowserPane(window as never, 'docs.example.com');
    expect(showMessageBox).toHaveBeenCalledTimes(2);
  });

  it('refuses a blocked site without asking', async () => {
    const pane = await load();
    pane.blockBrowserSite('tracker.example');
    const state = await pane.openBrowserPane(fakeWindow() as never, BOUNDS, 'tracker.example');
    expect(showMessageBox).not.toHaveBeenCalled();
    expect(state.refusedHost).toBe('tracker.example');
  });

  it('holds a link or redirect to an unallowed site until it is allowed', async () => {
    const pane = await load();
    const window = fakeWindow();
    await pane.openBrowserPane(window as never, BOUNDS, 'localhost:3000');
    const contents = views[0]?.webContents as FakeContents;
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    const event = { url: 'https://elsewhere.example/', isMainFrame: true, preventDefault: vi.fn() };
    contents.emit('will-navigate', event);
    expect(event.preventDefault).toHaveBeenCalled();
    const redirect = { url: 'https://other.example/', isMainFrame: true, preventDefault: vi.fn() };
    contents.emit('will-redirect', redirect);
    expect(redirect.preventDefault).toHaveBeenCalled();
    const frame = { url: 'https://cdn.example/', isMainFrame: false, preventDefault: vi.fn() };
    contents.emit('will-navigate', frame);
    expect(frame.preventDefault).not.toHaveBeenCalled();
  });

  it('keeps a blocked site out however the pane would reach it', async () => {
    const pane = await load();
    const window = fakeWindow();
    showMessageBox.mockResolvedValueOnce({ response: 1 });
    await pane.openBrowserPane(window as never, BOUNDS, 'localhost:3000');
    await pane.navigateBrowserPane(window as never, 'example.com');
    const view = views[0] as FakeView;
    expect(view.visible).toBe(true);

    pane.blockBrowserSite('example.com');
    expect(view.visible).toBe(false);
    expect(pane.browserPaneState(window as never).refusedHost).toBe('example.com');

    const reloaded = pane.stepBrowserPane(window as never, 'reload');
    expect(view.webContents.reload).not.toHaveBeenCalled();
    expect(reloaded.refusedHost).toBe('example.com');

    const back = pane.stepBrowserPane(window as never, 'back');
    expect(view.webContents.navigationHistory.goBack).toHaveBeenCalled();
    expect(back.refusedHost).toBeNull();
    expect(view.visible).toBe(true);

    const decide = sessionHandlers['beforeRequest'] as (
      details: { url: string; resourceType: string; webContents: unknown },
      callback: (response: { cancel?: boolean }) => void,
    ) => void;
    const answer = vi.fn();
    decide(
      { url: 'https://example.com/', resourceType: 'mainFrame', webContents: view.webContents },
      answer,
    );
    expect(answer).toHaveBeenCalledWith({ cancel: true });
    expect(view.visible).toBe(false);
    const asset = vi.fn();
    decide(
      { url: 'https://example.com/a.png', resourceType: 'image', webContents: view.webContents },
      asset,
    );
    expect(asset).toHaveBeenCalledWith({});
    const local = vi.fn();
    decide(
      { url: 'http://localhost:3000/', resourceType: 'mainFrame', webContents: view.webContents },
      local,
    );
    expect(local).toHaveBeenCalledWith({});
  });

  it('hides the last page when a site is refused, so the refusal is what shows', async () => {
    const pane = await load();
    const window = fakeWindow();
    await pane.openBrowserPane(window as never, BOUNDS, 'localhost:3000');
    const view = views[0] as FakeView;
    showMessageBox.mockResolvedValueOnce({ response: 0 });
    await pane.navigateBrowserPane(window as never, 'example.com');
    expect(view.visible).toBe(false);
    await pane.openBrowserPane(window as never, BOUNDS, null);
    expect(view.visible).toBe(false);
  });

  it('opens no new windows: a link that wants one is shown in the pane', async () => {
    const pane = await load();
    await pane.openBrowserPane(fakeWindow() as never, BOUNDS, 'localhost:3000');
    const contents = views[0]?.webContents as FakeContents;
    expect(contents.openHandler?.({ url: 'http://localhost:4000/' })).toEqual({ action: 'deny' });
    await vi.waitFor(() =>
      expect(contents.loadURL).toHaveBeenLastCalledWith('http://localhost:4000/'),
    );
  });

  it('grants pages in the pane no permissions at all', async () => {
    const pane = await load();
    await pane.openBrowserPane(fakeWindow() as never, BOUNDS, null);
    const answer = vi.fn();
    (sessionHandlers['request'] as (a: unknown, b: unknown, c: (ok: boolean) => void) => void)(
      null,
      'media',
      answer,
    );
    expect(answer).toHaveBeenCalledWith(false);
    expect((sessionHandlers['check'] as () => boolean)()).toBe(false);
  });

  it('keeps the pane inside the window and follows the page zoom', async () => {
    const pane = await load();
    await pane.openBrowserPane(
      fakeWindow(1, 1.25) as never,
      { x: 100, y: 40, width: 5000, height: 5000 },
      null,
    );
    expect(views[0]?.bounds).toEqual({ x: 125, y: 50, width: 1075, height: 750 });
  });
});
