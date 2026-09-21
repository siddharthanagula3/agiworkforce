import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseShellTokens, readShellTokens } from '../shellTokens.mjs';
import {
  pageBackgroundColor,
  paintWindows,
  titleBarChrome,
  titleStripHeight,
  trafficLightPosition,
  windowButtonsTrailingEdge,
  windowButtonsTrailingGutter,
} from '../windowChrome';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('shell tokens', () => {
  it('reads the page background and the title strip out of the design tokens', () => {
    const tokens = readShellTokens(repoRoot);

    expect(tokens.pageBackgroundLight).toMatch(/^#[0-9a-f]{6}$/u);
    expect(tokens.pageBackgroundDark).toMatch(/^#[0-9a-f]{6}$/u);
    expect(tokens.pageBackgroundLight).not.toBe(tokens.pageBackgroundDark);
    expect(tokens.titleStripHeight).toBeGreaterThan(0);
  });

  it('resolves a dark background held as hsl channels on a foundation token', () => {
    const chat = `@layer base {
      :root {
        --chat-bg: #FAF9F7;
        --chat-window-title-strip: 48px;
        --chat-window-title-strip-inset: 84px;
      }
      .dark { --chat-bg: hsl(var(--neutral-0)); }
    }`;
    const foundation = `@layer base {
      :root { --neutral-0: 210 50% 40%; }
    }`;

    expect(parseShellTokens(chat, foundation)).toEqual({
      pageBackgroundLight: '#faf9f7',
      pageBackgroundDark: '#336699',
      titleStripHeight: 48,
      titleStripInset: 84,
    });
  });

  it('refuses to build when the page background token is gone', () => {
    const chat = '@layer base { :root { --chat-window-title-strip: 48px; } }';

    expect(() => parseShellTokens(chat, ':root { --neutral-0: 0 0% 0%; }')).toThrow(/--chat-bg/u);
  });

  it('refuses to build when the title strip token is gone', () => {
    const chat = '@layer base { :root { --chat-bg: #ffffff; } .dark { --chat-bg: #000000; } }';

    expect(() => parseShellTokens(chat, ':root {}')).toThrow(/--chat-window-title-strip/u);
  });

  it('reserves an inset that clears the window buttons instead of reaching them', () => {
    const tokens = readShellTokens(repoRoot);

    expect(tokens.titleStripInset).toBeGreaterThanOrEqual(
      windowButtonsTrailingEdge() + windowButtonsTrailingGutter(),
    );
  });
});

describe('traffic light position', () => {
  it('centres the window buttons in the strip the page reserves', () => {
    expect(trafficLightPosition(48)).toEqual({ x: 13, y: 16 });
    expect(trafficLightPosition(52)).toEqual({ x: 13, y: 18 });
  });

  it('follows the token rather than a fixed offset', () => {
    const short = trafficLightPosition(40);
    const tall = trafficLightPosition(64);

    expect(tall.y - short.y).toBe(12);
    expect(tall.x).toBe(short.x);
  });
});

describe('the native frame each platform keeps', () => {
  it('hands macOS the inset title bar and places the buttons in the strip', () => {
    const chrome = titleBarChrome('darwin');

    expect(chrome.titleBarStyle).toBe('hiddenInset');
    expect(chrome.trafficLightPosition).toEqual(trafficLightPosition(titleStripHeight()));
  });

  it('leaves every other platform its own frame rather than drawing one', () => {
    expect(titleBarChrome('win32')).toEqual({});
    expect(titleBarChrome('linux')).toEqual({});
  });

  it('paints a ground colour for each appearance, and not the same one twice', () => {
    expect(pageBackgroundColor(true)).toMatch(/^#[0-9a-f]{6}$/u);
    expect(pageBackgroundColor(false)).toMatch(/^#[0-9a-f]{6}$/u);
    expect(pageBackgroundColor(true)).not.toBe(pageBackgroundColor(false));
  });
});

describe('the appearance every open window follows', () => {
  function fakeWindow(destroyed = false) {
    const painted: string[] = [];
    return {
      painted,
      isDestroyed: () => destroyed,
      setBackgroundColor: (color: string) => painted.push(color),
    };
  }

  it('repaints every window, not only the one in front', () => {
    const windows = [fakeWindow(), fakeWindow(), fakeWindow()];

    expect(paintWindows(windows, true)).toBe(3);
    for (const win of windows) {
      expect(win.painted).toEqual([pageBackgroundColor(true)]);
    }
  });

  it('follows the appearance it is given rather than a fixed colour', () => {
    const win = fakeWindow();

    paintWindows([win], true);
    paintWindows([win], false);

    expect(win.painted).toEqual([pageBackgroundColor(true), pageBackgroundColor(false)]);
  });

  it('steps over a window that has been torn down', () => {
    const open = fakeWindow();
    const gone = fakeWindow(true);

    expect(paintWindows([gone, open], false)).toBe(1);
    expect(gone.painted).toEqual([]);
    expect(open.painted).toEqual([pageBackgroundColor(false)]);
  });
});
