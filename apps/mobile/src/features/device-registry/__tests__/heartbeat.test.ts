jest.mock('@/services/api', () => ({ api: { post: jest.fn(async () => ({})) } }));
jest.mock('@/lib/deviceId', () => ({
  getDeviceId: jest.fn(async () => '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.4.0' }, deviceName: 'Pixel 9' },
}));

import { Platform } from 'react-native';
import {
  DEVICE_HEARTBEAT_INTERVAL_MS,
  DEVICE_ONLINE_WINDOW_MS,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import {
  assertDeviceActionable,
  buildMobileHeartbeat,
  deviceStatusMetrics,
  DEVICE_STATUS_IS_STALE,
  heartbeatRetryDelayMs,
  HEARTBEAT_RETRY_BASE_MS,
  localDeviceStatus,
  recordHeartbeatResult,
  resetDeviceStatusMetrics,
  sendMobileHeartbeat,
} from '../heartbeat';

beforeEach(() => {
  resetDeviceStatusMetrics();
  (api.post as jest.Mock).mockImplementation(async () => ({}));
});

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

describe('device status freshness', () => {
  const NOW = 1_700_000_000_000;

  it('reports offline until a beat has actually landed', () => {
    expect(localDeviceStatus(NOW)).toBe('offline');
    expect(() => assertDeviceActionable(localDeviceStatus(NOW))).toThrow(DEVICE_STATUS_IS_STALE);
  });

  /** L73086: a device that cannot reach the relay must not keep saying online. */
  it('goes stale on the last beat the server accepted, not the last attempt', () => {
    recordHeartbeatResult(true, NOW);
    expect(localDeviceStatus(NOW + 1_000)).toBe('online');

    recordHeartbeatResult(false, NOW + DEVICE_HEARTBEAT_INTERVAL_MS);
    recordHeartbeatResult(false, NOW + 2 * DEVICE_HEARTBEAT_INTERVAL_MS);

    const afterTheWindow = NOW + DEVICE_ONLINE_WINDOW_MS + 1;
    expect(localDeviceStatus(afterTheWindow)).not.toBe('online');
    expect(() => assertDeviceActionable(localDeviceStatus(afterTheWindow))).toThrow(
      DEVICE_STATUS_IS_STALE,
    );
  });

  /** L72732: a host that slept shows the gap rather than a stale online. */
  it('shows a sleep gap and recovers on the first beat after waking', () => {
    recordHeartbeatResult(true, NOW);
    const afterSleep = NOW + DEVICE_ONLINE_WINDOW_MS + 60_000;
    expect(localDeviceStatus(afterSleep)).toBe('sleeping');

    recordHeartbeatResult(true, afterSleep);
    expect(localDeviceStatus(afterSleep + 1_000)).toBe('online');
  });

  /** L72734/L73636: a relay disconnect backs off and settles, it never gives up. */
  it('backs off between retries and caps at the ordinary interval', () => {
    expect(heartbeatRetryDelayMs(0)).toBe(DEVICE_HEARTBEAT_INTERVAL_MS);
    expect(heartbeatRetryDelayMs(1)).toBe(HEARTBEAT_RETRY_BASE_MS);
    expect(heartbeatRetryDelayMs(2)).toBe(HEARTBEAT_RETRY_BASE_MS * 2);
    expect(heartbeatRetryDelayMs(3)).toBe(HEARTBEAT_RETRY_BASE_MS * 4);
    expect(heartbeatRetryDelayMs(40)).toBe(DEVICE_HEARTBEAT_INTERVAL_MS);
  });

  /** L73653: the counts a device-status dashboard reads. */
  it('counts what was sent, what failed, and clears the streak on recovery', async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(new Error('relay unreachable'));
    await expect(sendMobileHeartbeat()).rejects.toThrow('relay unreachable');

    let seen = deviceStatusMetrics();
    expect(seen).toMatchObject({ sent: 1, failed: 1, consecutiveFailures: 1 });
    expect(seen.lastSuccessAtMs).toBeNull();
    expect(seen.lastFailureAtMs).not.toBeNull();

    await expect(sendMobileHeartbeat()).resolves.toBe(true);

    seen = deviceStatusMetrics();
    expect(seen).toMatchObject({ sent: 2, failed: 1, consecutiveFailures: 0 });
    expect(seen.lastSuccessAtMs).not.toBeNull();
    expect(localDeviceStatus()).toBe('online');
  });
});
