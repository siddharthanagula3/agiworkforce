import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';

export interface ManagedCloudBoundary {
  accountId: string;
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
    accessToken: auth.accessToken ?? '',
  };
}

export function assertManagedCloudBoundary(boundary: ManagedCloudBoundary): void {
  const auth = useAuthStore.getState();
  if (
    selectPrivacyMode(useAppModeStore.getState()) !== 'managed' ||
    !selectHasCloudAccountSession(auth) ||
    auth.user?.id !== boundary.accountId ||
    auth.accessToken !== boundary.accessToken
  ) {
    throw new Error('The Managed Cloud account changed while this request was in progress.');
  }
}
