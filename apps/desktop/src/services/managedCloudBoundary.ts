import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';

export interface ManagedCloudBoundary {
  accountId: string;
  /**
   * Stable for one signed-in account incarnation, including bearer refreshes.
   * A sign-out or account-id transition advances it, so A -> B -> A cannot
   * revive work captured by the first A session.
   */
  sessionEpoch: number;
  /**
   * Credential captured for request clients that need an explicit bearer.
   * This is deliberately not part of boundary identity: device credentials
   * rotate during an otherwise continuous account session.
   */
  accessToken: string;
}

export function captureManagedCloudBoundary(
  operation = 'Managed Cloud request',
): ManagedCloudBoundary {
  const auth = useAuthStore.getState();
  if (
    selectPrivacyMode(useAppModeStore.getState()) !== 'managed' ||
    !selectHasCloudAccountSession(auth)
  ) {
    throw new Error(`${operation} requires an authenticated Cloud session.`);
  }
  return {
    accountId: auth.user?.id ?? '',
    sessionEpoch: auth.cloudSessionEpoch,
    accessToken: auth.accessToken ?? '',
  };
}

export function assertManagedCloudBoundary(boundary: ManagedCloudBoundary): void {
  const auth = useAuthStore.getState();
  if (
    selectPrivacyMode(useAppModeStore.getState()) !== 'managed' ||
    !selectHasCloudAccountSession(auth) ||
    auth.user?.id !== boundary.accountId ||
    auth.cloudSessionEpoch !== boundary.sessionEpoch
  ) {
    throw new Error('The Managed Cloud account changed while this request was in progress.');
  }
}

/**
 * Observe the stores that define a Managed Cloud authority and notify once
 * when a captured boundary stops being current. Token rotation alone does not
 * invalidate the boundary because it leaves account id and session epoch
 * unchanged.
 */
export function subscribeManagedCloudBoundary(
  boundary: ManagedCloudBoundary,
  onInvalidated: () => void,
): () => void {
  let active = true;
  const reconcile = () => {
    if (!active) return;
    try {
      assertManagedCloudBoundary(boundary);
    } catch {
      active = false;
      onInvalidated();
    }
  };
  const unsubscribeMode = useAppModeStore.subscribe(reconcile);
  const unsubscribeAuth = useAuthStore.subscribe(reconcile);
  // Close the capture -> subscription race.
  reconcile();
  return () => {
    active = false;
    unsubscribeMode();
    unsubscribeAuth();
  };
}
