import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  DEFAULT_SHORTCUTS,
  acceleratorIdentity,
  centeredUpperPosition,
  duplicateShortcutKeys,
  fillsWorkArea,
  frameFillingWorkArea,
  centeredFrame,
  tiledFrame,
  frameSavedBeforeTile,
  frameToRestore,
  arrangedFrames,
  cascadedFrames,
  windowSetAfterJoin,
  windowSetWithout,
  followNavigationState,
  frameIsOnScreen,
  isShortcutOff,
  isUsableAccelerator,
  MAX_ZOOM_LEVEL,
  MIN_ZOOM_LEVEL,
  ZOOM_LEVEL_STEP,
  clampZoomLevel,
  normalizePreferences,
  normalizeShortcuts,
  parsePreferencesFile,
  normalizeWindowFrame,
  parseSettingsFile,
  pickSourceForDisplay,
  pickableCaptureSources,
  pageMayWriteShortcut,
  SHORTCUT_CHOICES,
  shortcutMayBeOff,
} from '../garnishCore';

describe('parseSettingsFile', () => {
  it('returns defaults for corrupt JSON rather than throwing', () => {
    expect(parseSettingsFile('{ not json')).toEqual(DEFAULT_SHORTCUTS);
    expect(parseSettingsFile('')).toEqual(DEFAULT_SHORTCUTS);
  });

  it('returns defaults for JSON that is not an object', () => {
    expect(parseSettingsFile('null')).toEqual(DEFAULT_SHORTCUTS);
    expect(parseSettingsFile('42')).toEqual(DEFAULT_SHORTCUTS);
    expect(parseSettingsFile('["Alt+Space"]')).toEqual(DEFAULT_SHORTCUTS);
  });

  it('keeps valid overrides and defaults the rest', () => {
    expect(parseSettingsFile('{"quickAskShortcut":"Alt+Space"}')).toEqual({
      ...DEFAULT_SHORTCUTS,
      quickAskShortcut: 'Alt+Space',
    });
  });

  it('drops unknown keys', () => {
    expect(parseSettingsFile('{"somethingElse":true}')).toEqual(DEFAULT_SHORTCUTS);
  });
});

describe('duplicateShortcutKeys', () => {
  it('finds no duplicate among the shipped defaults', () => {
    expect(duplicateShortcutKeys(DEFAULT_SHORTCUTS)).toEqual([]);
  });

  it('leaves the earlier key holding a chord two keys claim', () => {
    expect(
      duplicateShortcutKeys({
        ...DEFAULT_SHORTCUTS,
        voiceShortcut: DEFAULT_SHORTCUTS.screenshotShortcut,
      }),
    ).toEqual(['voiceShortcut']);
  });
});

describe('acceleratorIdentity', () => {
  it('collapses modifier spelling, order and case to one chord', () => {
    expect(acceleratorIdentity('Alt+CmdOrCtrl+v')).toBe(
      acceleratorIdentity('CommandOrControl+Alt+V'),
    );
  });

  it('keeps chords with different keys apart', () => {
    expect(acceleratorIdentity('Alt+Shift+V')).not.toBe(acceleratorIdentity('Alt+Shift+D'));
  });
});

describe('normalizeShortcuts', () => {
  it('rejects values that would make globalShortcut throw', () => {
    for (const bad of ['   ', 'Alt + Space', 42, null, undefined, {}]) {
      expect(normalizeShortcuts({ quickAskShortcut: bad }).quickAskShortcut).toBe(
        DEFAULT_SHORTCUTS.quickAskShortcut,
      );
    }
  });

  // An empty accelerator is the user picking "No shortcut" in the desktop
  // settings panel. Springing it back to the default would turn a choice into
  // a shortcut the user had just switched off.
  it('keeps an empty accelerator, which is the user choosing no shortcut', () => {
    expect(normalizeShortcuts({ quickAskShortcut: '' }).quickAskShortcut).toBe('');
    expect(isShortcutOff('')).toBe(true);
    expect(isShortcutOff(DEFAULT_SHORTCUTS.quickAskShortcut)).toBe(false);
  });

  it('never reads Stop Agents as switched off, whatever the file says', () => {
    expect(normalizeShortcuts({ stopShortcut: '' }).stopShortcut).toBe(
      DEFAULT_SHORTCUTS.stopShortcut,
    );
    expect(shortcutMayBeOff('stopShortcut')).toBe(false);
    expect(shortcutMayBeOff('voiceShortcut')).toBe(true);
  });

  it('lets Stop Agents keep its chord when an earlier shortcut asks for the same one', () => {
    expect(
      duplicateShortcutKeys({
        ...DEFAULT_SHORTCUTS,
        quickAskShortcut: 'Alt+CommandOrControl+.',
        stopShortcut: 'CommandOrControl+Alt+.',
      }),
    ).toEqual(['quickAskShortcut']);
  });

  it('lets a page choose only an offered chord, the current one, or none where none is allowed', () => {
    const current = DEFAULT_SHORTCUTS.screenshotShortcut;

    for (const offered of SHORTCUT_CHOICES.screenshotShortcut) {
      expect(pageMayWriteShortcut('screenshotShortcut', offered, current), offered).toBe(true);
    }
    expect(pageMayWriteShortcut('screenshotShortcut', '', current)).toBe(true);
    expect(pageMayWriteShortcut('screenshotShortcut', 'F19', 'F19')).toBe(true);
    expect(pageMayWriteShortcut('screenshotShortcut', 'CommandOrControl+V', current)).toBe(false);
    expect(
      pageMayWriteShortcut('quickAskShortcut', SHORTCUT_CHOICES.stopShortcut[0] ?? '', ''),
    ).toBe(false);
    expect(pageMayWriteShortcut('stopShortcut', '', DEFAULT_SHORTCUTS.stopShortcut)).toBe(false);
    expect(pageMayWriteShortcut('stopShortcut', '', '')).toBe(false);
  });

  it('never counts two switched-off shortcuts as a collision', () => {
    const duplicates = duplicateShortcutKeys({
      quickAskShortcut: '',
      newChatShortcut: '',
      screenshotShortcut: '',
      windowShotShortcut: DEFAULT_SHORTCUTS.windowShotShortcut,
      voiceShortcut: DEFAULT_SHORTCUTS.voiceShortcut,
      stopShortcut: '',
    });

    expect(duplicates).toEqual([]);
  });

  it('accepts a well-formed accelerator', () => {
    expect(isUsableAccelerator('CommandOrControl+Shift+2')).toBe(true);
    expect(isUsableAccelerator('Alt+ Space')).toBe(false);
  });
});

describe('pickSourceForDisplay', () => {
  it('matches on display_id first', () => {
    const sources = [
      { display_id: '111', id: 'screen:111:0' },
      { display_id: '222', id: 'screen:222:0' },
    ];
    expect(pickSourceForDisplay(sources, 222)).toBe(sources[1]);
  });

  it('falls back to the id segment when display_id is empty', () => {
    const sources = [
      { display_id: '', id: 'screen:111:0' },
      { display_id: '', id: 'screen:222:0' },
    ];
    expect(pickSourceForDisplay(sources, '222')).toBe(sources[1]);
  });

  it('falls back to the first source rather than capturing nothing', () => {
    const sources = [{ display_id: '999', id: 'screen:999:0' }];
    expect(pickSourceForDisplay(sources, 111)).toBe(sources[0]);
  });

  it('returns null when there is nothing to capture', () => {
    expect(pickSourceForDisplay([], 111)).toBeNull();
  });
});

describe('centeredUpperPosition', () => {
  it('centres horizontally and sits in the upper third of the work area', () => {
    const { x, y } = centeredUpperPosition({ x: 0, y: 0, width: 1920, height: 1080 }, 480, 620);
    expect(x).toBe(720);
    expect(y).toBe(194);
  });

  it('respects a secondary display offset', () => {
    const { x, y } = centeredUpperPosition(
      { x: -1440, y: 300, width: 1440, height: 900 },
      480,
      620,
    );
    expect(x).toBe(-960);
    expect(y).toBe(462);
  });

  it('never pushes the panel below the bottom of a short display', () => {
    const { y } = centeredUpperPosition({ x: 0, y: 0, width: 1280, height: 700 }, 480, 620);
    expect(y).toBeLessThanOrEqual(80);
  });
});

describe('pickableCaptureSources', () => {
  it('lists screens before windows', () => {
    const sources = [
      { id: 'window:9:0', name: 'Safari' },
      { id: 'screen:1:0', name: 'Built-in Retina Display' },
    ];
    expect(pickableCaptureSources(sources).map((source) => source.id)).toEqual([
      'screen:1:0',
      'window:9:0',
    ]);
  });

  it('drops unnamed helper windows that would capture as blank', () => {
    const sources = [
      { id: 'screen:1:0', name: 'Screen 1' },
      { id: 'window:9:0', name: '   ' },
      { id: 'window:10:0', name: 'Terminal' },
    ];
    expect(pickableCaptureSources(sources).map((source) => source.id)).toEqual([
      'screen:1:0',
      'window:10:0',
    ]);
  });

  it('bounds the list so the picker stays a picker', () => {
    const sources = Array.from({ length: 40 }, (_, index) => ({
      id: `window:${index}:0`,
      name: `Window ${index}`,
    }));
    expect(pickableCaptureSources(sources)).toHaveLength(12);
    expect(pickableCaptureSources(sources, 3)).toHaveLength(3);
  });

  it('returns nothing when no source is offerable', () => {
    expect(pickableCaptureSources([{ id: 'window:1:0', name: '' }])).toEqual([]);
  });
});

describe('normalizePreferences appearance', () => {
  it('defaults to system so a fresh install follows macOS', () => {
    expect(normalizePreferences({}).appearance).toBe('system');
    expect(normalizePreferences({ appearance: 'sepia' }).appearance).toBe('system');
    expect(normalizePreferences({ appearance: 3 }).appearance).toBe('system');
  });

  it('keeps the three values the renderer theme channel accepts', () => {
    expect(normalizePreferences({ appearance: 'dark' }).appearance).toBe('dark');
    expect(normalizePreferences({ appearance: 'light' }).appearance).toBe('light');
    expect(normalizePreferences({ appearance: 'system' }).appearance).toBe('system');
  });
});

describe('normalizePreferences worktrees and archiving', () => {
  it('defaults to the agi/ prefix, the CLI worktree folder and no archiving', () => {
    const preferences = normalizePreferences({});
    expect(preferences.worktreeBranchPrefix).toBe('agi/');
    expect(preferences.worktreeLocation).toBe('');
    expect(preferences.autoArchiveIdleDays).toBe(0);
  });

  it('keeps a valid prefix, an absolute folder and a listed day count', () => {
    const preferences = normalizePreferences({
      worktreeBranchPrefix: 'team/',
      worktreeLocation: '/Users/me/worktrees',
      autoArchiveIdleDays: 14,
    });
    expect(preferences.worktreeBranchPrefix).toBe('team/');
    expect(preferences.worktreeLocation).toBe('/Users/me/worktrees');
    expect(preferences.autoArchiveIdleDays).toBe(14);
  });

  it('drops a prefix git would refuse, a relative folder and an unlisted day count', () => {
    const preferences = normalizePreferences({
      worktreeBranchPrefix: '../escape',
      worktreeLocation: 'relative/path',
      autoArchiveIdleDays: 3,
    });
    expect(preferences.worktreeBranchPrefix).toBe('agi/');
    expect(preferences.worktreeLocation).toBe('');
    expect(preferences.autoArchiveIdleDays).toBe(0);
  });

  it('keeps listed terminal choices and replaces anything else with the default', () => {
    expect(normalizePreferences({}).terminal).toEqual({
      cursorStyle: 'block',
      cursorBlink: true,
      copyOnSelect: false,
      scrollback: 5_000,
    });
    expect(
      normalizePreferences({
        terminal: {
          cursorStyle: 'bar',
          cursorBlink: false,
          copyOnSelect: true,
          scrollback: 50_000,
        },
      }).terminal,
    ).toEqual({ cursorStyle: 'bar', cursorBlink: false, copyOnSelect: true, scrollback: 50_000 });
    expect(
      normalizePreferences({
        terminal: { cursorStyle: 'beam', cursorBlink: 'yes', scrollback: 1e9 },
      }).terminal,
    ).toEqual({ cursorStyle: 'block', cursorBlink: true, copyOnSelect: false, scrollback: 5_000 });
  });
});

describe('normalizeWindowFrame', () => {
  it('answers null for anything that is not a complete frame', () => {
    expect(normalizeWindowFrame(undefined)).toBeNull();
    expect(normalizeWindowFrame(null)).toBeNull();
    expect(normalizeWindowFrame('1280x800')).toBeNull();
    expect(normalizeWindowFrame([0, 0, 1280, 800])).toBeNull();
    expect(normalizeWindowFrame({ x: 0, y: 0, width: 1280 })).toBeNull();
    expect(normalizeWindowFrame({ x: 0, y: 0, width: Number.NaN, height: 800 })).toBeNull();
  });

  it('rejects a frame smaller than the window can be, rather than restoring it', () => {
    expect(normalizeWindowFrame({ x: 0, y: 0, width: 320, height: 800 })).toBeNull();
    expect(normalizeWindowFrame({ x: 0, y: 0, width: 1280, height: 200 })).toBeNull();
  });

  it('rounds a fractional frame and defaults maximized to false', () => {
    expect(normalizeWindowFrame({ x: 10.4, y: 20.6, width: 1280.2, height: 800.8 })).toEqual({
      x: 10,
      y: 21,
      width: 1280,
      height: 801,
      maximized: false,
    });
  });

  it('carries the maximized flag through', () => {
    expect(
      normalizeWindowFrame({ x: 0, y: 0, width: 1280, height: 800, maximized: true })?.maximized,
    ).toBe(true);
  });

  it('is what the preference reader uses, so a corrupt frame cannot reach a window', () => {
    expect(normalizePreferences({ windowFrame: { width: 10, height: 10 } }).windowFrame).toBeNull();
    expect(DEFAULT_PREFERENCES.windowFrame).toBeNull();
  });
});

describe('frameIsOnScreen', () => {
  const laptop = { x: 0, y: 25, width: 1470, height: 895 };
  const external = { x: 1470, y: 0, width: 2560, height: 1440 };

  it('accepts a frame sitting on a display that is still attached', () => {
    expect(
      frameIsOnScreen({ x: 95, y: 33, width: 1280, height: 800, maximized: false }, [laptop]),
    ).toBe(true);
  });

  it('rejects a frame left on a display that has been unplugged', () => {
    expect(
      frameIsOnScreen({ x: 1800, y: 400, width: 1280, height: 800, maximized: false }, [laptop]),
    ).toBe(false);
    expect(
      frameIsOnScreen({ x: 1800, y: 400, width: 1280, height: 800, maximized: false }, [
        laptop,
        external,
      ]),
    ).toBe(true);
  });

  it('rejects a frame overlapping by less than a draggable strip', () => {
    expect(
      frameIsOnScreen({ x: 1430, y: 100, width: 1280, height: 800, maximized: false }, [laptop]),
    ).toBe(false);
  });
});

describe('fillsWorkArea', () => {
  const workArea = { x: 0, y: 33, width: 1470, height: 836 };

  it('recognises the frame a zoomed window occupies', () => {
    expect(fillsWorkArea({ x: 0, y: 33, width: 1470, height: 836 }, workArea)).toBe(true);
  });

  it('tolerates the dozen pixels a zoom lands off by on a notched display', () => {
    expect(fillsWorkArea({ x: 2, y: 34, width: 1468, height: 834 }, workArea)).toBe(true);
    expect(fillsWorkArea({ x: 5, y: 35, width: 1457, height: 832 }, workArea)).toBe(true);
  });

  it('builds the frame Window > Fill gives the front window', () => {
    expect(frameFillingWorkArea(workArea)).toEqual(workArea);
    expect(fillsWorkArea(frameFillingWorkArea(workArea), workArea)).toBe(true);
  });

  it('builds the frame Window > Center gives the front window', () => {
    const frame = { x: 40, y: 80, width: 800, height: 600 };
    expect(centeredFrame(frame, workArea)).toEqual({
      x: 335,
      y: 151,
      width: 800,
      height: 600,
    });
  });

  it('keeps the frame Move & Resize had before the first tile', () => {
    const current = { x: 40, y: 80, width: 800, height: 600 };
    const left = tiledFrame(workArea, 'left');
    const right = tiledFrame(workArea, 'right');

    expect(frameToRestore(null)).toBeNull();
    expect(frameSavedBeforeTile(current, current, null)).toBeNull();

    const saved = frameSavedBeforeTile(current, left, null);
    expect(saved).toEqual(current);
    expect(frameSavedBeforeTile(left, right, saved)).toEqual(current);
    expect(frameToRestore(saved)).toEqual(current);
  });

  it('builds the frames Window > Move & Resize gives the front window', () => {
    const left = tiledFrame(workArea, 'left');
    const right = tiledFrame(workArea, 'right');
    const top = tiledFrame(workArea, 'top');
    const bottom = tiledFrame(workArea, 'bottom');
    const topLeft = tiledFrame(workArea, 'top-left');

    expect(left.x).toBe(workArea.x);
    expect(left.y).toBe(workArea.y);
    expect(left.height).toBe(workArea.height);
    expect(right.y).toBe(workArea.y);
    expect(right.height).toBe(workArea.height);
    expect(left.width + right.width).toBe(workArea.width);
    expect(right.x).toBe(workArea.x + left.width);
    expect(top.width).toBe(workArea.width);
    expect(top.height + bottom.height).toBe(workArea.height);
    expect(bottom.y).toBe(workArea.y + top.height);
    expect(topLeft.width).toBe(left.width);
    expect(topLeft.height).toBe(top.height);
  });

  it('builds the frames Window > Arrange in Front gives the open windows', () => {
    const front = { width: 800, height: 600 };
    const behind = { width: 640, height: 480 };
    const frames = cascadedFrames([front, behind], workArea);
    expect(frames).toHaveLength(2);
    const first = frames[0];
    const second = frames[1];
    if (!first || !second) return;

    expect(first.width).toBe(front.width);
    expect(first.height).toBe(front.height);
    expect(second.width).toBe(behind.width);
    expect(second.height).toBe(behind.height);
    const step = second.x - first.x;
    expect(step).toBeGreaterThan(0);
    expect(second.y - first.y).toBe(step);
    const spanW = Math.max(...frames.map((frame) => frame.x + frame.width)) - first.x;
    const spanH = Math.max(...frames.map((frame) => frame.y + frame.height)) - first.y;
    expect(first.x).toBe(workArea.x + Math.round((workArea.width - spanW) / 2));
    expect(first.y).toBe(workArea.y + Math.round((workArea.height - spanH) / 2));
    expect(cascadedFrames([front], workArea)[0]).toEqual(
      centeredFrame({ x: 0, y: 0, width: front.width, height: front.height }, workArea),
    );
  });

  it('drops the front window from the set Window > Remove Window from Set edits', () => {
    expect(windowSetAfterJoin([4], [9, 4])).toEqual([4, 9]);
    expect(windowSetWithout([4, 9, 2], 9)).toEqual([4, 2]);
    expect(windowSetWithout([9], 9)).toEqual([]);
  });

  it('builds the frames Window > Move & Resize gives a pair of windows', () => {
    const [front, beside] = arrangedFrames(workArea, 'left-right');
    const quarters = arrangedFrames(workArea, 'left-quarters');

    expect(front.x).toBe(workArea.x);
    expect(front.y).toBe(workArea.y);
    expect(front.height).toBe(workArea.height);
    expect(beside.height).toBe(workArea.height);
    expect(front.width + beside.width).toBe(workArea.width);
    expect(beside.x).toBe(workArea.x + front.width);
    expect(quarters[0].width).toBe(front.width);
    expect(quarters[1].x).toBe(quarters[2].x);
    expect(quarters[1].width).toBe(quarters[2].width);
    expect(quarters[1].height + quarters[2].height).toBe(workArea.height);
    expect(quarters[0].width + quarters[1].width).toBe(workArea.width);
  });

  it('builds the four frames Window > Move & Resize > Quarters gives the open windows', () => {
    const frames = arrangedFrames(workArea, 'quarters');

    expect(frames).toHaveLength(4);
    expect(frames[0]).toEqual(tiledFrame(workArea, 'top-left'));
    expect(frames[1]).toEqual(tiledFrame(workArea, 'top-right'));
    expect(frames[2]).toEqual(tiledFrame(workArea, 'bottom-left'));
    expect(frames[3]).toEqual(tiledFrame(workArea, 'bottom-right'));
    expect(new Set(frames.map((frame) => `${frame.x},${frame.y}`)).size).toBe(4);
  });

  it('does not mistake a window the user sized for a zoomed one', () => {
    expect(fillsWorkArea({ x: 95, y: 33, width: 1280, height: 800 }, workArea)).toBe(false);
    expect(fillsWorkArea({ x: 0, y: 33, width: 1470, height: 700 }, workArea)).toBe(false);
    expect(fillsWorkArea({ x: 29, y: 162, width: 1470, height: 836 }, workArea)).toBe(false);
    expect(fillsWorkArea({ x: 140, y: 90, width: 1100, height: 720 }, workArea)).toBe(false);
  });
});

describe('the zoom level a window reopens at', () => {
  it('comes back off the settings file at the value the user chose', () => {
    const chosen = normalizePreferences({
      zoomLevel: DEFAULT_PREFERENCES.zoomLevel + ZOOM_LEVEL_STEP,
    });
    expect(parsePreferencesFile(JSON.stringify(chosen)).zoomLevel).toBe(chosen.zoomLevel);
  });

  it('is held inside the range the renderer can draw', () => {
    expect(clampZoomLevel(MAX_ZOOM_LEVEL + 10)).toBe(MAX_ZOOM_LEVEL);
    expect(clampZoomLevel(MIN_ZOOM_LEVEL - 10)).toBe(MIN_ZOOM_LEVEL);
    expect(normalizePreferences({ zoomLevel: 99 }).zoomLevel).toBe(MAX_ZOOM_LEVEL);
  });

  it('falls back to actual size rather than a stored value that is not a number', () => {
    expect(clampZoomLevel(Number.NaN)).toBe(DEFAULT_PREFERENCES.zoomLevel);
    expect(normalizePreferences({ zoomLevel: 'big' }).zoomLevel).toBe(
      DEFAULT_PREFERENCES.zoomLevel,
    );
    expect(parsePreferencesFile('{ broken').zoomLevel).toBe(DEFAULT_PREFERENCES.zoomLevel);
  });
});

describe('the sleep and attention preferences', () => {
  it('keeps the computer awake during a turn unless the user turned that off', () => {
    expect(DEFAULT_PREFERENCES.preventSleepWhileRunning).toBe(true);
    expect(normalizePreferences({}).preventSleepWhileRunning).toBe(true);
    expect(normalizePreferences({ preventSleepWhileRunning: 'no' }).preventSleepWhileRunning).toBe(
      true,
    );
    expect(normalizePreferences({ preventSleepWhileRunning: false }).preventSleepWhileRunning).toBe(
      false,
    );
  });

  it('draws attention to the app only once the user asks for it', () => {
    expect(normalizePreferences({}).agentNotifications.drawAttention).toBe(false);
    expect(
      normalizePreferences({ agentNotifications: { drawAttention: 'yes' } }).agentNotifications
        .drawAttention,
    ).toBe(false);
    expect(
      normalizePreferences({ agentNotifications: { drawAttention: true } }).agentNotifications
        .drawAttention,
    ).toBe(true);
  });
});

describe('following a window history', () => {
  function contents(initial: { back: boolean; forward: boolean }) {
    const listeners = new Map<string, () => void>();
    const history = { ...initial };
    let destroyed = false;
    return {
      history,
      destroy: () => {
        destroyed = true;
      },
      fire: (event: string) => listeners.get(event)?.(),
      target: {
        navigationHistory: {
          canGoBack: () => history.back,
          canGoForward: () => history.forward,
        },
        isDestroyed: () => destroyed,
        on: (event: string, listener: () => void) => listeners.set(event, listener),
      },
    };
  }

  it('reports back and forward after a load and after an in-page route change', () => {
    const window = contents({ back: false, forward: false });
    const publish = vi.fn();
    followNavigationState(window.target, publish);

    window.history.back = true;
    window.fire('did-navigate');
    window.history.forward = true;
    window.fire('did-navigate-in-page');

    expect(publish.mock.calls).toEqual([
      [{ canGoBack: true, canGoForward: false }],
      [{ canGoBack: true, canGoForward: true }],
    ]);
  });

  it('says nothing for a window that is gone', () => {
    const window = contents({ back: true, forward: false });
    const publish = vi.fn();
    followNavigationState(window.target, publish);

    window.destroy();
    window.fire('did-navigate');

    expect(publish).not.toHaveBeenCalled();
  });
});
