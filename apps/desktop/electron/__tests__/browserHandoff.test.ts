import { beforeEach, describe, expect, it, vi } from 'vitest';
type ComposerFocusModule = typeof import('../composerFocus');
type QuickAskModule = typeof import('../quickAsk');

type ClipboardEntry = 'image' | 'text' | 'cleared';

const clipboardLog: ClipboardEntry[] = [];
let clipboardText = '';
let clipboardImage: Buffer | null = null;

const composerFocused = vi.fn(async () => true);

vi.mock('electron', () => ({
  clipboard: {
    readText: async () => clipboardText,
    read: async () => {
      const held = clipboardImage;
      return held === null
        ? []
        : [{ types: ['image/png'], getType: async () => new Blob([new Uint8Array(held)]) }];
    },
    writeText: async (value: string) => {
      clipboardText = value;
      clipboardImage = null;
      clipboardLog.push('text');
    },
    clear: () => {
      clipboardText = '';
      clipboardImage = null;
      clipboardLog.push('cleared');
    },
    write: async (items: { parts: Record<string, Blob> }[]) => {
      const blob = items[0]?.parts['image/png'];
      clipboardImage = blob ? Buffer.from(await blob.arrayBuffer()) : null;
      clipboardText = '';
      clipboardLog.push('image');
    },
  },
  ClipboardItem: class {
    constructor(readonly parts: Record<string, Blob>) {}
  },
}));

vi.mock('../composerFocus', async (importOriginal) => ({
  ...(await importOriginal<ComposerFocusModule>()),
  focusPageComposer: composerFocused,
}));
vi.mock('../quickAsk', async (importOriginal) => ({
  ...(await importOriginal<QuickAskModule>()),
  hideQuickAsk: vi.fn(),
  isQuickAskVisible: () => false,
}));

const { deliverBrowserHandoff } = await import('../browserHandoff');

const PAGE_PICTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

function chatWindow(onPaste: () => void = () => {}) {
  const webContents = {
    focus: vi.fn(),
    paste: vi.fn(onPaste),
    insertText: vi.fn(async () => undefined),
  };
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents,
  };
  return {
    webContents,
    window: window as unknown as Parameters<typeof deliverBrowserHandoff>[0],
  };
}

beforeEach(() => {
  clipboardLog.length = 0;
  clipboardText = '';
  clipboardImage = null;
  composerFocused.mockResolvedValue(true);
});

describe('a page picture handed over from the browser', () => {
  it('is pasted into the chat, then taken back off the clipboard', async () => {
    let pasted: Buffer | null = null;
    const { window, webContents } = chatWindow(() => {
      pasted = clipboardImage;
    });

    await deliverBrowserHandoff(window, { kind: 'page-capture', png: PAGE_PICTURE });

    expect(webContents.paste).toHaveBeenCalledTimes(1);
    expect(pasted).toEqual(PAGE_PICTURE);
    expect(clipboardLog).toEqual(['image', 'cleared']);
    expect(clipboardImage).toBeNull();
  });

  it('puts back the text the user was carrying', async () => {
    clipboardText = 'a sentence the user was carrying';
    const { window } = chatWindow();

    await deliverBrowserHandoff(window, { kind: 'page-capture', png: PAGE_PICTURE });

    expect(clipboardLog).toEqual(['image', 'text']);
    expect(clipboardText).toBe('a sentence the user was carrying');
  });

  it('leaves alone what the user copied while the paste settled', async () => {
    const { window } = chatWindow(() => {
      setTimeout(() => {
        clipboardText = 'copied by the user';
        clipboardImage = null;
      }, 100);
    });

    await deliverBrowserHandoff(window, { kind: 'page-capture', png: PAGE_PICTURE });

    expect(clipboardLog).toEqual(['image']);
    expect(clipboardText).toBe('copied by the user');
  });

  it('never reaches the clipboard when no chat is open', async () => {
    composerFocused.mockResolvedValue(false);
    const { window, webContents } = chatWindow();

    await expect(
      deliverBrowserHandoff(window, { kind: 'page-capture', png: PAGE_PICTURE }),
    ).rejects.toThrow(/No chat is open/);

    expect(webContents.paste).not.toHaveBeenCalled();
    expect(clipboardLog).toEqual([]);
  });
});

describe('a selection handed over from the browser', () => {
  it('is typed into the composer as a quote with its source, without the clipboard', async () => {
    const { window, webContents } = chatWindow();

    await deliverBrowserHandoff(window, {
      kind: 'selection',
      text: 'first line\nsecond line',
      url: 'https://example.com/article',
    });

    expect(webContents.insertText).toHaveBeenCalledWith(
      '> first line\n> second line\n\nSource: https://example.com/article\n\n',
    );
    expect(clipboardLog).toEqual([]);
  });
});
