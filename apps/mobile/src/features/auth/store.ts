import { create } from 'zustand';
import { getAuthToken } from '@/services/authSession';
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
  type DeviceAccountsClerk,
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

type SignOutScope = {
  clerk: DeviceAccountsClerk | null;
  activeId: string | null;
  sessionIds: string[];
};

function captureSignOutScope(clerk: DeviceAccountsClerk | null): SignOutScope {
  const activeId = clerk ? activeDeviceSessionId(clerk) : null;
  const sessionIds = new Set(clerk?.client?.signedInSessions.map((session) => session.id));
  if (activeId) sessionIds.add(activeId);
  return { clerk, activeId, sessionIds: [...sessionIds] };
}

function stillOnEndingSession(scope: SignOutScope): boolean {
  return (
    scope.clerk !== null &&
    scope.activeId !== null &&
    activeDeviceSessionId(scope.clerk) === scope.activeId
  );
}

function hasCapturedDeviceSession(clerk: DeviceAccountsClerk, sessionId: string): boolean {
  return (
    activeDeviceSessionId(clerk) === sessionId ||
    clerk.client?.signedInSessions.some((session) => session.id === sessionId) === true
  );
}

async function revokeAskIntentForAccount(
  capturedAuthTokenPromise: Promise<string | null>,
  isCurrent?: () => boolean,
) {
  try {
    const token = (await capturedAuthTokenPromise) ?? '';
    await revokeAskIntentForSignOut(token, isCurrent);
  } catch (err) {
    console.warn('[auth] Ask from Siri teardown on sign-out failed:', err);
  }
}

async function retireCloudCredentials(
  capturedAuthTokenPromise: Promise<string | null>,
  scope: SignOutScope,
) {
  try {
    const capturedAuthToken = await capturedAuthTokenPromise;
    if (capturedAuthToken) {
      await unregisterPushTokenForSignOut(capturedAuthToken);
    }
  } catch (err) {
    console.warn('[auth] push-token teardown on sign-out failed:', err);
  }

  await revokeAskIntentForAccount(capturedAuthTokenPromise, () => stillOnEndingSession(scope));
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
  scope: SignOutScope,
) {
  retireActiveCloudAccount(set);

  await retireCloudCredentials(capturedAuthTokenPromise, scope);

  await endCapturedDeviceSessions(scope);
}

async function endCapturedDeviceSessions(scope: SignOutScope): Promise<void> {
  const { clerk, sessionIds } = scope;
  if (!clerk) return;
  for (const sessionId of sessionIds) {
    const activeId = activeDeviceSessionId(clerk);
    if (activeId && !sessionIds.includes(activeId)) return;
    if (!hasCapturedDeviceSession(clerk, sessionId)) continue;
    try {
      await endDeviceSession(clerk, sessionId);
    } catch (error) {
      console.warn('[auth] a captured session could not be ended:', error);
    }
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
    const scope = captureSignOutScope(clerk);
    const handover = planSignOutHandover(readDeviceAccounts(clerk));
    if (!clerk || !handover) {
      await endEveryDeviceSession(set, capturedAuthTokenPromise, scope);
      return;
    }

    const continueInCloud = wasInCloudMode();
    retireActiveCloudAccount(set);
    const capturedAuthToken = await capturedAuthTokenPromise.catch(() => null);
    try {
      await releasePushDeviceForAccountChange(capturedAuthToken);
    } catch (err) {
      console.warn('[auth] could not release the push registration for the hand-over:', err);
      await retireCloudCredentials(Promise.resolve(capturedAuthToken), scope);
      await endCapturedDeviceSessions(scope);
      return;
    }
    await revokeAskIntentForAccount(Promise.resolve(capturedAuthToken), () =>
      stillOnEndingSession(scope),
    );

    if (!stillOnEndingSession(scope)) return;
    if (continueInCloud) stagePostAuthIntent(CLOUD_CHAT_POST_AUTH_INTENT);
    try {
      await activateDeviceSession(clerk, handover.next.sessionId);
    } catch (err) {
      if (activeDeviceSessionId(clerk) !== handover.next.sessionId) {
        if (!stillOnEndingSession(scope)) return;
        console.warn('[auth] could not continue on the remaining account:', err);
        clearPostAuthIntent();
        await endCapturedDeviceSessions(scope);
        return;
      }
    }
    if (
      activeDeviceSessionId(clerk) !== handover.next.sessionId ||
      !hasCapturedDeviceSession(clerk, handover.ending.sessionId)
    ) {
      return;
    }
    try {
      await endDeviceSession(clerk, handover.ending.sessionId);
    } catch (err) {
      throw new DeviceAccountError(deviceAccountErrorMessage(err, 'sign-out'));
    }
  },

  signOutAllAccounts: async () => {
    const scope = captureSignOutScope(getDeviceAccountsClerk());
    await endEveryDeviceSession(set, getAuthToken(), scope);
  },

  switchAccount: async (sessionId: string) => {
    const clerk = getDeviceAccountsClerk();
    const accounts = readDeviceAccounts(clerk);
    if (!clerk || !accounts.multiSession) {
      throw new DeviceAccountError('This device can hold only one account.');
    }
    const target = accounts.accounts.find((account) => account.sessionId === sessionId);
    if (!target) {
      throw new DeviceAccountError('That account is no longer signed in on this device.');
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
