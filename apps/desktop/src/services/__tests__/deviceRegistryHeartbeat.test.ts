import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
let signedIn = true;

vi.mock('../../api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://agiworkforce.example',
  accountBoundCloudFetch: () => fetchMock(),
  getAuthHeaders: async () => ({ Authorization: 'Bearer desktop-token' }),
}));
vi.mock('../../lib/remoteControlSupport', () => ({ remoteControlSupported: () => true }));
vi.mock('../../stores/auth', () => ({
  useAuthStore: { getState: () => ({}) },
  selectHasCloudAccountSession: () => signedIn,
}));
vi.mock('../managedCloudRequestContext', () => ({
  createManagedCloudRequestContext: () => ({
    getHeaders: async () => ({ Authorization: 'Bearer desktop-token' }),
    fetch: fetchMock,
  }),
}));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '3.1.0' }));

import { buildTauriHeartbeat, sendTauriHeartbeat } from '../deviceRegistryHeartbeat';

beforeEach(() => {
  fetchMock.mockClear();
  signedIn = true;
  window.localStorage.clear();
});

describe('Tauri desktop device registry heartbeat', () => {
  it('reports the Tauri shell with its local capabilities', () => {
    expect(
      buildTauriHeartbeat({
        installId: '0c9a8b7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d',
        navigatorPlatform: 'MacIntel',
        appVersion: '3.1.0',
        remoteControl: true,
      }),
    ).toMatchObject({
      surface: 'desktop',
      os: 'macos',
      shell: 'tauri',
      appVersion: '3.1.0',
      capabilities: { computerUse: true, localModels: true, localMcp: true, remoteControl: true },
    });
  });

  it('posts under the signed-in account and reuses one install id', async () => {
    await expect(sendTauriHeartbeat()).resolves.toBe(true);
    await sendTauriHeartbeat();

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('https://agiworkforce.example/api/devices/heartbeat');
    expect(calls[0]?.[1].headers).toMatchObject({ Authorization: 'Bearer desktop-token' });
    const first = JSON.parse(String(calls[0]?.[1].body)) as { installId: string };
    const second = JSON.parse(String(calls[1]?.[1].body)) as { installId: string };
    expect(first.installId).toBe(second.installId);
  });

  it('stays silent without a cloud account session', async () => {
    signedIn = false;
    await expect(sendTauriHeartbeat()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
