import { describe, expect, it } from 'vitest';
import {
  HOST_IN_WINDOW_SIGN_IN_HOSTS,
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  NO_HOST_SHORTCUT,
  defaultHostShortcut,
  describeAccelerator,
  describeHostPlatform,
  desktopDeepLink,
  hostKeepsSignInInWindow,
  parseDesktopDeepLink,
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
    expect(fields).toEqual([
      'quickAskShortcut',
      'newChatShortcut',
      'screenshotShortcut',
      'windowShotShortcut',
      'voiceShortcut',
      'stopShortcut',
    ]);
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
    expect(describeAccelerator('CommandOrControl+Plus', 'electron-darwin')).toBe('⌘+');
    expect(describeAccelerator('CommandOrControl+-', 'electron-darwin')).toBe('⌘-');
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

describe('parseDesktopDeepLink', () => {
  it('reads back the target and id a link was built from', () => {
    expect(parseDesktopDeepLink(desktopDeepLink('chat', 'a b/c'))).toEqual({
      target: 'chat',
      id: 'a b/c',
    });
  });

  it('answers null for an id that is not valid percent-encoding instead of throwing', () => {
    expect(parseDesktopDeepLink('agiworkforce-cloud://chat/%')).toBeNull();
    expect(parseDesktopDeepLink('agiworkforce-cloud://chat/%E0%A4%A')).toBeNull();
  });

  it('answers null for another scheme, an unknown target and an empty id', () => {
    expect(parseDesktopDeepLink('https://chat/abc')).toBeNull();
    expect(parseDesktopDeepLink('agiworkforce-cloud://sso-callback/abc')).toBeNull();
    expect(parseDesktopDeepLink('agiworkforce-cloud://chat/')).toBeNull();
    expect(parseDesktopDeepLink('not a url')).toBeNull();
  });
});

describe('hostKeepsSignInInWindow', () => {
  it('holds each listed provider over https', () => {
    expect(HOST_IN_WINDOW_SIGN_IN_HOSTS.length).toBeGreaterThan(0);
    for (const host of HOST_IN_WINDOW_SIGN_IN_HOSTS) {
      expect(
        hostKeepsSignInInWindow(new URL(`https://${host}/o/oauth2/v2/auth?state=abc`)),
        host,
      ).toBe(true);
    }
  });

  it('sends every other provider, a lookalike host and plain http to the browser', () => {
    for (const url of [
      'https://slack.com/oauth/v2/authorize?state=abc',
      'https://github.com/login/oauth/authorize?state=abc',
      'https://accounts.google.com.evil.example/o/oauth2/v2/auth',
      'https://evil-accounts.google.com/o/oauth2/v2/auth',
      'http://accounts.google.com/o/oauth2/v2/auth',
    ]) {
      expect(hostKeepsSignInInWindow(new URL(url)), url).toBe(false);
    }
  });
});
