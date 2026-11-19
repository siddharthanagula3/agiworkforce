import { useEffect } from 'react';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { getAuthToken } from '@/services/authSession';
import { registerForPushNotifications, setPushAccountContext } from '@/services/notifications';
import {
  beginPushTokenAccountSession,
  clearPushTokenAccountSession,
  usePushRegistrationRequestStore,
} from '@/src/features/auth/services/pushTokenAccountLifecycle';

export function usePushTokenAccountRegistration({
  isClerkSignedIn,
  clerkUserId,
  isCloud,
  isInitialized,
}: {
  isClerkSignedIn: boolean;
  clerkUserId: string | null;
  isCloud: boolean;
  isInitialized: boolean;
}): void {
  const heldForUserId = usePushRegistrationRequestStore((state) => state.heldForUserId);
  const generation = usePushRegistrationRequestStore((state) => state.generation);
  const heldForAccountAddition = clerkUserId !== null && heldForUserId === clerkUserId;

  useEffect(() => {
    if (heldForAccountAddition) {
      setPushAccountContext(null);
      return;
    }
    if (
      !FEATURES.auth ||
      !FEATURES.cloudChat ||
      !isClerkSignedIn ||
      !clerkUserId ||
      !isInitialized
    ) {
      if (isInitialized && (!isClerkSignedIn || !clerkUserId)) {
        setPushAccountContext(null);
        void clearPushTokenAccountSession().catch((err) => {
          console.warn('[RootLayout] Push-token account cleanup failed:', err);
        });
      }
      return;
    }

    let disposed = false;
    void beginPushTokenAccountSession(clerkUserId, getAuthToken)
      .then(async (accountContext) => {
        if (!accountContext || disposed || !accountContext.isCurrent()) return;
        if (!isCloud) return;
        setPushAccountContext(accountContext);
        await registerForPushNotifications(accountContext);
      })
      .catch((err) => {
        if (!disposed) {
          console.warn('[RootLayout] Push notification setup failed:', err);
        }
      });

    return () => {
      disposed = true;
      setPushAccountContext(null);
    };
  }, [isClerkSignedIn, clerkUserId, isCloud, isInitialized, heldForAccountAddition, generation]);
}
