import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '@/lib/secureStorage';
import {
  clearAuthSession,
  getAuthToken,
  type MobileAuthSession,
  type MobileAuthUser,
} from '@/services/authSession';
import { clearLocalCloudAccountState } from '@/src/features/auth/services/cloudAccountTeardown';
import { invalidateCloudAccount } from '@/src/features/auth/services/cloudAccountSession';
import { unregisterPushTokenForSignOut } from '@/src/features/auth/services/signOutPushTokenCleanup';
import { revokeAskIntentForSignOut } from '@/src/features/siri/askIntentToken';

interface AuthState {
  session: MobileAuthSession | null;
  user: MobileAuthUser | null;
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
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      session: null,
      user: null,
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
          session: null,
          user: null,
          isLoading: false,
          isInitialized: true,
        });
      },

      signOut: async () => {
        const capturedAuthTokenPromise = getAuthToken();

        set({
          session: null,
          user: null,
          isLoading: false,
          isClerkSignedIn: false,
          clerkUserId: null,
        });
        invalidateCloudAccount();
        clearLocalCloudAccountState();

        try {
          const capturedAuthToken = await capturedAuthTokenPromise;
          if (capturedAuthToken) {
            await unregisterPushTokenForSignOut(capturedAuthToken);
          }
        } catch (err) {
          console.warn('[auth] push-token teardown on sign-out failed:', err);
        }

        try {
          await revokeAskIntentForSignOut((await capturedAuthTokenPromise) ?? '');
        } catch (err) {
          console.warn('[auth] Ask from Siri teardown on sign-out failed:', err);
        }

        try {
          await clearAuthSession();
        } catch {
          // External sign-out may fail; local state already failed closed above.
        }
      },
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        session: state.session,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.session = null;
          state.user = null;
          state.clerkUserId = null;
          state.isLoading = true;
          state.isInitialized = false;
        }
      },
    },
  ),
);
