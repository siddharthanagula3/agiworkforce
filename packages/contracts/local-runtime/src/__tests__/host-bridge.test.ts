import { describe, expect, it } from 'vitest';
import {
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  NO_HOST_SHORTCUT,
  defaultHostShortcut,
  describeAccelerator,
  describeHostPlatform,
} from '../host-bridge';

describe('host shortcuts', () => {
  it('offers a default and alternatives for every shortcut it names', () => {
    for (const key of HOST_SHORTCUT_KEYS) {
      expect(HOST_SHORTCUT_CHOICES[key].length, key).toBeGreaterThan(1);
      expect(defaultHostShortcut(key)).toBe(HOST_SHORTCUT_CHOICES[key][0]);
      expect(defaultHostShortcut(key)).not.toBe(NO_HOST_SHORTCUT);
    }
  });

  it('names one preference field per shortcut, and no field twice', () => {
    const fields = HOST_SHORTCUT_KEYS.map((key) => HOST_SHORTCUT_PREFERENCE_KEYS[key]);

    expect(new Set(fields).size).toBe(fields.length);
    expect(fields).toEqual(['quickAskShortcut', 'screenshotShortcut', 'voiceShortcut']);
  });

  it('never offers the same chord for two shortcuts', () => {
    const every = HOST_SHORTCUT_KEYS.flatMap((key) => [...HOST_SHORTCUT_CHOICES[key]]);

    expect(new Set(every).size).toBe(every.length);
  });
});

describe('describeAccelerator', () => {
  it('writes a chord the way macOS does, with symbols and no separator', () => {
    expect(describeAccelerator('CommandOrControl+Shift+2', 'electron-darwin')).toBe('⌘⇧2');
    expect(describeAccelerator('Alt+Shift+Space', 'darwin')).toBe('⌥⇧Space');
  });

  it('spells the portable modifier as the key the platform actually presses', () => {
    expect(describeAccelerator('CommandOrControl+Shift+2', 'electron-win32')).toBe('Ctrl+Shift+2');
    expect(describeAccelerator('Alt+Shift+V', 'electron-linux')).toBe('Alt+Shift+V');
  });

  it('leaves a switched-off shortcut empty for the caller to label', () => {
    expect(describeAccelerator(NO_HOST_SHORTCUT, 'electron-darwin')).toBe(NO_HOST_SHORTCUT);
  });
});

describe('describeHostPlatform', () => {
  it('answers the name a person would say', () => {
    expect(describeHostPlatform('electron-darwin')).toBe('macOS');
    expect(describeHostPlatform('electron-win32')).toBe('Windows');
    expect(describeHostPlatform('electron-linux')).toBe('Linux');
  });

  // A surface that printed the raw id would be showing the thing the bridge
  // uses to branch, which is not language.
  it('answers null for a platform it does not know, rather than the id', () => {
    expect(describeHostPlatform('electron-freebsd')).toBeNull();
    expect(describeHostPlatform('')).toBeNull();
    expect(describeHostPlatform('tauri')).toBeNull();
  });
});
