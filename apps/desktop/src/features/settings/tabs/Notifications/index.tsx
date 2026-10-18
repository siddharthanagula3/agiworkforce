import { Suspense, lazy } from 'react';
import type { NotificationSettings } from '../../../../stores/notificationStore';
import { TabFallback } from '../TabFallback';

const LazyNotificationsSettings = lazy(() =>
  import('../../NotificationsSettings').then((m) => ({ default: m.NotificationsSettings })),
);

interface NotificationsTabProps {
  notificationLoading: boolean;
  notificationSettings: NotificationSettings | null;
  notificationError: string | null;
  onUpdateNotificationSettings: (updates: Partial<NotificationSettings>) => void;
}

export function NotificationsTab({
  notificationLoading,
  notificationSettings,
  notificationError,
  onUpdateNotificationSettings,
}: NotificationsTabProps) {
  return (
    <Suspense fallback={<TabFallback label="Loading notification settings..." />}>
      <LazyNotificationsSettings
        notificationLoading={notificationLoading}
        notificationSettings={notificationSettings}
        notificationError={notificationError}
        onUpdateNotificationSettings={onUpdateNotificationSettings}
      />
    </Suspense>
  );
}
