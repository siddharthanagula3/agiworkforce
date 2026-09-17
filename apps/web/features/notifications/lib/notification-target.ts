import { isProductLinkId, isProductLinkTarget, productLinkPath } from '@agiworkforce/types';
import {
  SETTINGS_DEEP_LINK_QUERY_KEY,
  isWebSettingsSection,
} from '@/features/settings/lib/web-settings-sections';

export {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TARGET_KINDS,
  isNotificationCategory,
  isNotificationSeverity,
  isNotificationTargetKind,
} from '@agiworkforce/types';
export type {
  NotificationCategory,
  NotificationFeedItem,
  NotificationFeedResponse,
  NotificationSeverity,
  NotificationTarget,
  NotificationTargetKind,
} from '@agiworkforce/types';

export function notificationTargetHref(
  kind: string | null | undefined,
  id: string | null | undefined,
): string | null {
  if (!kind || !id || !isProductLinkId(id)) return null;
  if (kind === 'chat') return `/chat/${encodeURIComponent(id)}`;
  if (kind === 'settings') {
    return isWebSettingsSection(id)
      ? `/chat?${SETTINGS_DEEP_LINK_QUERY_KEY}=${encodeURIComponent(id)}`
      : null;
  }
  return isProductLinkTarget(kind) ? productLinkPath(kind, id) : null;
}
