import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    showInactive = vi.fn();
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
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 25, width: 1440, height: 875 } }),
    },
  };
});

const {
  RECORDER_OVERLAY_LABEL,
  RECORDER_OVERLAY_STOP_URL,
  openRecorderOverlay,
  recorderOverlayBounds,
  recorderOverlayUrl,
} = await import('../recorderOverlayWindow');

type FakeWindow = EventEmitter & {
  options: Record<string, unknown>;
  webContents: EventEmitter;
  setContentProtection: ReturnType<typeof vi.fn>;
  destroy(): void;
};

function lastWindow(): FakeWindow {
  return created.windows.at(-1) as unknown as FakeWindow;
}

beforeEach(() => {
  created.windows.length = 0;
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
      recorderOverlayUrl(1_000, true).replace(/^data:text\/html;charset=utf-8,/, ''),
    );

    expect(html).toContain(`>${RECORDER_OVERLAY_LABEL}<`);
    expect(html).toContain('id="elapsed"');
    expect(html).toContain('>Stop</button>');
    expect(html).toContain(JSON.stringify(RECORDER_OVERLAY_STOP_URL));
    expect(html).not.toMatch(/font-size:\s*1[0-3]px/);
  });

  it('is kept out of screen capture and never takes focus', () => {
    openRecorderOverlay({ startedAt: 0, onStop: vi.fn() });
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
    openRecorderOverlay({ startedAt: 0, onStop });
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
    const overlay = openRecorderOverlay({ startedAt: 0, onStop });
    lastWindow().destroy();
    expect(onStop).toHaveBeenCalledTimes(1);

    const quiet = vi.fn();
    openRecorderOverlay({ startedAt: 0, onStop: quiet }).close();
    expect(quiet).not.toHaveBeenCalled();
    overlay.close();
  });
});
