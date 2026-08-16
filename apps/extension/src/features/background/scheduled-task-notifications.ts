import type { ManagedCloudOwner } from '../cloud-bridge/managedCloudAuthority';

export interface ScheduledTaskNotificationAuthority {
  signal?: AbortSignal;
  owner?: ManagedCloudOwner;
  boundAccountId?: string;
}

export interface ScheduledTaskNotificationSubject {
  schedule: { managedCloudAccountId?: string };
  resolvedOwner?: ManagedCloudOwner;
  signal?: AbortSignal;
}

export interface ScheduledTaskNotificationDependencies {
  isEnabled: () => Promise<boolean>;
  isOwnerRetired: (owner: ManagedCloudOwner) => boolean;
  publish: () => void;
}

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
