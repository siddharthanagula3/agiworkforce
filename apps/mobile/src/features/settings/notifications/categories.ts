import { MOBILE_CODE_SCREEN_LABEL } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  useNotificationPrefsStore,
  type AnnouncedPushGroup,
  type PushPreferenceGroup,
} from '@/stores/notificationPrefsStore';

export interface PushPreferenceGroupCopy {
  label: string;
  description: string;
  emailSetOnWeb?: true;
}

export const PUSH_PREFERENCE_GROUP_COPY: Record<PushPreferenceGroup, PushPreferenceGroupCopy> = {
  chat_replies: {
    label: 'Chat replies',
    description: 'When a reply to your message is ready',
  },
  tasks: {
    label: 'Task and approval updates',
    description: 'Approval requests and finished or failed tasks',
  },
  scheduled_tasks: {
    label: 'Scheduled tasks',
    description: 'When a scheduled task runs, finishes or needs you',
    emailSetOnWeb: true,
  },
  research: {
    label: 'Research complete',
    description: 'When a research report is ready',
  },
  code: {
    label: MOBILE_CODE_SCREEN_LABEL,
    description: 'When a coding session finishes or needs you',
  },
  product_updates: {
    label: 'Product updates',
    description: 'New features and tips',
  },
  product: {
    label: 'Service status',
    description: 'Service status and connection info',
  },
  usage_resets: {
    label: 'Usage limit resets',
    description: 'When you can send messages again after reaching a limit',
  },
};

const ALL_PUSH_PREFERENCE_GROUPS = Object.keys(PUSH_PREFERENCE_GROUP_COPY) as PushPreferenceGroup[];

export const ACCOUNT_PUSH_PREFERENCE_GROUP = 'usage_resets' satisfies PushPreferenceGroup;

export type DevicePushPreferenceGroup = Exclude<
  PushPreferenceGroup,
  typeof ACCOUNT_PUSH_PREFERENCE_GROUP
>;

function currentAnnouncedPushGroups(): readonly AnnouncedPushGroup[] {
  return useNotificationPrefsStore.getState().announcedPushGroups ?? [];
}

function hasDevicePushSwitch(
  group: PushPreferenceGroup,
  announced: readonly AnnouncedPushGroup[],
): group is DevicePushPreferenceGroup {
  if (group === ACCOUNT_PUSH_PREFERENCE_GROUP) return false;
  if (group === 'product') return FEATURES.companion;
  if (group === 'research') return FEATURES.research && announced.includes(group);
  if (group === 'code') return announced.includes(group);
  return true;
}

export function devicePushPreferenceGroups(
  announced: readonly AnnouncedPushGroup[] = currentAnnouncedPushGroups(),
): DevicePushPreferenceGroup[] {
  return ALL_PUSH_PREFERENCE_GROUPS.filter((group): group is DevicePushPreferenceGroup =>
    hasDevicePushSwitch(group, announced),
  );
}

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

function namedPushPreferenceGroup(value: unknown): PushPreferenceGroup | null {
  if (isPushPreferenceGroup(value)) return value;
  if (typeof value !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(LEGACY_PUSH_PREFERENCE_GROUP, value)
    ? (LEGACY_PUSH_PREFERENCE_GROUP[value] ?? null)
    : null;
}

export function resolvePushPreferenceGroup(
  value: unknown,
  announced: readonly AnnouncedPushGroup[] = currentAnnouncedPushGroups(),
): DevicePushPreferenceGroup | null {
  const group = namedPushPreferenceGroup(value);
  return group !== null && hasDevicePushSwitch(group, announced) ? group : null;
}
