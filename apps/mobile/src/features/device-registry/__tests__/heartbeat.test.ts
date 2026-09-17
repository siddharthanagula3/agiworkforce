jest.mock('@/services/api', () => ({ api: { post: jest.fn(async () => ({})) } }));
jest.mock('@/lib/deviceId', () => ({
  getDeviceId: jest.fn(async () => '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.4.0' }, deviceName: 'Pixel 9' },
}));

import { Platform } from 'react-native';
import { api } from '@/services/api';
import { buildMobileHeartbeat, sendMobileHeartbeat } from '../heartbeat';

describe('mobile device registry heartbeat', () => {
  it('reports the phone in the registry vocabulary and claims no host capability', () => {
    expect(
      buildMobileHeartbeat({
        installId: '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f',
        platform: 'android',
        osVersion: 35,
        appVersion: '2.4.0',
        deviceName: 'Pixel 9',
      }),
    ).toEqual({
      surface: 'mobile',
      installId: '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f',
      name: 'Pixel 9',
      os: 'android',
      osVersion: '35',
      appVersion: '2.4.0',
      capabilities: {
        browser: false,
        computerUse: false,
        localModels: false,
        localMcp: false,
        remoteControl: false,
      },
    });
  });

  it('sends nothing for an install id the server would refuse', () => {
    expect(
      buildMobileHeartbeat({
        installId: 'bad id',
        platform: 'ios',
        osVersion: '18.2',
        appVersion: null,
        deviceName: null,
      }),
    ).toBeNull();
  });

  it('posts to the heartbeat route with the stable install id push registration uses', async () => {
    await expect(sendMobileHeartbeat()).resolves.toBe(true);
    expect(api.post).toHaveBeenCalledWith(
      '/api/devices/heartbeat',
      expect.objectContaining({
        surface: 'mobile',
        installId: '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f',
        os: Platform.OS === 'android' ? 'android' : 'ios',
        appVersion: '2.4.0',
      }),
    );
  });
});
