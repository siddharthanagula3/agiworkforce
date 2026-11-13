import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../composerFocus');
type ScanModule1 = typeof import('../quickAsk');
type ScanModule2 = typeof import('../garnishCore');

type ClipboardEntry = { kind: 'text'; value: string } | { kind: 'image' } | { kind: 'cleared' };

const clipboardLog: ClipboardEntry[] = [];
let clipboardText = '';
let clipboardImage: string | null = null;
let clipboardReadFails = false;
let screenAvailable = true;

const notifications: { title: string; body: string }[] = [];
const composerFocused = vi.fn(async () => true);

vi.mock('electron', () => ({
  clipboard: {
    readText: async () => clipboardText,
    read: async () => {
      if (clipboardReadFails) throw new Error('the clipboard could not be read');
      const held = clipboardImage;
      return held === null ? [] : [{ types: ['image/png'], getType: async () => new Blob([held]) }];
    },
    writeText: async (value: string) => {
      clipboardText = value;
      clipboardImage = null;
      clipboardLog.push({ kind: 'text', value });
    },
    clear: () => {
      clipboardText = '';
      clipboardImage = null;
      clipboardLog.push({ kind: 'cleared' });
    },
    write: async () => {
      clipboardImage = 'the screenshot';
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
  ...(await importOriginal<ScanModule0>()),
  focusPageComposer: composerFocused,
}));
vi.mock('../quickAsk', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  hideQuickAsk: vi.fn(),
  isQuickAskVisible: () => false,
}));
vi.mock('../garnishCore', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  pickSourceForDisplay: (sources: unknown[]) => sources[0] ?? null,
}));

const { captureToChat } = await import('../screenshot');

const CHAT_URL = 'https://agiworkforce.com/chat/conversation-a';

function chatWindow(
  page: { url: string; loading?: boolean } = { url: CHAT_URL },
  onPaste: () => void = () => {},
) {
  return {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    webContents: {
      id: 1,
      focus: vi.fn(),
      paste: vi.fn(onPaste),
      isDestroyed: () => false,
      isLoading: () => page.loading ?? false,
      getURL: () => page.url,
    },
  } as unknown as Parameters<typeof captureToChat>[0];
}

beforeEach(() => {
  clipboardLog.length = 0;
  notifications.length = 0;
  clipboardText = '';
  clipboardImage = null;
  clipboardReadFails = false;
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

describe('when the capture cannot be taken back', () => {
  it('tells the user it is still on the clipboard, and the shortcut keeps working', async () => {
    const window = chatWindow({ url: CHAT_URL }, () => {
      clipboardReadFails = true;
    });

    await captureToChat(window);

    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image']);
    expect(notifications.at(-1)?.title).toBe('Screenshot still on your clipboard');

    clipboardReadFails = false;
    await captureToChat(chatWindow());

    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image', 'image', 'cleared']);
  });
});

describe('where the screenshot is pasted', () => {
  it('pastes into the conversation that asked for it', async () => {
    const window = chatWindow();

    await captureToChat(window);

    expect(window?.webContents.paste).toHaveBeenCalledTimes(1);
  });

  it('does not paste into another conversation the window moved to while capturing', async () => {
    const page = { url: CHAT_URL };
    const window = chatWindow(page);
    composerFocused.mockImplementation(async () => {
      page.url = 'https://agiworkforce.com/chat/conversation-b';
      return true;
    });

    await captureToChat(window);

    expect(window?.webContents.paste).not.toHaveBeenCalled();
    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image']);
    expect(notifications.at(-1)?.title).toMatch(/copied to clipboard/i);
  });

  it('does not paste into a page that is not the product', async () => {
    const window = chatWindow({ url: 'https://accounts.example.com/sign-in' });

    await captureToChat(window);

    expect(window?.webContents.paste).not.toHaveBeenCalled();
    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image']);
  });
});

describe("what the screenshot cleanup leaves of the user's own copy", () => {
  it('does not overwrite text the user copied after the paste', async () => {
    const window = chatWindow({ url: CHAT_URL }, () => {
      setTimeout(() => {
        clipboardText = 'copied by the user';
        clipboardImage = null;
      }, 100);
    });

    await captureToChat(window);

    expect(clipboardText).toBe('copied by the user');
    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image']);
  });

  it('does not clear an image the user copied after the paste', async () => {
    const window = chatWindow({ url: CHAT_URL }, () => {
      setTimeout(() => {
        clipboardImage = "the user's own picture";
      }, 100);
    });

    await captureToChat(window);

    expect(clipboardImage).toBe("the user's own picture");
    expect(clipboardLog.map((entry) => entry.kind)).toEqual(['image']);
  });
});
