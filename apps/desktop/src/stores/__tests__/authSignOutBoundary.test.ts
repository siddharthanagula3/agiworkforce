import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

const mocks = vi.hoisted(() => ({
  serviceSession: null as { access_token: string } | null,
  signOut: vi.fn(),
  disposeRuntime: vi.fn(),
  closeWindows: vi.fn(),
  cleanupAllStoresOnLogout: vi.fn(),
  clearPersistedUserData: vi.fn(),
}));

vi.mock('../../services/cloudAccountAuth', () => ({
  cloudAccountAuth: {
    getSession: () => mocks.serviceSession,
    signOut: mocks.signOut,
    signIn: vi.fn(),
    adoptNativeCredential: vi.fn(),
    refreshUserData: vi.fn(),
  },
}));

vi.mock('../../runtime/desktopChatRuntime', () => ({
  disposeActiveDesktopChatRuntime: mocks.disposeRuntime,
}));

vi.mock('../../services/ownedWebviewWindow', () => ({
  closeOwnedCloudWebviewWindows: mocks.closeWindows,
}));

vi.mock('../logoutCleanup', () => ({
  cleanupAllStoresOnLogout: mocks.cleanupAllStoresOnLogout,
  clearPersistedUserData: mocks.clearPersistedUserData,
}));

import { useAppModeStore } from '../appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../auth';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
} from '../../services/managedCloudBoundary';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((settle) => {
      resolve = settle;
    }),
    resolve,
  };
}

function projectAccount(id: string, token: string, plan: 'pro' | 'free'): void {
  const store = useAuthStore.getState();
  store.setUser({ id, email: `${id}@example.test`, name: id });
  store.setAccount({
    id,
    email: `${id}@example.test`,
    accessToken: token,
    isLocalDeviceAccount: false,
    plan,
    featureFlags: { [`${id}_feature`]: true },
    credits: { remaining_cents: plan === 'pro' ? 9_000 : 500 },
    subscriptionFetchStatus: 'succeeded',
  });
}

describe('Managed Cloud sign-out boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().reset();
    useAppModeStore.setState({ mode: 'cloud', hasOnboarded: true, hasSelectedMode: true });
  });

  it('denies admission synchronously and cannot erase a newer sign-in after teardown resumes', async () => {
    projectAccount('account-a', 'token-a', 'pro');
    mocks.serviceSession = { access_token: 'token-a' };
    const oldBoundary = captureManagedCloudBoundary();
    const runtimeDisposal = deferred();
    const serviceSignOut = deferred();
    mocks.disposeRuntime.mockReturnValue(runtimeDisposal.promise);
    mocks.closeWindows.mockResolvedValue(undefined);
    mocks.signOut.mockImplementation(
      async (options?: { beforeCredentialRevocation?: () => Promise<void> }) => {
        // Match CloudAccountAuth: in-memory authority clears before its bounded
        // remote/native teardown promise settles.
        mocks.serviceSession = null;
        await options?.beforeCredentialRevocation?.();
        return serviceSignOut.promise;
      },
    );

    const signOut = useAuthStore.getState().signOut();

    const immediatelyAfterIntent = useAuthStore.getState();
    expect(selectHasCloudAccountSession(immediatelyAfterIntent)).toBe(false);
    expect(immediatelyAfterIntent.cloudSessionEpoch).toBeGreaterThan(oldBoundary.sessionEpoch);
    expect(() => captureManagedCloudBoundary()).toThrow('requires an authenticated Cloud session');
    expect(() => assertManagedCloudBoundary(oldBoundary)).toThrow(
      'The Managed Cloud account changed while this request was in progress.',
    );

    // A new account signs in while the old runtime teardown is still pending.
    mocks.serviceSession = { access_token: 'token-b' };
    projectAccount('account-b', 'token-b', 'free');
    runtimeDisposal.resolve();
    serviceSignOut.resolve();
    await signOut;

    const finalState = useAuthStore.getState();
    expect(finalState.user?.id).toBe('account-b');
    expect(finalState.accessToken).toBe('token-b');
    expect(finalState.plan).toBe('free');
    expect(finalState.featureFlags).toEqual({ 'account-b_feature': true });
    expect(finalState.credits?.remaining_cents).toBe(500);
    expect(selectHasCloudAccountSession(finalState)).toBe(true);
    expect(mocks.cleanupAllStoresOnLogout).not.toHaveBeenCalled();
    expect(mocks.clearPersistedUserData).not.toHaveBeenCalled();
  });
});
