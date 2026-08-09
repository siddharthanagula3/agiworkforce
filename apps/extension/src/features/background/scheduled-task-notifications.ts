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

export interface ScheduledTaskNotificationSubject {
  /**
   * The schedule the notification is about. Passed whole rather than as a
   * pre-decided flag so every notification site states its binding the same
   * way and none of them can quietly omit it.
   */
  schedule: { managedCloudAccountId?: string };
  /**
   * Owner captured by execution. Undefined exactly when execution threw before
   * it resolved the authorizing credential.
   */
  resolvedOwner?: ManagedCloudOwner;
  signal?: AbortSignal;
}

export interface ScheduledTaskNotificationDependencies {
  isEnabled: () => Promise<boolean>;
  isOwnerRetired: (owner: ManagedCloudOwner) => boolean;
  publish: () => void;
}

/**
 * Build the fence input for a notification about `subject.schedule`.
 *
 * The binding and the resolved owner are independent: a run can fail before it
 * ever proves who authorized it, and only the schedule record still says which
 * account the notification would be about.
 */
export function scheduledTaskNotificationAuthority(
  subject: ScheduledTaskNotificationSubject,
): ScheduledTaskNotificationAuthority {
  const authority: ScheduledTaskNotificationAuthority = {};
  if (subject.signal) authority.signal = subject.signal;
  if (subject.resolvedOwner) authority.owner = subject.resolvedOwner;
  if (subject.schedule.managedCloudAccountId !== undefined) {
    authority.boundAccountId = subject.schedule.managedCloudAccountId;
  }
  return authority;
}

/**
 * Keep the execution/account fence live across the asynchronous preference
 * read. Notification text can carry an account-owned task name or answer, so
 * authorization is rechecked immediately before the synchronous publish.
 *
 * A notification about an account-bound schedule is refused when execution
 * could not resolve that account's owner. Execution throws before the owner is
 * captured whenever no Managed Cloud account is signed in or the session was
 * replaced, so whoever is at the browser then is either nobody or a different
 * account. Device-local schedules carry no binding and stay published.
 *
 * What this actually prevents, claimed no wider than it holds. Alarms are
 * re-armed on every service-worker start, so the signed-out case does repeat
 * every alarm period, forever — but what repeats is the generic "Task Paused"
 * notice. That discloses only that a Managed Cloud schedule the current user
 * can neither see nor delete exists on this profile, not the schedule's name.
 * The name reaches an ownerless notification on one narrower path: a
 * non-authority error thrown before the credential resolves, which routes to
 * "Task Failed". ("Task Continuing" also names the schedule, but every throw
 * that reaches it happens after the owner was captured, so it is never
 * ownerless.) The genuine cross-account case — "this schedule belongs to a
 * different account" — is suppressed at its own throw site instead, so this
 * fence is not what stops that one.
 *
 * Known gap: a legacy schedule with a prompt but no `managedCloudAccountId`
 * throws before the owner is captured and has no binding to state, so it is
 * treated as device-local and published.
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
