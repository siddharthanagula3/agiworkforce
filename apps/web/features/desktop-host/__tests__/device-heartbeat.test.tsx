import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceRegistryProfile, HostBridge } from '@agiworkforce/local-runtime-contract';
import { DesktopRuntimeError } from '@agiworkforce/local-runtime-contract';

const readDeviceRegistryProfile = vi.fn<() => Promise<DeviceRegistryProfile>>();
const readDeviceHostDeclaration = vi.fn();
let currentUser = { isLoaded: true, isSignedIn: true };

vi.mock('../lib/runtime-client', () => ({ readDeviceRegistryProfile }));
vi.mock('../lib/device-steps', () => ({ readDeviceHostDeclaration }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf',
  })),
}));
vi.mock('@/lib/identity/client', () => ({ useCurrentUser: () => currentUser }));

const { buildDesktopHeartbeat, sendDesktopHeartbeat } = await import('../lib/device-heartbeat');
const { useDeviceHeartbeat } = await import('../hooks/use-device-heartbeat');

const host = {
  shell: 'electron',
  platform: 'darwin',
  appVersion: '1.8.0',
} as unknown as HostBridge;

const PROFILE: DeviceRegistryProfile = {
  installId: '0d6f2f7e-5a43-4f0b-9d0e-4c1d3e2b1a00',
  name: 'Studio Mac',
  platform: 'darwin',
  osVersion: '25.6.0',
  architecture: 'arm64',
  appVersion: '1.8.0',
  capabilities: {
    browser: true,
    computerUse: true,
    localModels: false,
    localMcp: false,
    remoteControl: true,
  },
};

const fetchMock = vi.fn();

function Harness({ bridge }: { bridge: HostBridge | null }) {
  useDeviceHeartbeat(bridge);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { isLoaded: true, isSignedIn: true };
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  readDeviceRegistryProfile.mockResolvedValue(PROFILE);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the desktop heartbeat', () => {
  it('reports OS, architecture, version, shell and capabilities in the registry vocabulary', () => {
    expect(buildDesktopHeartbeat(host, PROFILE)).toEqual({
      surface: 'desktop',
      installId: PROFILE.installId,
      name: 'Studio Mac',
      os: 'macos',
      osVersion: '25.6.0',
      architecture: 'arm64',
      appVersion: '1.8.0',
      shell: 'electron',
      capabilities: PROFILE.capabilities,
    });
  });

  it('sends nothing the server would refuse', () => {
    expect(buildDesktopHeartbeat(host, { ...PROFILE, installId: 'x' })).toBeNull();
  });

  it('posts with CSRF headers to the heartbeat route', async () => {
    await expect(sendDesktopHeartbeat(host)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/devices/heartbeat');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf' });
    expect(JSON.parse(String(init.body))).toMatchObject({ surface: 'desktop', os: 'macos' });
  });

  it('falls back to the host declaration on a shell without the registry command', async () => {
    readDeviceRegistryProfile.mockRejectedValue(
      new DesktopRuntimeError({ code: 'unknown-command', message: 'no command' }),
    );
    readDeviceHostDeclaration.mockResolvedValue({
      deviceId: PROFILE.installId,
      deviceName: 'Old Mac',
      platform: 'darwin',
      appVersion: '1.2.0',
      capabilities: [],
      roots: [],
    });

    await expect(sendDesktopHeartbeat(host)).resolves.toBe(true);
    expect(
      JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)),
    ).toMatchObject({
      name: 'Old Mac',
      appVersion: '1.2.0',
      capabilities: { remoteControl: false },
    });
  });

  it('beats once signed in inside the shell, and never in a browser or signed out', async () => {
    const view = render(<Harness bridge={null} />);
    expect(fetchMock).not.toHaveBeenCalled();

    currentUser = { isLoaded: true, isSignedIn: false };
    view.rerender(<Harness bridge={host} />);
    expect(fetchMock).not.toHaveBeenCalled();

    currentUser = { isLoaded: true, isSignedIn: true };
    view.rerender(<Harness bridge={host} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
