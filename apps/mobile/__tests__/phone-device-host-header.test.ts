jest.mock('@/services/api', () => ({ api: { post: jest.fn(async () => ({})) } }));
jest.mock('@/lib/deviceId', () => ({
  getDeviceId: jest.fn(async () => '6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f'),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.4.0' }, deviceName: 'iPhone 17 Pro' },
}));

import { Platform } from 'react-native';
import { DEVICE_HEARTBEAT_PATH, DEVICE_ONLINE_WINDOW_MS } from '@agiworkforce/cloud-contracts';
import { DEVICE_HOST_HEADER } from '@agiworkforce/types';
import { api } from '@/services/api';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  deviceStatusMetrics,
  recordHeartbeatResult,
  resetDeviceStatusMetrics,
} from '@/src/features/device-registry/heartbeat';
import {
  headerSafeJson,
  PHONE_PRESENCE_WAIT_MS,
  phoneDeviceHostHeaders,
} from '@/src/features/integrations/services/phoneDeviceHost';

const post = api.post as jest.Mock;

function declaredDeviceId(headers: Record<string, string>): string | undefined {
  const value = headers[DEVICE_HOST_HEADER];
  return value === undefined ? undefined : (JSON.parse(value) as { deviceId: string }).deviceId;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('the phone device-host header', () => {
  it('stays printable ASCII for a phone name with a curly apostrophe and reads back unchanged', () => {
    const declared = { deviceName: 'Mei’s iPhone 的', capabilities: ['calendar.read'] };

    const encoded = headerSafeJson(declared);

    expect(/^[\x20-\x7e]*$/.test(encoded)).toBe(true);
    expect(JSON.parse(encoded)).toEqual(declared);
  });
});

describe('naming the phone as a device host only while the server counts it online', () => {
  const realOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'ios';
    resetDeviceStatusMetrics();
    post.mockReset();
    post.mockImplementation(async () => ({}));
  });

  afterEach(() => {
    Platform.OS = realOS;
    jest.useRealTimers();
    invalidateCloudAccount();
    __resetCloudAccountSessionForTests();
  });

  it('beats first after an account switch even though the previous account beat moments ago', async () => {
    activateCloudAccount('user_a');
    recordHeartbeatResult(true);
    activateCloudAccount('user_b');
    post.mockRejectedValueOnce(new Error('relay unreachable'));

    const headers = await phoneDeviceHostHeaders();

    expect(post).toHaveBeenCalledTimes(1);
    expect(headers).toEqual({});
  });

  it('adds no request when the server accepted a beat moments ago', async () => {
    recordHeartbeatResult(true);

    const headers = await phoneDeviceHostHeaders();

    expect(post).not.toHaveBeenCalled();
    expect(declaredDeviceId(headers)).toBe('6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f');
  });

  it('beats first when no beat was ever accepted, then names the phone', async () => {
    const headers = await phoneDeviceHostHeaders();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(DEVICE_HEARTBEAT_PATH, expect.anything());
    expect(declaredDeviceId(headers)).toBe('6f1c1d2e-3b4a-4c5d-8e9f-0a1b2c3d4e5f');
  });

  it('beats first when the last accepted beat is about to leave the online window', async () => {
    recordHeartbeatResult(true, Date.now() - DEVICE_ONLINE_WINDOW_MS + 30_000);

    const headers = await phoneDeviceHostHeaders();

    expect(post).toHaveBeenCalledTimes(1);
    expect(declaredDeviceId(headers)).toBeDefined();
    expect(deviceStatusMetrics().consecutiveFailures).toBe(0);
  });

  it('sends the turn without the header when the beat is refused, and does not fail it', async () => {
    recordHeartbeatResult(true, Date.now() - 2 * DEVICE_ONLINE_WINDOW_MS);
    post.mockRejectedValueOnce(new Error('relay unreachable'));

    const headers = await phoneDeviceHostHeaders();

    expect(post).toHaveBeenCalledTimes(1);
    expect(headers).toEqual({});
  });

  it('gives up on a slow beat at the bound and sends the turn without the header', async () => {
    jest.useFakeTimers();
    let answer: (value: unknown) => void = () => undefined;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    let settled: Record<string, string> | null = null;
    void phoneDeviceHostHeaders().then((headers) => {
      settled = headers;
    });
    await flush();
    expect(post).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(PHONE_PRESENCE_WAIT_MS - 1);
    await flush();
    expect(settled).toBeNull();

    jest.advanceTimersByTime(1);
    await flush();
    expect(settled).toEqual({});

    answer({});
    await flush();
  });

  it('stops waiting for the beat as soon as the turn is cancelled', async () => {
    jest.useFakeTimers();
    let answer: (value: unknown) => void = () => undefined;
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const controller = new AbortController();
    let settled: Record<string, string> | null = null;
    void phoneDeviceHostHeaders(controller.signal).then((headers) => {
      settled = headers;
    });
    await flush();

    controller.abort();
    await flush();
    expect(settled).toEqual({});

    answer({});
    await flush();
  });
});
