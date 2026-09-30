import type { PushPreferenceGroup } from '@/stores/notificationPrefsStore';

export interface PushPreferenceGroupCopy {
  label: string;
  description: string;
}

export const PUSH_PREFERENCE_GROUP_COPY: Record<PushPreferenceGroup, PushPreferenceGroupCopy> = {
  chat_replies: {
    label: 'Chat replies',
    description: 'When a reply to your message is ready',
  },
  tasks: {
    label: 'Task and approval updates',
    description: 'Approval requests, finished or failed tasks, and scheduled runs',
  },
  product: {
    label: 'Product',
    description: 'Service status and connection info',
  },
};

export const PUSH_PREFERENCE_GROUPS = Object.keys(
  PUSH_PREFERENCE_GROUP_COPY,
) as PushPreferenceGroup[];

export function isPushPreferenceGroup(value: unknown): value is PushPreferenceGroup {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(PUSH_PREFERENCE_GROUP_COPY, value)
  );
}

const LEGACY_PUSH_PREFERENCE_GROUP: Readonly<Record<string, PushPreferenceGroup>> = {
  approvals: 'tasks',
  task_updates: 'tasks',
  errors: 'tasks',
  status: 'product',
};

export function resolvePushPreferenceGroup(value: unknown): PushPreferenceGroup | null {
  if (isPushPreferenceGroup(value)) return value;
  if (typeof value !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(LEGACY_PUSH_PREFERENCE_GROUP, value)
    ? (LEGACY_PUSH_PREFERENCE_GROUP[value] ?? null)
    : null;
}
