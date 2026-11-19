import { describe, expect, it } from 'vitest';
import {
  appSessionLabel,
  HTTP_LIBRARY_AGENTS,
  isAppSession,
  PRODUCT_COPYRIGHT_NAME,
  PRODUCT_NAMES,
} from '../index';

const APP_NAME = `${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.mobile}`;

describe('isAppSession', () => {
  it('counts every row the server marks as the mobile surface', () => {
    expect(isAppSession({ browser: null, surface: 'mobile' })).toBe(true);
    expect(isAppSession({ browser: 'Chrome 140', surface: 'mobile' })).toBe(true);
  });

  it.each(['desktop', 'extension', 'cli', 'unknown-surface'])(
    'never counts a row of the %s surface, whatever its browser says',
    (surface) => {
      expect(isAppSession({ browser: 'OkHttp 5.4.0', surface })).toBe(false);
    },
  );

  it('names exactly the bare HTTP libraries the phone runtimes report', () => {
    expect([...HTTP_LIBRARY_AGENTS].sort()).toEqual(['cfnetwork', 'darwin', 'okhttp']);
  });

  it.each(['okhttp/4.12.0', 'OkHttp 5.4.0', 'CFNetwork/1568', 'Darwin 24.1.0', '  okhttp/4.12.0'])(
    'recognises the bare library %s on the web surface or an unrecorded one',
    (browser) => {
      expect(isAppSession({ browser, surface: 'web' })).toBe(true);
      expect(isAppSession({ browser })).toBe(true);
      expect(isAppSession({ browser, surface: null })).toBe(true);
    },
  );

  it.each(['Chrome 140', 'Safari 18', 'Mozilla/5.0 okhttp', 'okhttpish 1.0', '', '   '])(
    'does not count the browser %j',
    (browser) => {
      expect(isAppSession({ browser, surface: 'web' })).toBe(false);
      expect(isAppSession({ browser })).toBe(false);
    },
  );

  it('does not count a row with no browser and no surface', () => {
    expect(isAppSession({ browser: null })).toBe(false);
    expect(isAppSession({ browser: null, surface: 'web' })).toBe(false);
  });
});

describe('appSessionLabel', () => {
  it('names the app with its platform', () => {
    expect(appSessionLabel({ browser: null, os: 'android' })).toBe(`${APP_NAME} on Android`);
    expect(appSessionLabel({ browser: null, os: 'ios' })).toBe(`${APP_NAME} on iOS`);
  });

  it('names the app alone when the platform is missing or not one it knows', () => {
    expect(appSessionLabel({ browser: null })).toBe(APP_NAME);
    expect(appSessionLabel({ browser: null, os: null })).toBe(APP_NAME);
    expect(appSessionLabel({ browser: null, os: '' })).toBe(APP_NAME);
    expect(appSessionLabel({ browser: null, os: 'harmonyos' })).toBe(APP_NAME);
    expect(appSessionLabel({ browser: null, os: 'toString' })).toBe(APP_NAME);
  });
});
