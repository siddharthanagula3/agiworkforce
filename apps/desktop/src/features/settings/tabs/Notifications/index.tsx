import { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import type { NotificationSettings } from '../../../../hooks/useNotifications';

const LazyNotificationsSettings = lazy(() =>
  import('../../NotificationsSettings').then((m) => ({ default: m.NotificationsSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

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
    <Suspense fallback={<Fallback label="Loading notification settings..." />}>
      <LazyNotificationsSettings
        notificationLoading={notificationLoading}
        notificationSettings={notificationSettings}
        notificationError={notificationError}
        onUpdateNotificationSettings={onUpdateNotificationSettings}
      />
    </Suspense>
  );
}
