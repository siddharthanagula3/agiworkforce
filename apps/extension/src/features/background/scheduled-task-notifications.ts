import type { ManagedCloudOwner } from '../cloud-bridge/managedCloudAuthority';

export interface ScheduledTaskNotificationAuthority {
  signal?: AbortSignal;
  /** Account incarnation proven to own this notification's content. */
  owner?: ManagedCloudOwner;
  /**
   * `managedCloudAccountId` of the schedule the notification is about, when the
   * schedule is bound to a Managed Cloud account. Device-local schedules leave
   * it undefined.
   */
  boundAccountId?: string;
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
 *
 * A Managed Cloud schedule whose owner could not be resolved is never
 * published. Execution throws before `owner` is captured whenever the
 * authorizing account is signed out, retired, or replaced — and the person
 * looking at the browser then is either nobody or a different account. Without
 * this the failure paths announce another account's task name on every alarm
 * period, forever, for a schedule the current user cannot see or delete.
 */
export async function publishAuthorizedScheduledTaskNotification(
  authority: ScheduledTaskNotificationAuthority,
  dependencies: ScheduledTaskNotificationDependencies,
): Promise<boolean> {
  const isCurrent = (): boolean => {
    if (authority.signal?.aborted) return false;
    if (!authority.owner) return authority.boundAccountId === undefined;
    return !dependencies.isOwnerRetired(authority.owner);
  };
  if (!isCurrent()) return false;
  if (!(await dependencies.isEnabled())) return false;
  if (!isCurrent()) return false;
  dependencies.publish();
  return true;
}
