import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ELECTRON_IPC_CHANNELS } from '../../src/lib/tauri-electron/bridgeContract';

const notifications: { title: string; body: string }[] = [];

vi.mock('electron', () => ({
  Notification: Object.assign(
    function NotificationMock(options: { title: string; body: string }) {
      return {
        show: () => {
          notifications.push(options);
        },
      };
    },
    { isSupported: () => true },
  ),
}));

const rendererMode = { value: 'bundled' };
vi.mock('../config', () => ({
  get RENDERER_MODE() {
    return rendererMode.value;
  },
}));

const focusPageComposer = vi.fn(async () => true);
vi.mock('../composerFocus', () => ({
  focusPageComposer: (win: unknown) => focusPageComposer(win),
}));

const quickAsk = {
  visible: false,
  panel: null as FakeWindow | null,
  surfaced: null as FakeWindow | null,
};
const surfaceQuickAsk = vi.fn(() => quickAsk.surfaced);
vi.mock('../quickAsk', () => ({
  isQuickAskVisible: () => quickAsk.visible,
  quickAskPanel: () => quickAsk.panel,
  surfaceQuickAsk: (win: unknown) => surfaceQuickAsk(win as never),
}));

const { dictationTarget, toggleGlobalDictation } = await import('../voiceDictation');

class FakeWindow {
  sent: string[] = [];
  focused = 0;
  destroyed = false;
  webContents = {
    focus: vi.fn(),
    send: (channel: string) => {
      this.sent.push(channel);
    },
  };

  constructor(
    private readonly visible: boolean,
    private readonly minimized = false,
  ) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }
  isVisible(): boolean {
    return this.visible;
  }
  isMinimized(): boolean {
    return this.minimized;
  }
  focus(): void {
    this.focused += 1;
  }
}

function asWindow(win: FakeWindow): never {
  return win as never;
}

describe('global dictation press', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rendererMode.value = 'bundled';
    quickAsk.visible = false;
    quickAsk.panel = null;
    quickAsk.surfaced = null;
    surfaceQuickAsk.mockClear();
    focusPageComposer.mockClear();
    notifications.length = 0;
  });

  it('toggles capture in the visible main window without raising quick ask', async () => {
    const main = new FakeWindow(true);
    await toggleGlobalDictation(asWindow(main));

    expect(surfaceQuickAsk).not.toHaveBeenCalled();
    expect(main.focused).toBe(1);
    expect(focusPageComposer).toHaveBeenCalledWith(main);
    expect(main.sent).toEqual([ELECTRON_IPC_CHANNELS.voiceHotkey]);
  });

  it('raises the quick ask surface when the main window is hidden', async () => {
    const main = new FakeWindow(false);
    const raised = new FakeWindow(true);
    quickAsk.surfaced = raised;

    await toggleGlobalDictation(asWindow(main));

    expect(surfaceQuickAsk).toHaveBeenCalledTimes(1);
    expect(raised.sent).toEqual([ELECTRON_IPC_CHANNELS.voiceHotkey]);
    expect(main.sent).toEqual([]);
  });

  it('treats a minimized main window as hidden', async () => {
    const main = new FakeWindow(true, true);
    quickAsk.surfaced = main;

    await toggleGlobalDictation(asWindow(main));

    expect(surfaceQuickAsk).toHaveBeenCalledTimes(1);
  });

  it('targets an open quick ask panel instead of closing or bypassing it', async () => {
    const main = new FakeWindow(true);
    const panel = new FakeWindow(true);
    quickAsk.visible = true;
    quickAsk.panel = panel;

    await toggleGlobalDictation(asWindow(main));

    expect(surfaceQuickAsk).not.toHaveBeenCalled();
    expect(panel.sent).toEqual([ELECTRON_IPC_CHANNELS.voiceHotkey]);
    expect(main.sent).toEqual([]);
  });

  it('says so rather than sending into nothing when no window exists', async () => {
    await toggleGlobalDictation(null);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toBe('No AGI Cloud window');
  });

  it('reports the press as unavailable when the shell has no IPC receiver', async () => {
    rendererMode.value = 'remote';
    const main = new FakeWindow(true);

    await toggleGlobalDictation(asWindow(main));

    expect(main.sent).toEqual([]);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toBe('Dictation unavailable');
  });

  it('never sends into a window destroyed while the composer was focusing', async () => {
    const main = new FakeWindow(true);
    focusPageComposer.mockImplementationOnce(async () => {
      main.destroyed = true;
      return false;
    });

    await toggleGlobalDictation(asWindow(main));

    expect(main.sent).toEqual([]);
  });

  it('reports no target at all when nothing can be surfaced', () => {
    expect(dictationTarget(null)).toBeNull();
  });
});
