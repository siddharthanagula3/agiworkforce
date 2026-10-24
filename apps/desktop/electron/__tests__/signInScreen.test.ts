import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PRODUCT_BRAND, PRODUCT_NAMES } from '@agiworkforce/types';
import { readShellTokens } from '../shellTokens.mjs';
import {
  createSignInScreens,
  nextSignInScreen,
  readSignInScreenAction,
  signInScreenActionUrl,
  signInScreenUrl,
  signInScreenView,
  type SignInScreenWindow,
} from '../signInScreen';

const ORIGIN = 'https://agiworkforce.com';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const tokens = readShellTokens(repoRoot);

beforeAll(() => {
  Object.assign(globalThis, {
    AGI_PAGE_INK_LIGHT: tokens.pageInkLight,
    AGI_PAGE_INK_DARK: tokens.pageInkDark,
    AGI_PAGE_SECONDARY_INK_LIGHT: tokens.pageSecondaryInkLight,
    AGI_PAGE_SECONDARY_INK_DARK: tokens.pageSecondaryInkDark,
  });
});

function decode(url: string): string {
  return decodeURIComponent(url.replace(/^data:text\/html;charset=utf-8,/, ''));
}

function fakeWindow(id = 1) {
  const loads: string[] = [];
  const win: SignInScreenWindow = {
    id,
    isDestroyed: () => false,
    loadURL: vi.fn(async (url: string) => {
      loads.push(url);
    }),
  };
  return { win, loads, last: () => decode(loads.at(-1) ?? '') };
}

function buttonHrefs(html: string): string[] {
  return [...html.matchAll(/data-href="([^"]+)"/g)].map((match) =>
    (match[1] ?? '').replace(/&amp;/g, '&'),
  );
}

function harness(options: { pending?: boolean; failOpen?: boolean } = {}) {
  let pending = options.pending ?? false;
  let tokenCount = 0;
  const startBrowserSignIn = vi.fn(async () => {
    if (options.failOpen) throw new Error('No browser');
    pending = true;
  });
  const cancelBrowserSignIn = vi.fn(() => {
    pending = false;
  });
  const screens = createSignInScreens({
    appOrigin: ORIGIN,
    startBrowserSignIn,
    cancelBrowserSignIn,
    browserSignInPending: () => pending,
    newToken: () => `token${(tokenCount += 1)}`,
  });
  return { screens, startBrowserSignIn, cancelBrowserSignIn };
}

describe('the sign-in screen copy', () => {
  it('asks for one thing in one line, named from the product registry', () => {
    expect(signInScreenView('idle')).toEqual({
      title: PRODUCT_NAMES.desktop,
      line: `Sign in to ${PRODUCT_BRAND}`,
      actions: [{ label: 'Continue in browser', action: 'start' }],
    });
    expect(signInScreenView('waiting').line).toBe('Finish signing in in your browser');
    expect(signInScreenView('waiting').actions.map((action) => action.label)).toEqual([
      'Open browser again',
      'Cancel',
    ]);
    expect(signInScreenView('expired').line).toBe('Sign-in link expired.');
    expect(signInScreenView('expired').actions).toEqual([{ label: 'Try again', action: 'start' }]);
    expect(signInScreenView('unopened').actions).toEqual([{ label: 'Try again', action: 'start' }]);
  });

  it('draws a draggable title strip, both appearances from the tokens, and an ink button', () => {
    const html = decode(signInScreenUrl('idle', 'abc', ORIGIN));
    expect(html).toContain('-webkit-app-region:drag');
    expect(html).toContain('-webkit-app-region:no-drag');
    expect(html).toContain(`--ground:${tokens.pageBackgroundLight};--ink:${tokens.pageInkLight}`);
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain(`--ground:${tokens.pageBackgroundDark};--ink:${tokens.pageInkDark}`);
    expect(html).toContain('.primary{background:var(--ink);color:var(--ground)');
    expect(html).not.toMatch(/#da7756|orange/iu);
    expect(html).toContain(`<title>${PRODUCT_NAMES.desktop}</title>`);
  });

  it('aims every button at the shell with its action and the screen token', () => {
    const hrefs = buttonHrefs(decode(signInScreenUrl('waiting', 'tok', ORIGIN)));
    expect(hrefs.map((href) => readSignInScreenAction(href, ORIGIN))).toEqual([
      { action: 'start', token: 'tok' },
      { action: 'cancel', token: 'tok' },
    ]);
  });

  it('reads an action only off the browser sign-in path on the app origin', () => {
    const start = signInScreenActionUrl('start', 'tok', ORIGIN);
    expect(readSignInScreenAction(start, ORIGIN)).toEqual({ action: 'start', token: 'tok' });
    expect(readSignInScreenAction(start.replace(ORIGIN, 'https://evil.test'), ORIGIN)).toBeNull();
    expect(readSignInScreenAction(`${ORIGIN}/login#agi-sign-in=start.tok`, ORIGIN)).toBeNull();
    expect(
      readSignInScreenAction(`${ORIGIN}/auth/desktop#agi-sign-in=delete.tok`, ORIGIN),
    ).toBeNull();
    expect(readSignInScreenAction(`${ORIGIN}/auth/desktop`, ORIGIN)).toBeNull();
  });
});

describe('the sign-in screen state machine', () => {
  it('moves idle to waiting to idle, and shows an expiry or a failed launch with a retry', () => {
    expect(nextSignInScreen('idle', 'show', false)).toBe('idle');
    expect(nextSignInScreen('idle', 'show', true)).toBe('waiting');
    expect(nextSignInScreen('idle', 'start', false)).toBe('waiting');
    expect(nextSignInScreen('waiting', 'cancel', true)).toBe('idle');
    expect(nextSignInScreen('waiting', 'open-failed', false)).toBe('unopened');
    expect(nextSignInScreen('idle', 'open-failed', false)).toBe('idle');
    expect(nextSignInScreen('waiting', 'link-expired', false)).toBe('expired');
    expect(nextSignInScreen('expired', 'show', false)).toBe('expired');
    expect(nextSignInScreen('waiting', 'show', false)).toBe('idle');
    expect(nextSignInScreen('waiting', 'link-complete', false)).toBe('idle');
  });

  it('starts the browser sign-in from the button and shows the wait', async () => {
    const { screens, startBrowserSignIn } = harness();
    const window = fakeWindow();
    screens.request(window.win, `${ORIGIN}/login?redirectTo=%2Fchat`);
    expect(window.last()).toContain(`Sign in to ${PRODUCT_BRAND}`);

    const [start] = buttonHrefs(window.last());
    screens.request(window.win, start!);
    await Promise.resolve();
    expect(startBrowserSignIn).toHaveBeenCalledTimes(1);
    expect(screens.state()).toBe('waiting');
    expect(window.last()).toContain('Finish signing in in your browser');
    expect(window.last()).toContain('Open browser again');
  });

  it('cancels back to the first screen', () => {
    const { screens, cancelBrowserSignIn } = harness({ pending: true });
    const window = fakeWindow();
    screens.show(window.win);
    const [, cancel] = buttonHrefs(window.last());
    screens.request(window.win, cancel!);
    expect(cancelBrowserSignIn).toHaveBeenCalledTimes(1);
    expect(screens.state()).toBe('idle');
    expect(window.last()).toContain('Continue in browser');
  });

  it('says the browser did not open instead of waiting on nothing', async () => {
    const { screens } = harness({ failOpen: true });
    const window = fakeWindow();
    screens.show(window.win);
    screens.request(window.win, buttonHrefs(window.last())[0]!);
    await vi.waitFor(() => expect(screens.state()).toBe('unopened'));
    expect(window.last()).toContain("Your browser didn't open.");
    expect(window.last()).toContain('Try again');
  });

  it('refuses a button press carrying a token from an older drawing or a page that guessed', () => {
    const { screens, startBrowserSignIn } = harness();
    const window = fakeWindow();
    screens.show(window.win);
    const stale = buttonHrefs(window.last())[0]!;
    screens.show(window.win);
    screens.request(window.win, stale);
    screens.request(window.win, signInScreenActionUrl('start', 'guessed', ORIGIN));
    expect(startBrowserSignIn).not.toHaveBeenCalled();
    expect(screens.state()).toBe('idle');
  });

  it('shows an expired link on the screen and offers to try again', () => {
    const { screens } = harness({ pending: true });
    const window = fakeWindow();
    screens.show(window.win);
    expect(screens.linkExpired(false)).toBe(true);
    expect(window.last()).toContain('Sign-in link expired.');
    expect(window.last()).toContain('Try again');
  });

  it('holds an expiry for the next screen only when asked, and drops it once signed in', () => {
    const { screens } = harness();
    expect(screens.linkExpired(false)).toBe(false);
    expect(screens.linkExpired(true)).toBe(true);
    const window = fakeWindow();
    screens.show(window.win);
    expect(window.last()).toContain('Sign-in link expired.');

    screens.reset();
    screens.show(window.win);
    expect(window.last()).toContain(`Sign in to ${PRODUCT_BRAND}`);
  });

  it('forgets every screen once a sign-in completes, so nothing redraws over it', () => {
    const { screens } = harness({ pending: true });
    const window = fakeWindow();
    screens.show(window.win);
    const drawn = window.loads.length;
    screens.linkCompleted();
    expect(screens.isShowing(window.win)).toBe(false);
    expect(screens.state()).toBe('idle');
    expect(screens.linkExpired(false)).toBe(false);
    expect(window.loads).toHaveLength(drawn);
  });
});
