import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  MAX_SECONDARY_PANEL_WIDTH,
  MIN_SECONDARY_PANEL_WIDTH,
  clampFrameToWorkArea,
  displayKey,
  isRestorableRoute,
  normalizeSecondaryPanelWidth,
  normalizeWindowState,
  readWindowState,
  rememberFrame,
  restoreFrame,
  routeFromUrl,
  shouldFallBackToRoot,
  writeWindowState,
  type DisplaySummary,
  type ShellWindowState,
} from '../windowState';

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

  it('sends a route the server no longer resolves back to the root', () => {
    expect(shouldFallBackToRoot(404)).toBe(true);
    expect(shouldFallBackToRoot(500)).toBe(true);
    expect(shouldFallBackToRoot(200)).toBe(false);
    expect(shouldFallBackToRoot(undefined)).toBe(false);
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
    });

    expect(state.frames).toEqual({});
    expect(state.lastRoute).toBeNull();
    expect(state.lastWorkspace).toBeNull();
    expect(state.secondaryPanelWidth).toBeNull();
  });
});
