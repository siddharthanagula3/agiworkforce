import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/features/cloud-bridge/freeTrialClient', () => ({
  FREE_TRIAL_GATEWAY: 'https://agiworkforce.example',
  getAuthToken: vi.fn(async () => 'clerk-session-token'),
}));

import { getAuthToken } from '../src/features/cloud-bridge/freeTrialClient';
import {
  buildChromeHeartbeat,
  resetChromeHeartbeatForTests,
  sendChromeHeartbeatIfDue,
} from '../src/features/cloud-bridge/deviceHeartbeat';

const storage = new Map<string, unknown>();

beforeEach(() => {
  storage.clear();
  resetChromeHeartbeatForTests();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(
            keys.filter((key) => storage.has(key)).map((key) => [key, storage.get(key)]),
          ),
        ),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) storage.set(key, value);
        }),
      },
    },
    runtime: {
      getPlatformInfo: vi.fn(async () => ({ os: 'mac', arch: 'arm64' })),
      getManifest: () => ({ version: '1.2.0' }),
    },
  });
});

describe('Chrome extension device registry heartbeat', () => {
  it('reports itself as a browser install in the registry vocabulary', () => {
    expect(
      buildChromeHeartbeat({
        installId: 'b1c2d3e4-0000-4000-8000-000000000002',
        os: 'win',
        arch: 'x86-64',
        extensionVersion: '1.2.0',
        browserVersion: '141.0.7390.54',
      }),
    ).toMatchObject({
      surface: 'chrome',
      os: 'windows',
      architecture: 'x64',
      osVersion: '141.0.7390.54',
      capabilities: { browser: true, computerUse: false, remoteControl: false },
    });
  });

  it('posts once per interval with the session token and a stable install id', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));

    await expect(sendChromeHeartbeatIfDue(fetchImpl as never)).resolves.toBe(true);
    await expect(sendChromeHeartbeatIfDue(fetchImpl as never)).resolves.toBe(false);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>)[0]!;
    expect(url).toBe('https://agiworkforce.example/api/devices/heartbeat');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer clerk-session-token' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      os: 'macos',
      architecture: 'arm64',
      appVersion: '1.2.0',
      installId: storage.get('agi_device_install_id'),
    });
  });

  it('sends nothing while signed out', async () => {
    vi.mocked(getAuthToken).mockResolvedValueOnce(null);
    const fetchImpl = vi.fn();
    await expect(sendChromeHeartbeatIfDue(fetchImpl as never)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
