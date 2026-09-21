import { beforeEach, describe, expect, it, vi } from 'vitest';

type ClipboardEntry = { kind: 'text'; value: string } | { kind: 'image' } | { kind: 'cleared' };

const clipboardLog: ClipboardEntry[] = [];
let clipboardText = '';
let screenAvailable = true;

const notifications: { title: string; body: string }[] = [];
const composerFocused = vi.fn(async () => true);

vi.mock('electron', () => ({
  clipboard: {
    readText: () => clipboardText,
    writeText: (value: string) => {
      clipboardText = value;
      clipboardLog.push({ kind: 'text', value });
    },
    clear: () => {
      clipboardText = '';
      clipboardLog.push({ kind: 'cleared' });
    },
    write: async () => {
      clipboardLog.push({ kind: 'image' });
    },
  },
  ClipboardItem: class {
    constructor(readonly parts: unknown) {}
  },
  desktopCapturer: {
    getSources: async () =>
      screenAvailable
        ? [{ display_id: '1', thumbnail: { isEmpty: () => false, toPNG: () => Buffer.from([1]) } }]
        : [],
  },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 0 })) },
  Notification: Object.assign(
    class {
      constructor(readonly options: { title: string; body: string }) {}
      show() {
        notifications.push({ title: this.options.title, body: this.options.body });
      }
    },
    { isSupported: () => true },
  ),
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ id: 1, size: { width: 100, height: 100 }, scaleFactor: 1 }),
  },
  systemPreferences: { getMediaAccessStatus: () => 'granted' },
}));

vi.mock('../composerFocus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../composerFocus')>()),
  focusPageComposer: composerFocused,
}));
vi.mock('../quickAsk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quickAsk')>()),
  hideQuickAsk: vi.fn(),
  isQuickAskVisible: () => false,
}));
vi.mock('../garnishCore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../garnishCore')>()),
  pickSourceForDisplay: (sources: unknown[]) => sources[0] ?? null,
}));

const { captureToChat } = await import('../screenshot');

function chatWindow() {
  return {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    webContents: { focus: vi.fn(), paste: vi.fn() },
  } as unknown as Parameters<typeof captureToChat>[0];
}

beforeEach(() => {
  clipboardLog.length = 0;
  notifications.length = 0;
  clipboardText = '';
  screenAvailable = true;
  composerFocused.mockResolvedValue(true);
  vi.useRealTimers();
});

describe('what the screenshot shortcut leaves behind', () => {
  it('takes the capture back off the clipboard once the composer has it', async () => {
    await captureToChat(chatWindow());

    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image', 'cleared']);
    expect(clipboardText).toBe('');
  });

  it('puts back the text the user had, rather than leaving their screen there', async () => {
    clipboardText = 'a sentence the user was carrying';

    await captureToChat(chatWindow());

    expect(clipboardLog.at(-1)).toEqual({
      kind: 'text',
      value: 'a sentence the user was carrying',
    });
    expect(clipboardText).toBe('a sentence the user was carrying');
  });

  it('leaves it only when it has told the user that is where it is', async () => {
    composerFocused.mockResolvedValue(false);

    await captureToChat(chatWindow());

    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image']);
    expect(notifications.at(-1)?.title).toMatch(/copied to clipboard/i);
  });

  it('leaves nothing behind when there was no screen to capture', async () => {
    screenAvailable = false;

    await captureToChat(chatWindow());

    expect(clipboardLog).toEqual([]);
    expect(notifications.at(-1)?.title).toBe('Screenshot failed');
  });

  it('takes it back even when the paste itself fails', async () => {
    composerFocused.mockRejectedValue(new Error('the renderer went away'));

    await captureToChat(chatWindow());

    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image', 'cleared']);
    expect(notifications.at(-1)?.title).toBe('Screenshot failed');
  });
});
