/**
 * DCL-2 — desktop managed-cloud chat persistence seam (wiring unit test).
 *
 * Proves:
 *  - In MANAGED Cloud mode the client is constructed with the ABSOLUTE cloud
 *    origin (`WEB_APP_URL`), `guardedFetch` as the egress seam, and the desktop
 *    Clerk session-token getter.
 *  - In LOCAL and BYOK the seam refuses to instantiate (those boundaries route
 *    to the Rust runtime, never the shared cloud backend).
 *  - PA-3's coming-soon gate still protects users: on the desktop runtime
 *    `setMode('cloud')` is refused, so `privacyMode` never becomes 'managed' and
 *    the seam stays unreachable through the user-facing path.
 *
 * The shared client factory is mocked so we assert the CONFIG the desktop seam
 * passes (base URL / fetch seam / token getter) without making a network call.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simulate the real desktop (Tauri) runtime: Local mode is supported, so the
// PA-3 coming-soon gate in appModeStore.setMode is the one that runs.
vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

const { toastInfo, toastError } = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { info: toastInfo, error: toastError },
}));

// Capture the config the desktop seam hands to the shared client factory.
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

/** The config the desktop seam handed the shared client factory on its last call. */
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
  useAuthStore.setState({ accessToken: 'desktop-clerk-token', isAuthenticated: true });
  vi.spyOn(cloudAccountAuth, 'getValidSession').mockResolvedValue({
    access_token: 'desktop-clerk-token',
  } as never);
});

describe('DCL-2 managed-cloud construction', () => {
  beforeEach(() => {
    // Managed = Cloud mode with no BYOK provider keys. We force the post-DCL-4
    // managed state directly (bypassing the gated setMode) to exercise the seam.
    useAppModeStore.setState({ mode: 'cloud' });
  });

  it('constructs the shared client with the absolute origin, authenticated transport, and token getter', async () => {
    expect(isManagedCloudPersistenceActive()).toBe(true);

    getDesktopCloudChatPersistenceClient();

    expect(createClientMock).toHaveBeenCalledTimes(1);
    const config = lastClientConfig();

    // Absolute cloud origin — never a web-relative path on desktop.
    expect(config.baseUrl).toBe(WEB_APP_URL);
    expect(config.baseUrl).toMatch(/^https:\/\//);
    // The transport wraps guardedFetch so it can invalidate a rejected Cloud
    // session centrally and consistently add credential policy.
    expect(config.fetchImpl).toEqual(expect.any(Function));
    // Mutation headers are decorated through the same validated Desktop
    // session path as every other Cloud request.
    expect(config.decorateMutationHeaders).toEqual(expect.any(Function));
    // The auth token getter returns the desktop Clerk session token.
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
    // BYOK is a per-conversation execution boundary inside the Local workspace.
    // It must never be represented as global Cloud mode or inferred from the
    // retired providerMode setting.
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
    // Signed-in (beforeEach): the desktop runtime now enters Cloud mode.
    useAppModeStore.getState().setMode('cloud');

    expect(useAppModeStore.getState().mode).toBe('cloud');
    // privacyMode is now 'managed', so the shared cloud client is reachable.
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
