import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  MAX_SECONDARY_PANEL_WIDTH,
  MIN_SECONDARY_PANEL_WIDTH,
  accountFingerprint,
  adoptAccount,
  clampFrameToWorkArea,
  displayKey,
  isRestorableRoute,
  normalizeSecondaryPanelWidth,
  normalizeWindowState,
  readWindowState,
  rememberFrame,
  rememberRoute,
  resolveWindowRestore,
  restoreFrame,
  NEW_CHAT_ROUTE,
  routeFromUrl,
  shouldFallBackToRoot,
  writeWindowState,
  type DisplaySummary,
  type ShellWindowState,
} from '../windowState';
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from '../garnishCore';

const LAPTOP: DisplaySummary = { workArea: { x: 0, y: 25, width: 1512, height: 920 } };
const MONITOR: DisplaySummary = { workArea: { x: 1512, y: 0, width: 2560, height: 1440 } };

function frame(overrides: Partial<Record<string, number | boolean>> = {}) {
  return { x: 100, y: 100, width: 1280, height: 800, maximized: false, ...overrides } as {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
  };
}

function stateWithBothDisplays(): ShellWindowState {
  let state = normalizeWindowState(null);
  state = rememberFrame(state, LAPTOP, frame({ x: 10, y: 40 }), 1_000);
  state = rememberFrame(state, MONITOR, frame({ x: 1_600, y: 60, width: 1900 }), 2_000);
  return state;
}

const ADA = accountFingerprint({ signedIn: true, email: 'ada@example.com' })!;
const GRACE = accountFingerprint({ signedIn: true, email: 'grace@example.com' })!;

describe('a display is identified by its geometry, not its id', () => {
  it('gives two arrangements two keys and the same arrangement one', () => {
    expect(displayKey(LAPTOP)).not.toBe(displayKey(MONITOR));
    expect(displayKey({ workArea: { ...LAPTOP.workArea } })).toBe(displayKey(LAPTOP));
  });
});

describe('restoring the frame across a changing set of displays', () => {
  it('opens on the display the window was last used on', () => {
    const restored = restoreFrame(stateWithBothDisplays(), [LAPTOP, MONITOR]);
    expect(restored).toMatchObject({ x: 1_600, width: 1900 });
  });

  it('keeps each display its own frame rather than overwriting one with the other', () => {
    const restored = restoreFrame(stateWithBothDisplays(), [LAPTOP]);
    expect(restored).toMatchObject({ x: 10, y: 40 });
  });

  it('pulls the window onto the primary screen when its display is gone', () => {
    let state = normalizeWindowState(null);
    state = rememberFrame(state, MONITOR, frame({ x: 3_000, y: 900, width: 2200 }), 5_000);

    const restored = restoreFrame(state, [LAPTOP])!;

    expect(restored.x).toBeLessThan(LAPTOP.workArea.x + LAPTOP.workArea.width);
    expect(restored.y).toBeGreaterThanOrEqual(LAPTOP.workArea.y);
    expect(restored.width).toBeLessThanOrEqual(LAPTOP.workArea.width);
    expect(restored.height).toBeLessThanOrEqual(LAPTOP.workArea.height);
  });

  it('has nothing to restore before the first run, and nothing to crash on with no displays', () => {
    expect(restoreFrame(normalizeWindowState(null), [LAPTOP])).toBeNull();
    expect(restoreFrame(stateWithBothDisplays(), [])).toBeNull();
  });

  it('leaves a frame that already fits alone', () => {
    const fits = { ...frame({ x: 200, y: 200 }), updatedAt: 1 };
    expect(clampFrameToWorkArea(fits, LAPTOP.workArea)).toEqual(fits);
  });
});

describe('what may be restored as the opening route', () => {
  it('accepts an in-app path', () => {
    expect(isRestorableRoute('/chat/abc-123')).toBe(true);
    expect(isRestorableRoute('/projects?tab=files')).toBe(true);
  });

  it('refuses anything that is not a plain in-app path', () => {
    expect(isRestorableRoute('https://example.com/chat')).toBe(false);
    expect(isRestorableRoute('//example.com/chat')).toBe(false);
    expect(isRestorableRoute('/chat/../../etc/passwd')).toBe(false);
    expect(isRestorableRoute('chat')).toBe(false);
    expect(isRestorableRoute(42)).toBe(false);
  });

  it('refuses the flows whose meaning depends on the request that produced them', () => {
    expect(isRestorableRoute('/sign-in')).toBe(false);
    expect(isRestorableRoute('/sso-callback?code=x')).toBe(false);
    expect(isRestorableRoute('/api/chat')).toBe(false);
    expect(isRestorableRoute('/checkout/success')).toBe(false);
  });

  it('reads a route off a same-origin url only', () => {
    expect(routeFromUrl('https://app.example.com/chat/1?x=2', 'https://app.example.com')).toBe(
      '/chat/1?x=2',
    );
    expect(routeFromUrl('https://evil.example.com/chat/1', 'https://app.example.com')).toBeNull();
    expect(routeFromUrl('not a url', 'https://app.example.com')).toBeNull();
  });

  it('sends a route the server no longer resolves back to a new chat', () => {
    expect(shouldFallBackToRoot(404)).toBe(true);
    expect(shouldFallBackToRoot(403)).toBe(true);
    expect(shouldFallBackToRoot(500)).toBe(true);
    expect(shouldFallBackToRoot(200)).toBe(false);
    expect(shouldFallBackToRoot(undefined)).toBe(false);
    expect(isRestorableRoute(NEW_CHAT_ROUTE)).toBe(true);
  });

  it('forgets a deleted conversation rather than opening on it again', () => {
    const state = rememberRoute(normalizeWindowState(null), '/chat/deleted-one', ADA);
    const afterFallback = rememberRoute(state, null, ADA);

    expect(afterFallback.lastRoute).toBeNull();
    expect(resolveWindowRestore(adoptAccount(afterFallback, ADA), [LAPTOP]).route).toBeNull();
  });
});

describe('the secondary panel width', () => {
  it('is held between the widths the layout can actually draw', () => {
    expect(normalizeSecondaryPanelWidth(10)).toBe(MIN_SECONDARY_PANEL_WIDTH);
    expect(normalizeSecondaryPanelWidth(10_000)).toBe(MAX_SECONDARY_PANEL_WIDTH);
    expect(normalizeSecondaryPanelWidth(400)).toBe(400);
  });

  it('is absent rather than guessed when nothing was stored', () => {
    expect(normalizeSecondaryPanelWidth(undefined)).toBeNull();
    expect(normalizeSecondaryPanelWidth('420')).toBeNull();
  });
});

describe('the state file', () => {
  it('survives a round trip with every key intact', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'agi-window-state-')), 'state.json');
    let state = stateWithBothDisplays();
    state = {
      ...state,
      lastRoute: '/chat/abc',
      lastWorkspace: 'workspace-1',
      secondaryPanelWidth: 380,
    };
    writeWindowState(file, state);

    expect(readWindowState(file)).toEqual(state);
  });

  it('returns an empty state rather than throwing on a corrupt or missing file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agi-window-state-'));
    const corrupt = path.join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{ not json', 'utf8');

    expect(readWindowState(corrupt).frames).toEqual({});
    expect(readWindowState(path.join(dir, 'missing.json')).lastRoute).toBeNull();
  });

  it('drops a stored frame that is not a frame and a route that may not be restored', () => {
    const state = normalizeWindowState({
      frames: {
        a: { x: 'no', y: 0, width: 10, height: 10 },
        b: { x: 1, y: 2, width: 0, height: 5 },
      },
      lastRoute: '/sign-in',
      lastWorkspace: '   ',
      secondaryPanelWidth: Number.NaN,
      lastAccount: 'not-a-fingerprint',
      sidebarCollapsed: 'yes',
    });

    expect(state.frames).toEqual({});
    expect(state.lastRoute).toBeNull();
    expect(state.lastWorkspace).toBeNull();
    expect(state.secondaryPanelWidth).toBeNull();
    expect(state.lastAccount).toBeNull();
    expect(state.sidebarCollapsed).toBeNull();
  });
});

describe('the account a remembered route belongs to', () => {
  it('names an account without writing the address down', () => {
    expect(ADA).toMatch(/^[0-9a-f]{32}$/);
    expect(ADA).not.toBe(GRACE);
    expect(accountFingerprint({ signedIn: true, email: ' Ada@Example.com ' })).toBe(ADA);
    expect(accountFingerprint({ signedIn: false, email: 'ada@example.com' })).toBeNull();
    expect(accountFingerprint({ signedIn: true, email: null })).toBeNull();
  });

  it('records a route against whoever is looking at it, and nothing while signed out', () => {
    const signedIn = rememberRoute(normalizeWindowState(null), '/chat/ada-1', ADA);
    expect(signedIn).toMatchObject({ lastRoute: '/chat/ada-1', lastRouteAccount: ADA });

    const signedOut = rememberRoute(signedIn, '/chat/ada-2', null);
    expect(signedOut).toMatchObject({ lastRoute: null, lastRouteAccount: null });
  });
});

describe('what a launch restores', () => {
  function afterAdaLeft(): ShellWindowState {
    let state = rememberFrame(normalizeWindowState(null), LAPTOP, frame(), 1_000);
    state = rememberRoute(state, '/chat/ada-private', ADA);
    state = { ...state, lastWorkspace: '/Users/ada/secrets' };
    return adoptAccount(state, ADA);
  }

  it('reopens the route for the account that left it there', () => {
    const restored = resolveWindowRestore(afterAdaLeft(), [LAPTOP]);
    expect(restored.route).toBe('/chat/ada-private');
    expect(restored.workspace).toBe('/Users/ada/secrets');
  });

  it('never reopens it for a different account', () => {
    const switched = adoptAccount(afterAdaLeft(), GRACE);
    const restored = resolveWindowRestore(switched, [LAPTOP]);

    expect(switched.lastRoute).toBeNull();
    expect(restored.route).toBeNull();
    expect(restored.workspace).toBeNull();
  });

  it('never reopens it after a sign-out, whoever signs in next', () => {
    const signedOut = adoptAccount(afterAdaLeft(), null);
    expect(resolveWindowRestore(signedOut, [LAPTOP]).route).toBeNull();
    expect(resolveWindowRestore(adoptAccount(signedOut, GRACE), [LAPTOP]).route).toBeNull();
  });

  it('refuses a route left by an account the shell can no longer name', () => {
    const orphaned = { ...afterAdaLeft(), lastAccount: null };
    expect(resolveWindowRestore(orphaned, [LAPTOP]).route).toBeNull();
  });

  it('keeps the route across a relaunch as the same account', () => {
    const relaunched = adoptAccount(afterAdaLeft(), ADA);
    expect(resolveWindowRestore(relaunched, [LAPTOP]).route).toBe('/chat/ada-private');
  });
});

describe('the bounds a launch opens on', () => {
  const TINY: DisplaySummary = { workArea: { x: 0, y: 0, width: 640, height: 480 } };

  it('opens centred at a usable size before there is anything to restore', () => {
    const { bounds, maximized } = resolveWindowRestore(normalizeWindowState(null), [LAPTOP]);
    expect(bounds.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
    expect(bounds.height).toBeGreaterThanOrEqual(MIN_WINDOW_HEIGHT);
    expect(bounds.x).toBeGreaterThanOrEqual(LAPTOP.workArea.x);
    expect(maximized).toBe(false);
  });

  it('never opens smaller than the layout can draw', () => {
    const state = rememberFrame(normalizeWindowState(null), LAPTOP, frame({ width: 40 }), 1);
    expect(resolveWindowRestore(state, [LAPTOP]).bounds.width).toBe(MIN_WINDOW_WIDTH);
  });

  it('gives up the minimum rather than overflow a screen smaller than it', () => {
    const state = rememberFrame(normalizeWindowState(null), TINY, frame(), 1);
    const { bounds } = resolveWindowRestore(state, [TINY]);
    expect(bounds.width).toBe(TINY.workArea.width);
    expect(bounds.height).toBe(TINY.workArea.height);
  });

  it('never opens off-screen once the display it was on is gone', () => {
    let state = rememberFrame(normalizeWindowState(null), MONITOR, frame({ x: 3_000, y: 900 }), 5);
    state = rememberFrame(
      state,
      { workArea: { x: -1_920, y: 0, width: 1_920, height: 1_080 } },
      frame({ x: -1_800, y: 10 }),
      6,
    );

    for (const displays of [[LAPTOP], [TINY], [LAPTOP, MONITOR]]) {
      const { bounds } = resolveWindowRestore(state, displays);
      const onSome = displays.some(
        ({ workArea }) =>
          bounds.x + bounds.width > workArea.x &&
          bounds.x < workArea.x + workArea.width &&
          bounds.y + bounds.height > workArea.y &&
          bounds.y < workArea.y + workArea.height,
      );
      expect(onSome).toBe(true);
    }
  });

  it('opens on the defaults rather than nothing when the state file is corrupt', () => {
    const { bounds, route, workspace } = resolveWindowRestore(normalizeWindowState('{ broken'), [
      LAPTOP,
    ]);
    expect(bounds.width).toBeGreaterThanOrEqual(MIN_WINDOW_WIDTH);
    expect(route).toBeNull();
    expect(workspace).toBeNull();
  });

  it('carries the layout the shell is holding for the next window', () => {
    const state = {
      ...normalizeWindowState(null),
      secondaryPanelWidth: 380,
      sidebarCollapsed: true,
    };
    const restored = resolveWindowRestore(state, [LAPTOP]);
    expect(restored.secondaryPanelWidth).toBe(380);
    expect(restored.sidebarCollapsed).toBe(true);
  });
});
