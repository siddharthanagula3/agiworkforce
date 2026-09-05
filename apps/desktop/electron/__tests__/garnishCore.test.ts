import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  acceleratorIdentity,
  centeredUpperPosition,
  duplicateShortcutKeys,
  isUsableAccelerator,
  normalizeShortcuts,
  parseSettingsFile,
  pickSourceForDisplay,
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
    for (const bad of ['', '   ', 'Alt + Space', 42, null, undefined, {}]) {
      expect(normalizeShortcuts({ quickAskShortcut: bad }).quickAskShortcut).toBe(
        DEFAULT_SHORTCUTS.quickAskShortcut,
      );
    }
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
