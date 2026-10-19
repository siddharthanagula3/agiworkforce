import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../config');
type ScanModule1 = typeof import('../windowPolicy');

const windows: MockBrowserWindow[] = [];

class MockBrowserWindow {
  loadURL = vi.fn(async () => undefined);
  setAlwaysOnTop = vi.fn();
  setVisibleOnAllWorkspaces = vi.fn();
  setBounds = vi.fn();
  show = vi.fn();
  hide = vi.fn();
  focus = vi.fn();
  destroy = vi.fn();
  isDestroyed = vi.fn(() => false);
  isVisible = vi.fn(() => false);
  isMinimized = vi.fn(() => false);
  restore = vi.fn();
  on = vi.fn();
  webContents = { on: vi.fn(), focus: vi.fn() };

  constructor(readonly options: unknown) {
    windows.push(this);
  }
}

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  screen: {
    getCursorScreenPoint: () => ({ x: 200, y: 200 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  },
}));
vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  CLOUD_APP_ORIGIN: 'http://localhost:3100',
  REMOTE_SESSION_PARTITION: 'persist:test',
}));
vi.mock('../windowPolicy', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  applyRemoteWindowPolicy: vi.fn(),
}));

const quickAsk = await import('../quickAsk');

describe('Quick Ask panel', () => {
  beforeEach(() => {
    quickAsk.destroyQuickAsk();
    windows.length = 0;
  });

  it('loads the dedicated compact route and focuses its web contents', () => {
    const surfaced = quickAsk.surfaceQuickAsk();

    expect(windows).toHaveLength(1);
    expect(windows[0]?.loadURL).toHaveBeenCalledWith('http://localhost:3100/quick-ask');
    expect(windows[0]?.webContents.focus).toHaveBeenCalledOnce();
    expect(surfaced).toBe(windows[0]);
  });

  it('reloads the route on the next raise after the warm-up load failed', () => {
    quickAsk.warmUpQuickAsk();
    const panel = windows[0]!;
    const failed = panel.webContents.on.mock.calls.find(([name]) => name === 'did-fail-load')?.[1];
    failed?.({}, -106, 'ERR_INTERNET_DISCONNECTED', 'http://localhost:3100/quick-ask', true);

    quickAsk.surfaceQuickAsk();
    quickAsk.surfaceQuickAsk();

    expect(windows).toHaveLength(1);
    expect(panel.loadURL).toHaveBeenCalledTimes(2);
  });

  it('does not reload after an aborted load or a failed subframe', () => {
    quickAsk.warmUpQuickAsk();
    const panel = windows[0]!;
    const failed = panel.webContents.on.mock.calls.find(([name]) => name === 'did-fail-load')?.[1];
    failed?.({}, -3, 'ERR_ABORTED', 'http://localhost:3100/quick-ask', true);
    failed?.({}, -106, 'ERR_INTERNET_DISCONNECTED', 'https://frame.example/', false);

    quickAsk.surfaceQuickAsk();

    expect(panel.loadURL).toHaveBeenCalledOnce();
  });

  it('names the main-window route for a destination outside Quick Ask', () => {
    const origin = 'http://localhost:3100';

    expect(quickAsk.routeLeavingQuickAsk(`${origin}/quick-ask`, origin)).toBeNull();
    expect(quickAsk.routeLeavingQuickAsk(`${origin}/quick-ask/abc`, origin)).toBeNull();
    expect(quickAsk.routeLeavingQuickAsk('https://example.com/chat/abc', origin)).toBeNull();
    expect(quickAsk.routeLeavingQuickAsk('not a url', origin)).toBeNull();
    expect(quickAsk.routeLeavingQuickAsk(`${origin}/quick-askew`, origin)).toBe('/quick-askew');
    expect(quickAsk.routeLeavingQuickAsk(`${origin}/chat/abc?x=1#m`, origin)).toBe(
      '/chat/abc?x=1#m',
    );
  });

  it('moves a navigation away from Quick Ask into the main window and resets the panel', () => {
    const opened: string[] = [];
    quickAsk.configureQuickAskHandoff((route) => opened.push(route));
    const panel = quickAsk.surfaceQuickAsk() as unknown as MockBrowserWindow;
    panel.isVisible.mockReturnValue(true);
    const willNavigate = panel.webContents.on.mock.calls.find(
      ([name]) => name === 'will-navigate',
    )?.[1];
    const event = { preventDefault: vi.fn() };

    willNavigate?.(event, 'http://localhost:3100/chat/abc');

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(panel.hide).toHaveBeenCalledOnce();
    expect(opened).toEqual(['/chat/abc']);

    quickAsk.surfaceQuickAsk();
    expect(panel.loadURL).toHaveBeenLastCalledWith('http://localhost:3100/quick-ask');
    expect(panel.loadURL).toHaveBeenCalledTimes(2);
  });

  it('follows an in-page route change out of Quick Ask, and leaves its own routes alone', () => {
    const opened: string[] = [];
    quickAsk.configureQuickAskHandoff((route) => opened.push(route));
    const panel = quickAsk.surfaceQuickAsk() as unknown as MockBrowserWindow;
    panel.isVisible.mockReturnValue(true);
    const inPage = panel.webContents.on.mock.calls.find(
      ([name]) => name === 'did-navigate-in-page',
    )?.[1];

    inPage?.({}, 'http://localhost:3100/quick-ask/abc', true);
    inPage?.({}, 'http://localhost:3100/settings', false);
    expect(opened).toEqual([]);

    inPage?.({}, 'http://localhost:3100/pricing', true);
    expect(opened).toEqual(['/pricing']);
  });

  it('does not raise the main window for a panel nobody is looking at', () => {
    const opened: string[] = [];
    quickAsk.configureQuickAskHandoff((route) => opened.push(route));
    quickAsk.warmUpQuickAsk();
    const panel = windows[0]!;
    const navigated = panel.webContents.on.mock.calls.find(([name]) => name === 'did-navigate')?.[1];

    navigated?.({}, 'http://localhost:3100/login?redirectTo=%2Fquick-ask');

    expect(opened).toEqual([]);
    expect(panel.hide).not.toHaveBeenCalled();
    quickAsk.surfaceQuickAsk();
    expect(panel.loadURL).toHaveBeenCalledTimes(2);
  });
});
