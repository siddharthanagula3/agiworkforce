import { Platform } from 'react-native';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '0.0.1', ios: { buildNumber: '2' }, android: { versionCode: 1 } },
    platform: {},
  },
}));

import Constants from 'expo-constants';
import { readAppBuild } from '@/src/features/feedback/clientContext';

const mockConstants = Constants as unknown as { platform: unknown };

describe('readAppBuild', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('reads the iOS build from the binary and never from the app configuration', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockConstants.platform = { ios: { buildNumber: '57' } };
    expect(readAppBuild()).toBe('57');

    mockConstants.platform = { ios: { buildNumber: null } };
    expect(readAppBuild()).toBeNull();
  });

  it('reads the Android version code from the platform manifest only', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    mockConstants.platform = { android: { versionCode: 31 } };
    expect(readAppBuild()).toBe('31');

    mockConstants.platform = { android: {} };
    expect(readAppBuild()).toBeNull();
  });
});
