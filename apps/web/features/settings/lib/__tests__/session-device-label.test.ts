import { describe, expect, it } from 'vitest';
import { isAppSession } from '@agiworkforce/types';
import { sessionDeviceLabel } from '../session-device-label';

const row = { device: 'Mobile device', browser: 'OkHttp 5.4.0' };

describe('sessionDeviceLabel', () => {
  it('names the phone app with its platform when the surface is mobile', () => {
    expect(sessionDeviceLabel({ ...row, os: 'android', surface: 'mobile' })).toBe(
      'AGI Mobile on Android',
    );
    expect(sessionDeviceLabel({ ...row, os: 'ios', surface: 'mobile' })).toBe('AGI Mobile on iOS');
  });

  it('names the phone app alone when the platform is not one it knows', () => {
    expect(sessionDeviceLabel({ ...row, os: 'harmonyos', surface: 'mobile' })).toBe('AGI Mobile');
    expect(sessionDeviceLabel({ ...row, os: null, surface: 'mobile' })).toBe('AGI Mobile');
  });

  it.each(['okhttp/4.12.0', 'OkHttp 5.4.0', 'CFNetwork/1568', 'Darwin 24.1.0'])(
    'recognises the bare library %s on the web surface or an unrecorded one',
    (browser) => {
      expect(isAppSession({ browser, surface: 'web' })).toBe(true);
      expect(isAppSession({ browser })).toBe(true);
    },
  );

  it('keeps the device text of any other row', () => {
    expect(sessionDeviceLabel({ device: 'Mac', browser: 'Chrome 140', surface: 'web' })).toBe(
      'Mac',
    );
    expect(sessionDeviceLabel({ device: 'Mac', browser: 'OkHttp 5.4.0', surface: 'desktop' })).toBe(
      'Mac',
    );
    expect(sessionDeviceLabel({ device: 'Browser', browser: null })).toBe('Browser');
  });
});
