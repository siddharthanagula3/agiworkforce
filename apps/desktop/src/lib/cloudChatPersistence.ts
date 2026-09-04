import type { ManagedCloudChatClient } from '@agiworkforce/cloud-contracts';
import { createCloudChatPersistenceClient } from '../api/cloudApi';
import { selectPrivacyMode, useAppModeStore } from '../stores/appModeStore';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';

export function isManagedCloudPersistenceActive(): boolean {
  try {
    return (
      selectPrivacyMode(useAppModeStore.getState()) === 'managed' &&
      selectHasCloudAccountSession(useAuthStore.getState())
    );
  } catch {
    return false;
  }
}

export function getDesktopCloudChatPersistenceClient(): ManagedCloudChatClient {
  if (!isManagedCloudPersistenceActive()) {
    throw new Error(
      '[cloud-chat] managed-cloud persistence is unavailable: desktop is not in managed Cloud mode. ' +
        'Local and BYOK route to the Rust runtime.',
    );
  }
  const accountId = useAuthStore.getState().user?.id;
  if (!accountId) {
    throw new Error(
      '[cloud-chat] managed-cloud persistence is unavailable: the authenticated account has no owner id.',
    );
  }
  return createCloudChatPersistenceClient(accountId);
}
