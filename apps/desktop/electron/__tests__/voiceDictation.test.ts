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
  surfaceQuickAsk: () => surfaceQuickAsk(),
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
  const openMainWindow = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    openMainWindow.mockClear();
    quickAsk.visible = false;
    quickAsk.panel = null;
    quickAsk.surfaced = null;
    surfaceQuickAsk.mockClear();
    focusPageComposer.mockClear();
    notifications.length = 0;
  });

  it('toggles capture in the visible main window without raising quick ask', async () => {
    const main = new FakeWindow(true);
    await toggleGlobalDictation(asWindow(main), openMainWindow);

    expect(surfaceQuickAsk).not.toHaveBeenCalled();
    expect(main.focused).toBe(1);
    expect(focusPageComposer).toHaveBeenCalledWith(main);
    expect(main.sent).toEqual([ELECTRON_IPC_CHANNELS.voiceHotkey]);
    expect(openMainWindow).not.toHaveBeenCalled();
  });

  it('raises the quick ask surface when the main window is hidden', async () => {
    const main = new FakeWindow(false);
    const raised = new FakeWindow(true);
    quickAsk.surfaced = raised;

    await toggleGlobalDictation(asWindow(main), openMainWindow);

    expect(surfaceQuickAsk).toHaveBeenCalledTimes(1);
    expect(raised.sent).toEqual([ELECTRON_IPC_CHANNELS.voiceHotkey]);
    expect(main.sent).toEqual([]);
  });

  it('treats a minimized main window as hidden', async () => {
    const main = new FakeWindow(true, true);
    quickAsk.surfaced = main;

    await toggleGlobalDictation(asWindow(main), openMainWindow);

    expect(surfaceQuickAsk).toHaveBeenCalledTimes(1);
  });

  it('targets an open quick ask panel instead of closing or bypassing it', async () => {
    const main = new FakeWindow(true);
    const panel = new FakeWindow(true);
    quickAsk.visible = true;
    quickAsk.panel = panel;

    await toggleGlobalDictation(asWindow(main), openMainWindow);

    expect(surfaceQuickAsk).not.toHaveBeenCalled();
    expect(panel.sent).toEqual([ELECTRON_IPC_CHANNELS.voiceHotkey]);
    expect(main.sent).toEqual([]);
  });

  it('opens the main window and says to press again when nothing can be raised', async () => {
    await toggleGlobalDictation(null, openMainWindow);

    expect(openMainWindow).toHaveBeenCalledTimes(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toBe('Opening AGI Cloud');
  });

  it('opens a new window rather than sending into a destroyed one', async () => {
    const main = new FakeWindow(true);
    main.destroyed = true;

    await toggleGlobalDictation(asWindow(main), openMainWindow);

    expect(openMainWindow).toHaveBeenCalledTimes(1);
    expect(main.sent).toEqual([]);
  });

  it('reaches the page the remote shell loads, which owns the capture', async () => {
    const main = new FakeWindow(true);

    await toggleGlobalDictation(asWindow(main), openMainWindow);

    expect(focusPageComposer).toHaveBeenCalledWith(main);
    expect(main.sent).toEqual([ELECTRON_IPC_CHANNELS.voiceHotkey]);
    expect(notifications).toHaveLength(0);
  });

  it('never sends into a window destroyed while the composer was focusing', async () => {
    const main = new FakeWindow(true);
    focusPageComposer.mockImplementationOnce(async () => {
      main.destroyed = true;
      return false;
    });

    await toggleGlobalDictation(asWindow(main), openMainWindow);

    expect(main.sent).toEqual([]);
  });

  it('reports no target at all when nothing can be surfaced', () => {
    expect(dictationTarget(null)).toBeNull();
  });
});
