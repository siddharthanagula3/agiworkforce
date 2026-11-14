import { create } from 'zustand';
import { clearAuthSession, getAuthToken } from '@/services/authSession';
import {
  clearLocalCloudAccountState,
  clearUnsentCloudWork,
} from '@/src/features/auth/services/cloudAccountTeardown';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import {
  CLOUD_CHAT_POST_AUTH_INTENT,
  clearPostAuthIntent,
  stagePostAuthIntent,
} from '@/src/features/auth/services/postAuthIntent';
import {
  releasePushDeviceForAccountChange,
  requestPushReregistration,
} from '@/src/features/auth/services/pushTokenAccountLifecycle';
import { unregisterPushTokenForSignOut } from '@/src/features/auth/services/signOutPushTokenCleanup';
import { revokeAskIntentForSignOut } from '@/src/features/siri/askIntentToken';
import {
  DeviceAccountError,
  activateDeviceSession,
  activeDeviceSessionId,
  deviceAccountErrorMessage,
  endDeviceSession,
  getDeviceAccountsClerk,
  planSignOutHandover,
  readDeviceAccounts,
} from '@/src/features/accounts/deviceAccounts';

interface AuthState {
  isLoading: boolean;
  isInitialized: boolean;
  isClerkSignedIn: boolean;
  setClerkSignedIn: (value: boolean) => void;
  clerkUserId: string | null;
  setClerkUserId: (value: string | null) => void;
  isClerkLoaded: boolean;
  setClerkLoaded: (value: boolean) => void;

  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutAllAccounts: () => Promise<void>;
  switchAccount: (sessionId: string) => Promise<void>;
}

async function revokeAskIntentForAccount(capturedAuthTokenPromise: Promise<string | null>) {
  try {
    await revokeAskIntentForSignOut((await capturedAuthTokenPromise) ?? '');
  } catch (err) {
    console.warn('[auth] Ask from Siri teardown on sign-out failed:', err);
  }
}

async function retireCloudCredentials(capturedAuthTokenPromise: Promise<string | null>) {
  try {
    const capturedAuthToken = await capturedAuthTokenPromise;
    if (capturedAuthToken) {
      await unregisterPushTokenForSignOut(capturedAuthToken);
    }
  } catch (err) {
    console.warn('[auth] push-token teardown on sign-out failed:', err);
  }

  await revokeAskIntentForAccount(capturedAuthTokenPromise);
}

type SetAuthState = (partial: Partial<AuthState>) => void;

function retireActiveCloudAccount(set: SetAuthState) {
  set({
    isLoading: false,
    isClerkSignedIn: false,
    clerkUserId: null,
  });
  invalidateCloudAccount();
  clearLocalCloudAccountState();
}

async function endEveryDeviceSession(
  set: SetAuthState,
  capturedAuthTokenPromise: Promise<string | null>,
) {
  retireActiveCloudAccount(set);

  await retireCloudCredentials(capturedAuthTokenPromise);

  try {
    await clearAuthSession();
  } catch {
    // External sign-out may fail; local state already failed closed above.
  }
}

function wasInCloudMode(): boolean {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatAppModeStore } = require('@/src/features/chat/store/appModeStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatAppModeStore.getState().appMode === 'cloud';
}

interface RestorableCloudAccount {
  ownerId: string | null;
  clerkUserId: string | null;
  isClerkSignedIn: boolean;
  cloudUnlocked: boolean;
  appMode: 'local' | 'cloud';
}

function captureRestorableCloudAccount(
  state: Pick<AuthState, 'clerkUserId' | 'isClerkSignedIn'>,
): RestorableCloudAccount {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatAppModeStore } = require('@/src/features/chat/store/appModeStore');
  const { useWaitlistStore } = require('@/src/features/waitlist/store');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    ownerId: captureCloudAccountEpoch()?.ownerId ?? null,
    clerkUserId: state.clerkUserId,
    isClerkSignedIn: state.isClerkSignedIn,
    cloudUnlocked: useWaitlistStore.getState().cloudUnlocked,
    appMode: useChatAppModeStore.getState().appMode,
  };
}

function restoreCloudAccount(previous: RestorableCloudAccount) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatAppModeStore } = require('@/src/features/chat/store/appModeStore');
  const { useWaitlistStore } = require('@/src/features/waitlist/store');
  const { startCloudSyncLoop } = require('@/services/cloudSyncEngine');
  /* eslint-enable @typescript-eslint/no-require-imports */
  if (previous.ownerId) {
    activateCloudAccount(previous.ownerId);
    startCloudSyncLoop();
  }
  useWaitlistStore.getState().setCloudAccess(previous.cloudUnlocked);
  useChatAppModeStore.getState().setAppMode(previous.appMode);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  isLoading: true,
  isInitialized: false,
  isClerkSignedIn: false,
  clerkUserId: null,
  isClerkLoaded: false,

  setClerkSignedIn: (value: boolean) => {
    set((state) => {
      if (state.isClerkSignedIn === value) return state;
      return { isClerkSignedIn: value };
    });
  },

  setClerkUserId: (value: string | null) => {
    set((state) => {
      if (state.clerkUserId === value) return state;
      return { clerkUserId: value };
    });
  },

  setClerkLoaded: (value: boolean) => {
    set((state) => {
      if (state.isClerkLoaded === value) return state;
      return { isClerkLoaded: value };
    });
  },

  initialize: async () => {
    set({
      isLoading: false,
      isInitialized: true,
    });
  },

  signOut: async () => {
    const capturedAuthTokenPromise = getAuthToken();
    const clerk = getDeviceAccountsClerk();
    const handover = planSignOutHandover(readDeviceAccounts(clerk));
    if (!clerk || !handover) {
      await endEveryDeviceSession(set, capturedAuthTokenPromise);
      return;
    }

    const continueInCloud = wasInCloudMode();
    retireActiveCloudAccount(set);
    const capturedAuthToken = await capturedAuthTokenPromise.catch(() => null);
    try {
      await releasePushDeviceForAccountChange(capturedAuthToken);
    } catch (err) {
      console.warn(
        '[auth] could not release the push registration for the hand-over, ending every session:',
        err,
      );
      await endEveryDeviceSession(set, Promise.resolve(capturedAuthToken));
      return;
    }
    await revokeAskIntentForAccount(Promise.resolve(capturedAuthToken));

    if (continueInCloud) stagePostAuthIntent(CLOUD_CHAT_POST_AUTH_INTENT);
    try {
      await activateDeviceSession(clerk, handover.next.sessionId);
    } catch (err) {
      if (activeDeviceSessionId(clerk) !== handover.next.sessionId) {
        console.warn(
          '[auth] could not continue on the remaining account, ending every session:',
          err,
        );
        clearPostAuthIntent();
        await clearAuthSession();
        return;
      }
    }
    try {
      await endDeviceSession(clerk, handover.ending.sessionId);
    } catch (err) {
      throw new DeviceAccountError(deviceAccountErrorMessage(err, 'sign-out'));
    }
  },

  signOutAllAccounts: async () => {
    await endEveryDeviceSession(set, getAuthToken());
  },

  switchAccount: async (sessionId: string) => {
    const clerk = getDeviceAccountsClerk();
    const accounts = readDeviceAccounts(clerk);
    if (!clerk || !accounts.multiSession) {
      throw new DeviceAccountError('This phone can hold only one account.');
    }
    const target = accounts.accounts.find((account) => account.sessionId === sessionId);
    if (!target) {
      throw new DeviceAccountError('That account is no longer signed in on this phone.');
    }
    if (target.active) return;

    const previousSessionId = activeDeviceSessionId(clerk);
    const capturedAuthToken = await getAuthToken().catch(() => null);
    try {
      await releasePushDeviceForAccountChange(capturedAuthToken);
    } catch (err) {
      requestPushReregistration();
      throw new DeviceAccountError(deviceAccountErrorMessage(err, 'switch'));
    }

    const previous = captureRestorableCloudAccount(get());
    set({ isClerkSignedIn: false, clerkUserId: null });
    invalidateCloudAccount();
    clearLocalCloudAccountState({ keepUnsentWork: true });

    const restorePreviousAccount = () => {
      clearPostAuthIntent();
      if (previousSessionId === null || activeDeviceSessionId(clerk) !== previousSessionId) return;
      restoreCloudAccount(previous);
      set({ isClerkSignedIn: previous.isClerkSignedIn, clerkUserId: previous.clerkUserId });
      requestPushReregistration();
    };

    if (previous.appMode === 'cloud') stagePostAuthIntent(CLOUD_CHAT_POST_AUTH_INTENT);
    try {
      await activateDeviceSession(clerk, target.sessionId);
    } catch (err) {
      if (activeDeviceSessionId(clerk) !== target.sessionId) {
        restorePreviousAccount();
        throw new DeviceAccountError(deviceAccountErrorMessage(err, 'switch'));
      }
    }

    clearUnsentCloudWork();
    void revokeAskIntentForAccount(Promise.resolve(capturedAuthToken));
  },
}));
