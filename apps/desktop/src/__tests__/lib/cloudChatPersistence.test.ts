import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));
vi.mock('../../api/config', () => ({
  API_BASE_URL: 'https://agiworkforce.com',
  WEB_APP_URL: 'https://agiworkforce.com',
  GATEWAY_BASE_URL: 'https://api.agiworkforce.com',
}));

const { toastInfo, toastError } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: toastError },
}));

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((_config?: unknown) => ({})),
}));
vi.mock('@agiworkforce/cloud-contracts', () => ({
  createManagedCloudChatClient: createClientMock,
}));

interface CapturedConfig {
  baseUrl: string;
  fetchImpl: unknown;
  decorateMutationHeaders?: unknown;
  getAuthToken: () => Promise<string | null>;
}

function lastClientConfig(): CapturedConfig {
  const call = createClientMock.mock.calls.at(-1);
  if (!call) throw new Error('shared client factory was not called');
  return call[0] as CapturedConfig;
}

import {
  getDesktopCloudChatPersistenceClient,
  isManagedCloudPersistenceActive,
} from '../../lib/cloudChatPersistence';
import { WEB_APP_URL } from '../../api/config';
import { cloudAccountAuth } from '../../services/cloudAccountAuth';
import { useAppModeStore } from '../../stores/appModeStore';
import { useAuthStore } from '../../stores/auth';

beforeEach(() => {
  createClientMock.mockClear();
  toastInfo.mockClear();
  toastError.mockClear();
  useAppModeStore.setState({ mode: 'local' });
  useAuthStore.setState({
    accessToken: 'desktop-clerk-token',
    isAuthenticated: true,
    user: { id: 'user-desktop', email: '' },
  });
  vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue({
    access_token: 'desktop-clerk-token',
    user: { id: 'user-desktop' },
  } as never);
});

describe('DCL-2 managed-cloud construction', () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: 'cloud' });
  });

  it('constructs the shared client with the absolute origin, authenticated transport, and token getter', async () => {
    expect(isManagedCloudPersistenceActive()).toBe(true);

    getDesktopCloudChatPersistenceClient();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const config = lastClientConfig();

    expect(config.baseUrl).toBe(WEB_APP_URL);
    expect(config.baseUrl).toMatch(/^https:\/\//);
    expect(config.fetchImpl).toEqual(expect.any(Function));
    expect(config.decorateMutationHeaders).toEqual(expect.any(Function));
    await expect(config.getAuthToken()).resolves.toBe('desktop-clerk-token');
  });

  it('does not construct the shared client when the account token is absent', () => {
    useAuthStore.setState({ accessToken: null, isAuthenticated: false });

    expect(isManagedCloudPersistenceActive()).toBe(false);
    expect(() => getDesktopCloudChatPersistenceClient()).toThrow(
      /managed-cloud persistence is unavailable/i,
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe('DCL-2 Local + BYOK never instantiate the cloud client', () => {
  it('refuses in Local mode (routes to the Rust runtime instead)', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(isManagedCloudPersistenceActive()).toBe(false);
    expect(() => getDesktopCloudChatPersistenceClient()).toThrow(
      /managed-cloud persistence is unavailable/i,
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('refuses in BYOK mode (user keys go client-direct, not via shared cloud)', () => {
    useAppModeStore.setState({ mode: 'local' });
    expect(isManagedCloudPersistenceActive()).toBe(false);
    expect(() => getDesktopCloudChatPersistenceClient()).toThrow(
      /managed-cloud persistence is unavailable/i,
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe('DCL-4 desktop cloud is open — sign-in is the only gate', () => {
  it('setMode(cloud) succeeds for a signed-in account and the seam activates', () => {
    useAppModeStore.getState().setMode('cloud');

    expect(useAppModeStore.getState().mode).toBe('cloud');
    expect(isManagedCloudPersistenceActive()).toBe(true);
    expect(() => getDesktopCloudChatPersistenceClient()).not.toThrow();
  });

  it('opens the Cloud sign-in workspace while keeping persistence unreachable signed out', () => {
    useAuthStore.setState({ accessToken: null, isAuthenticated: false });
    useAppModeStore.getState().setMode('cloud');

    expect(useAppModeStore.getState().mode).toBe('cloud');
    expect(toastError).not.toHaveBeenCalled();
    expect(isManagedCloudPersistenceActive()).toBe(false);
    expect(() => getDesktopCloudChatPersistenceClient()).toThrow(
      /managed-cloud persistence is unavailable/i,
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
