import type { ManagedCloudOwner } from '../cloud-bridge/managedCloudAuthority';

export interface ScheduledTaskNotificationAuthority {
  signal?: AbortSignal;
  owner?: ManagedCloudOwner;
}

export interface ScheduledTaskNotificationDependencies {
  isEnabled: () => Promise<boolean>;
  isOwnerRetired: (owner: ManagedCloudOwner) => boolean;
  publish: () => void;
}

/**
 * Keep the execution/account fence live across the asynchronous preference
 * read. Notification text can contain an account-owned task name or answer, so
 * authorization must be rechecked immediately before the synchronous publish.
 */
export async function publishAuthorizedScheduledTaskNotification(
  authority: ScheduledTaskNotificationAuthority,
  dependencies: ScheduledTaskNotificationDependencies,
): Promise<boolean> {
  const isCurrent = (): boolean =>
    !authority.signal?.aborted &&
    (!authority.owner || !dependencies.isOwnerRetired(authority.owner));
  if (!isCurrent()) return false;
  if (!(await dependencies.isEnabled())) return false;
  if (!isCurrent()) return false;
  dependencies.publish();
  return true;
}
