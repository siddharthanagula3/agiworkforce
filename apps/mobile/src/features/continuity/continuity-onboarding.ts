import { storage } from '@/lib/mmkv';

const CONTINUITY_ONBOARDING_KEY_PREFIX = 'continuity-onboarding:v1:';

export const CONTINUITY_COMPLETION_NOTIFICATION_TYPE = 'task_completed' as const;

function storageKeyForOwner(ownerId: string): string {
  return `${CONTINUITY_ONBOARDING_KEY_PREFIX}${encodeURIComponent(ownerId)}`;
}

export function hasAcknowledgedContinuityOnboarding(ownerId: string): boolean {
  if (!ownerId) return false;
  return storage.getBoolean(storageKeyForOwner(ownerId)) === true;
}

export function acknowledgeContinuityOnboarding(ownerId: string): void {
  if (!ownerId) return;
  storage.set(storageKeyForOwner(ownerId), true);
}
