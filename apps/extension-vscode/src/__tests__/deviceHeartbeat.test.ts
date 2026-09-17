import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils/api', () => ({
  getAccountToken: vi.fn(async () => 'developer-token'),
  getCloudWebOrigin: () => 'https://agiworkforce.example',
}));
vi.mock('../platform/version', () => ({
  getExtensionVersion: () => '0.9.4',
  getExtensionUserAgent: () => 'agi-workforce-vscode/0.9.4',
}));

import { getAccountToken } from '../utils/api';
import { buildVscodeHeartbeat, sendVscodeHeartbeat } from '../features/device-registry';

function context() {
  const state = new Map<string, unknown>();
  return {
    secrets: {},
    globalState: {
      get: (key: string) => state.get(key),
      update: async (key: string, value: unknown) => {
        state.set(key, value);
      },
    },
  } as never;
}

describe('VS Code device registry heartbeat', () => {
  it('reports OS, architecture and version in the registry vocabulary', () => {
    expect(
      buildVscodeHeartbeat({
        installId: 'a4d1b2c3-0000-4000-8000-000000000001',
        hostname: 'build-box',
        platform: 'linux',
        release: '6.8.0',
        arch: 'x64',
        extensionVersion: '0.9.4',
      }),
    ).toMatchObject({
      surface: 'vscode',
      name: 'build-box',
      os: 'linux',
      osVersion: '6.8.0',
      architecture: 'x64',
      appVersion: '0.9.4',
      capabilities: { remoteControl: false },
    });
  });

  it('posts with the account token and keeps one install id across beats', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const ctx = context();

    await expect(sendVscodeHeartbeat(ctx, fetchImpl as never)).resolves.toBe(true);
    await sendVscodeHeartbeat(ctx, fetchImpl as never);

    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe('https://agiworkforce.example/api/devices/heartbeat');
    expect(calls[0]?.[1].headers).toMatchObject({ Authorization: 'Bearer developer-token' });
    const first = JSON.parse(String(calls[0]?.[1].body)) as { installId: string };
    const second = JSON.parse(String(calls[1]?.[1].body)) as { installId: string };
    expect(first.installId).toBe(second.installId);
  });

  it('stays silent while signed out', async () => {
    vi.mocked(getAccountToken).mockResolvedValueOnce(undefined);
    const fetchImpl = vi.fn();
    await expect(sendVscodeHeartbeat(context(), fetchImpl as never)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
