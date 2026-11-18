import { Platform } from 'react-native';
import { appLockWording } from '../src/features/auth/services/appLockWording';

describe('App Lock wording', () => {
  let platform: jest.ReplaceProperty<'OS', typeof Platform.OS>;

  afterEach(() => {
    platform.restore();
  });

  it('keeps the iPhone text exactly as it was', () => {
    platform = jest.replaceProperty(Platform, 'OS', 'ios');

    expect(appLockWording()).toEqual({
      settingDescription: 'Require Face ID, Touch ID, or passcode to open AGI.',
      setupNeeded:
        'Turn on Face ID, Touch ID, or a device passcode in system settings before enabling AGI app lock.',
      deviceProtection: 'App Lock uses this device’s Face ID, Touch ID or passcode.',
      offer: 'Use Face ID, Touch ID, or your device passcode when opening AGI.',
    });
  });

  it('names what an Android phone has, and no iPhone biometric', () => {
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    const wording = Object.values(appLockWording());

    expect(wording).toHaveLength(4);
    for (const text of wording) {
      expect(text).toMatch(/fingerprint, face unlock,? or screen lock/);
      expect(text).not.toMatch(/Face ID|Touch ID|passcode/);
    }
  });
});
