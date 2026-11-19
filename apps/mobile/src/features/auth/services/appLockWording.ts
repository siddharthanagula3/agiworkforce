import { Platform } from 'react-native';

interface AppLockWording {
  settingDescription: string;
  setupNeeded: string;
  deviceProtection: string;
  offer: string;
}

const IOS_WORDING: AppLockWording = {
  settingDescription: 'Require Face ID, Touch ID, or passcode to open AGI.',
  setupNeeded:
    'Turn on Face ID, Touch ID, or a device passcode in system settings before enabling AGI app lock.',
  deviceProtection: 'App Lock uses this device’s Face ID, Touch ID or passcode.',
  offer: 'Use Face ID, Touch ID, or your device passcode when opening AGI.',
};

const ANDROID_WORDING: AppLockWording = {
  settingDescription: 'Require your fingerprint, face unlock, or screen lock to open AGI.',
  setupNeeded:
    'Set up a fingerprint, face unlock, or screen lock in system settings before enabling AGI app lock.',
  deviceProtection: 'App Lock uses this device’s fingerprint, face unlock or screen lock.',
  offer: 'Use your fingerprint, face unlock, or screen lock when opening AGI.',
};

export function appLockWording(): AppLockWording {
  return Platform.OS === 'android' ? ANDROID_WORDING : IOS_WORDING;
}
