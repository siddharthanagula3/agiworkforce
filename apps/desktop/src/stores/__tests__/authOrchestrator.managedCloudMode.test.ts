import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

const mocks = vi.hoisted(() => ({
  authStateListeners: [] as Array<(state: FakeAuthState) => void>,
  fetchUserProfile: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  isTauri: true,
  invoke: mocks.invoke,
}));

vi.mock('../../services/cloudAccountAuth', async (importOriginal) => ({
  ...(await importOriginal<CloudaccountauthModule>()),
  cloudAccountAuth: {
    onAuthStateChange: (listener: (state: FakeAuthState) => void) => {
      mocks.authStateListeners.push(listener);
      return () => {
        const index = mocks.authStateListeners.indexOf(listener);
        if (index >= 0) mocks.authStateListeners.splice(index, 1);
      };
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshUserData: vi.fn(),
    isAuthenticated: () => false,
  },
}));

vi.mock('../../api/accountApi', async (importOriginal) => ({
  ...(await importOriginal<AccountapiModule>()),
  accountApi: {
    fetchUserProfile: mocks.fetchUserProfile,
  },
}));

import { initializeAuthOrchestrator, resetAuthOrchestrator } from '../authOrchestrator';
import { useAppModeStore } from '../appModeStore';
import { useUnifiedAuthStore } from '../auth';
import { nativeAppModeReported } from '../../lib/nativeAppMode';

type TauriMockModule = typeof import('../../lib/tauri-mock');
type CloudaccountauthModule = typeof import('../../services/cloudAccountAuth');
type AccountapiModule = typeof import('../../api/accountApi');

interface FakeAuthState {
  user: { id: string; email: string; created_at: string } | null;
  session: { access_token: string; refresh_token: string | null } | null;
  profile: { display_name: string } | null;
  subscription: null;
  featureFlags: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
  subscriptionFetchStatus: 'idle' | 'fetching' | 'succeeded' | 'failed';
}

function signedIn(userId: string): FakeAuthState {
  return {
    user: { id: userId, email: `${userId}@example.test`, created_at: '2026-08-02T00:00:00.000Z' },
    session: { access_token: `${userId}-token`, refresh_token: null },
    profile: { display_name: userId },
    subscription: null,
    featureFlags: {},
    isLoading: false,
    error: null,
    subscriptionFetchStatus: 'succeeded',
  };
}

function commands(): string[] {
  return mocks.invoke.mock.calls.map(([command]) => command as string);
}

async function settle(userId: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (
      useUnifiedAuthStore.getState().lastSyncedAt &&
      useUnifiedAuthStore.getState().user?.id === userId
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the auth orchestrator.');
}

let dispose: (() => void) | null = null;

describe('ManagedCloud is registered only while the app is in Cloud mode', () => {
  beforeEach(async () => {
    localStorage.clear();
    mocks.authStateListeners.length = 0;
    mocks.fetchUserProfile.mockReset();
    mocks.fetchUserProfile.mockResolvedValue({ credits: null });
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(undefined);
    resetAuthOrchestrator();
    useUnifiedAuthStore.getState().reset();
    dispose = initializeAuthOrchestrator();
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  it('does not register ManagedCloud for a signed-in session in Local mode', async () => {
    useAppModeStore.setState({ mode: 'local' });
    await nativeAppModeReported();
    mocks.invoke.mockClear();

    for (const listener of [...mocks.authStateListeners]) listener(signedIn('account-local'));
    await settle('account-local');

    expect(commands()).not.toContain('llm_ensure_managed_cloud');
  });

  it('registers ManagedCloud for a signed-in session in Cloud mode, after the mode report', async () => {
    useAppModeStore.setState({ mode: 'cloud' });

    for (const listener of [...mocks.authStateListeners]) listener(signedIn('account-cloud'));
    await settle('account-cloud');

    const order = commands().filter(
      (command) => command === 'account_set_app_mode' || command === 'llm_ensure_managed_cloud',
    );
    expect(order).toContain('llm_ensure_managed_cloud');
    expect(order.indexOf('account_set_app_mode')).toBeLessThan(
      order.indexOf('llm_ensure_managed_cloud'),
    );
    expect(order.lastIndexOf('account_set_app_mode')).toBeLessThan(
      order.indexOf('llm_ensure_managed_cloud'),
    );
  });
});
