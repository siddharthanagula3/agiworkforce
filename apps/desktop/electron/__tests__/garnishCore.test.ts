import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  DEFAULT_SHORTCUTS,
  acceleratorIdentity,
  centeredUpperPosition,
  duplicateShortcutKeys,
  fillsWorkArea,
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

  it('never counts two switched-off shortcuts as a collision', () => {
    const duplicates = duplicateShortcutKeys({
      quickAskShortcut: '',
      screenshotShortcut: '',
      voiceShortcut: DEFAULT_SHORTCUTS.voiceShortcut,
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
