import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { desktopUpdatePrompt } from '../desktopCloudUpdate';
import { physicalCaptureSize } from '../runtime/computerUseProtocol';
import {
  EMPTY_WINDOW_STATE,
  adoptAccount,
  frameWorthRemembering,
  rememberRoute,
  resolveWindowRestore,
  type RememberedFrame,
  type WindowFrameReading,
} from '../windowState';
import {
  titleBarChrome,
  titleStripHeight,
  windowButtonsTrailingEdge,
  windowButtonsTrailingGutter,
} from '../windowChrome';

const REPO = resolve(process.cwd(), '../..');
const TOKENS = readFileSync(resolve(REPO, 'packages/ui/design-tokens/src/chat.css'), 'utf8');
const HOSTED_PAGE_CSS = readFileSync(resolve(REPO, 'apps/web/app/globals.css'), 'utf8');

function token(name: string): number {
  const match = TOKENS.match(new RegExp(`--${name}:\\s*(\\d+)px`));
  if (!match) throw new Error(`the design tokens no longer define --${name}`);
  return Number(match[1]);
}

const CHOSEN: RememberedFrame = {
  bounds: { x: 100, y: 120, width: 1000, height: 700 },
  maximized: false,
};

const WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

function reading(overrides: Partial<WindowFrameReading> = {}): WindowFrameReading {
  return {
    destroyed: false,
    minimized: false,
    fullScreen: false,
    maximized: false,
    bounds: { x: 300, y: 300, width: 800, height: 600 },
    workArea: WORK_AREA,
    ...overrides,
  };
}

const fills = (bounds: { width: number; height: number }, workArea: typeof WORK_AREA): boolean =>
  bounds.width >= workArea.width && bounds.height >= workArea.height;

describe('the strip the shell hands back to the page', () => {
  it('reserves exactly the room the window buttons need, and no more', () => {
    expect(token('chat-window-title-strip-inset')).toBe(
      windowButtonsTrailingEdge() + windowButtonsTrailingGutter(),
    );
  });

  it('gives the page the same strip height the window was built around', () => {
    expect(titleStripHeight()).toBe(token('chat-window-title-strip'));
  });

  it('hands the strip back on macOS only, where the buttons float over it', () => {
    expect(titleBarChrome('darwin')).toMatchObject({ titleBarStyle: 'hiddenInset' });
    expect(titleBarChrome('win32')).toEqual({});
    expect(titleBarChrome('linux')).toEqual({});
  });

  it('is draggable in the page, because the native title bar is gone', () => {
    expect(HOSTED_PAGE_CSS).toMatch(/-webkit-app-region:\s*drag/);
  });

  it('leaves the controls inside it clickable rather than draggable', () => {
    expect(HOSTED_PAGE_CSS).toMatch(/-webkit-app-region:\s*no-drag/);
  });

  it('starts the page after the buttons rather than underneath them', () => {
    expect(HOSTED_PAGE_CSS).toContain('--agi-window-title-strip-inset');
    expect(HOSTED_PAGE_CSS).toContain('var(--chat-window-title-strip-inset)');
  });
});

describe('the size and state a window is put back at', () => {
  it('remembers the size the user dragged it to', () => {
    const settled = frameWorthRemembering(CHOSEN, reading(), fills);
    expect(settled).toEqual({
      bounds: { x: 300, y: 300, width: 800, height: 600 },
      maximized: false,
    });
  });

  it('remembers a zoomed window as zoomed rather than as the size it fills', () => {
    const settled = frameWorthRemembering(
      CHOSEN,
      reading({ maximized: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
      fills,
    );
    expect(settled).toEqual({ bounds: CHOSEN.bounds, maximized: true });
  });

  it('treats a window filling the work area as zoomed even when the platform says otherwise', () => {
    expect(
      frameWorthRemembering(
        CHOSEN,
        reading({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        fills,
      ).maximized,
    ).toBe(true);
  });

  it('never learns its size from a minimized window', () => {
    expect(
      frameWorthRemembering(
        CHOSEN,
        reading({ minimized: true, bounds: { x: 0, y: 0, width: 1, height: 1 } }),
        fills,
      ),
    ).toEqual(CHOSEN);
  });

  it('never learns its size from a full-screen window', () => {
    expect(
      frameWorthRemembering(
        CHOSEN,
        reading({ fullScreen: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        fills,
      ),
    ).toEqual(CHOSEN);
  });

  it('never learns its size from a window that is being torn down', () => {
    expect(frameWorthRemembering(CHOSEN, reading({ destroyed: true }), fills)).toEqual(CHOSEN);
  });

  it('leaves a zoomed window zoomed when it is minimized from there', () => {
    const zoomed: RememberedFrame = { bounds: CHOSEN.bounds, maximized: true };
    expect(frameWorthRemembering(zoomed, reading({ minimized: true }), fills)).toEqual(zoomed);
  });
});

describe('moving between the modes the app offers', () => {
  const ACCOUNT = 'a'.repeat(32);

  it('keeps the signed-in account and the route it left', () => {
    const inCode = rememberRoute(
      adoptAccount({ ...EMPTY_WINDOW_STATE }, ACCOUNT),
      '/code',
      ACCOUNT,
    );
    const inLibrary = rememberRoute(inCode, '/chat/library', ACCOUNT);
    expect(adoptAccount(inLibrary, ACCOUNT)).toMatchObject({
      lastAccount: ACCOUNT,
      lastRoute: '/chat/library',
    });
  });

  it('drops the route only when a different account signs in', () => {
    const inCode = rememberRoute(
      adoptAccount({ ...EMPTY_WINDOW_STATE }, ACCOUNT),
      '/code',
      ACCOUNT,
    );
    expect(adoptAccount(inCode, 'b'.repeat(32)).lastRoute).toBeNull();
  });

  it('reopens on whichever mode the window was left in', () => {
    for (const route of ['/code', '/chat/library', '/projects', '/settings']) {
      const state = rememberRoute(adoptAccount({ ...EMPTY_WINDOW_STATE }, ACCOUNT), route, ACCOUNT);
      expect(resolveWindowRestore(state, [{ workArea: WORK_AREA }]).route).toBe(route);
    }
  });
});

describe('what the reader is told about an update', () => {
  it('says the app is current, and which versions it compared', () => {
    const prompt = desktopUpdatePrompt({
      available: false,
      currentVersion: '1.2.3',
      version: '1.2.3',
      downloadUrl: '',
    });
    expect(prompt).toMatchObject({ type: 'info', title: 'AGI Cloud is up to date' });
    expect(prompt.detail).toContain('Installed: 1.2.3');
    expect(prompt.downloadButton).toBeNull();
  });

  it('offers the download only when there is one, and says it does not install itself', () => {
    const prompt = desktopUpdatePrompt({
      available: true,
      currentVersion: '1.2.3',
      version: '1.3.0',
      downloadUrl: 'https://agiworkforce.com/api/download',
    });
    expect(prompt.message).toContain('1.3.0');
    expect(prompt.detail).toContain('does not install automatically');
    expect(prompt.buttons[prompt.downloadButton ?? -1]).toBe('Download Installer');
  });

  it('says the check failed rather than saying the app is up to date', () => {
    const prompt = desktopUpdatePrompt({
      failure: 'AGI Cloud could not reach the update service.',
    });
    expect(prompt.type).toBe('error');
    expect(prompt.title).not.toContain('up to date');
    expect(prompt.downloadButton).toBeNull();
  });

  it('never tells the reader to download something on a failed check', () => {
    for (const prompt of [
      desktopUpdatePrompt({ failure: 'x' }),
      desktopUpdatePrompt({
        available: false,
        currentVersion: '1.0.0',
        version: '1.0.0',
        downloadUrl: '',
      }),
    ]) {
      expect(prompt.buttons).toEqual(['OK']);
    }
  });
});

describe('a screen the shell captures', () => {
  it('asks for the pixels the display actually has, not the points it reports', () => {
    expect(
      physicalCaptureSize({
        id: 1,
        label: 'built in',
        size: { width: 1512, height: 982 },
        scaleFactor: 2,
      }),
    ).toEqual({ width: 3024, height: 1964 });
  });

  it('captures a one-to-one display at its own size', () => {
    expect(
      physicalCaptureSize({
        id: 2,
        label: 'external',
        size: { width: 1920, height: 1080 },
        scaleFactor: 1,
      }),
    ).toEqual({ width: 1920, height: 1080 });
  });

  it('falls back to one rather than capturing nothing when a display reports no scale', () => {
    expect(
      physicalCaptureSize({
        id: 3,
        label: 'odd',
        size: { width: 800, height: 600 },
        scaleFactor: 0,
      }),
    ).toEqual({ width: 800, height: 600 });
  });
});
