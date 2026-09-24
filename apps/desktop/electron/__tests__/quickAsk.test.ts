import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  ...(await importOriginal<typeof import('../config')>()),
  CLOUD_APP_ORIGIN: 'http://localhost:3100',
  REMOTE_SESSION_PARTITION: 'persist:test',
  RENDERER_MODE: 'remote',
}));
vi.mock('../windowPolicy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../windowPolicy')>()),
  applyRemoteWindowPolicy: vi.fn(),
}));

const quickAsk = await import('../quickAsk');

describe('Quick Ask panel', () => {
  beforeEach(() => {
    quickAsk.destroyQuickAsk();
    windows.length = 0;
  });

  it('loads the dedicated compact route and focuses its web contents', () => {
    const surfaced = quickAsk.surfaceQuickAsk(null);

    expect(windows).toHaveLength(1);
    expect(windows[0]?.loadURL).toHaveBeenCalledWith('http://localhost:3100/quick-ask');
    expect(windows[0]?.webContents.focus).toHaveBeenCalledOnce();
    expect(surfaced).toBe(windows[0]);
  });
});
