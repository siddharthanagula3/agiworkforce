import { EventEmitter } from 'node:events';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineShellInkGlobals } from './shellTokenGlobals';

const created = vi.hoisted(() => ({ windows: [] as Array<Record<string, unknown>> }));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeWindow extends EventEmitter {
    readonly options: Record<string, unknown>;
    readonly webContents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn(),
    });
    destroyed = false;
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setContentProtection = vi.fn();
    visible = false;
    showInactive = vi.fn(() => {
      this.visible = true;
    });
    isVisible() {
      return this.visible;
    }
    loadURL = vi.fn(async () => undefined);
    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      created.windows.push(this as unknown as Record<string, unknown>);
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  return {
    BrowserWindow: FakeWindow,
    nativeTheme: { shouldUseDarkColors: true },
  };
});

const {
  RECORDER_OVERLAY_SHOW_TIMEOUT_MS,
  RECORDER_OVERLAY_LABEL,
  RECORDER_OVERLAY_STOP_URL,
  openRecorderOverlay,
  recorderOverlayBounds,
  recorderOverlayUrl,
} = await import('../recorderOverlayWindow');

beforeAll(defineShellInkGlobals);

type FakeWindow = EventEmitter & {
  options: Record<string, unknown>;
  webContents: EventEmitter;
  setContentProtection: ReturnType<typeof vi.fn>;
  showInactive: ReturnType<typeof vi.fn>;
  destroyed: boolean;
  destroy(): void;
};

const startDisplay = { workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const open = (onStop: () => void = vi.fn(), display = startDisplay) =>
  openRecorderOverlay({ startedAt: 0, display, onStop });

function lastWindow(): FakeWindow {
  return created.windows.at(-1) as unknown as FakeWindow;
}

beforeEach(() => {
  created.windows.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the recording indicator', () => {
  it('sits centred at the top of the work area', () => {
    expect(recorderOverlayBounds({ x: 0, y: 25, width: 1440, height: 875 })).toEqual({
      x: 600,
      y: 37,
      width: 240,
      height: 52,
    });
  });

  it('draws a label, an elapsed time and a Stop control that asks for the stop URL', () => {
    const html = decodeURIComponent(
      recorderOverlayUrl(1_000).replace(/^data:text\/html;charset=utf-8,/, ''),
    );

    expect(html).toContain(`>${RECORDER_OVERLAY_LABEL}<`);
    expect(html).toContain('id="elapsed"');
    expect(html).toContain('>Stop</button>');
    expect(html).toContain(JSON.stringify(RECORDER_OVERLAY_STOP_URL));
    expect(html).not.toMatch(/font-size:\s*1[0-3]px/);
  });

  it('writes in the shell tokens and follows the appearance, not a baked-in one', () => {
    const html = decodeURIComponent(
      recorderOverlayUrl(1_000).replace(/^data:text\/html;charset=utf-8,/, ''),
    );

    expect(html).toContain('content="light dark"');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('button{background:var(--ink);color:var(--ground)');
    expect(html.slice(html.indexOf('html,body'))).not.toMatch(/#[0-9a-f]{3,6}\b/iu);
  });

  it('is kept out of screen capture and never takes focus', () => {
    open();
    const win = lastWindow();

    expect(win.setContentProtection).toHaveBeenCalledWith(true);
    expect(win.options).toMatchObject({ focusable: false, alwaysOnTop: true, closable: false });
    expect(win.options['webPreferences']).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    });
  });

  it('stops on the Stop control and refuses every other navigation', () => {
    const onStop = vi.fn();
    open(onStop);
    const contents = lastWindow().webContents;
    const navigate = (url: string) => {
      const event = { preventDefault: vi.fn() };
      contents.emit('will-navigate', event, url);
      return event.preventDefault;
    };

    expect(navigate('https://example.com/')).toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(navigate(RECORDER_OVERLAY_STOP_URL)).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('stops the recording when it goes away by any route but its owner closing it', () => {
    const onStop = vi.fn();
    const overlay = open(onStop);
    lastWindow().destroy();
    expect(onStop).toHaveBeenCalledTimes(1);

    const quiet = vi.fn();
    open(quiet).close();
    expect(quiet).not.toHaveBeenCalled();
    overlay.close();
  });

  it('opens on the display it is given, not the one under the pointer', () => {
    open(vi.fn(), { workArea: { x: 1440, y: 0, width: 1920, height: 1080 } });

    expect(lastWindow().options).toMatchObject({ x: 1440 + (1920 - 240) / 2, y: 12 });
  });

  it('reports shown only once it is visible', async () => {
    const overlay = open();
    const win = lastWindow();
    let settled: boolean | null = null;
    void overlay.shown.then((visible) => {
      settled = visible;
    });
    await Promise.resolve();
    expect(settled).toBeNull();

    win.emit('ready-to-show');

    await expect(overlay.shown).resolves.toBe(true);
    expect(win.showInactive).toHaveBeenCalledTimes(1);
  });

  it('goes away and stops the recording when it fails to load', async () => {
    const onStop = vi.fn();
    const overlay = open(onStop);
    const win = lastWindow();

    win.webContents.emit('did-fail-load', {}, -2, 'failed', 'data:', true);

    await expect(overlay.shown).resolves.toBe(false);
    expect(win.destroyed).toBe(true);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('gives up when it is not shown in time', async () => {
    const onStop = vi.fn();
    const overlay = open(onStop);
    const win = lastWindow();

    await vi.advanceTimersByTimeAsync(RECORDER_OVERLAY_SHOW_TIMEOUT_MS);
    win.emit('ready-to-show');

    await expect(overlay.shown).resolves.toBe(false);
    expect(win.destroyed).toBe(true);
    expect(win.showInactive).not.toHaveBeenCalled();
  });
});
