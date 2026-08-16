import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';

export interface ManagedCloudBoundary {
  accountId: string;
  sessionEpoch: number;
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
  reconcile();
  return () => {
    active = false;
    unsubscribeMode();
    unsubscribeAuth();
  };
}
