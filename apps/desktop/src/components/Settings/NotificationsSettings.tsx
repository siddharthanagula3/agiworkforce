/**
 * NotificationsSettings tab content
 *
 * Extracted from SettingsPanel.tsx for code organization.
 * Handles: Desktop Notifications, Sound Effects toggles.
 */
import { Loader2 } from 'lucide-react';
import { isCloudWeb } from '@/lib/tauri-mock';
import { Label } from '../ui/Label';
import { Switch } from '../ui/Switch';
import type { NotificationSettings } from '../../hooks/useNotifications';

interface NotificationsSettingsProps {
  notificationLoading: boolean;
  notificationSettings: NotificationSettings | null;
  notificationError: string | null;
  onUpdateNotificationSettings: (updates: Partial<NotificationSettings>) => void;
}

export function NotificationsSettings({
  notificationLoading,
  notificationSettings,
  notificationError,
  onUpdateNotificationSettings,
}: NotificationsSettingsProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Notifications</h3>
      <p className="text-sm text-muted-foreground mb-6">Configure how you receive notifications</p>
      {notificationLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading notification settings...</span>
        </div>
      ) : notificationSettings ? (
        <div className="space-y-4">
          {notificationError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {notificationError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{isCloudWeb ? 'Browser Notifications' : 'Desktop Notifications'}</Label>
              <p className="text-xs text-muted-foreground">
                Show {isCloudWeb ? 'browser' : 'system'} notifications for agent completions and
                alerts
              </p>
            </div>
            <Switch
              checked={notificationSettings.desktop_notifications}
              onCheckedChange={(enabled) =>
                onUpdateNotificationSettings({ desktop_notifications: enabled })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Sound Effects</Label>
              <p className="text-xs text-muted-foreground">
                Play sounds for message received and task completion
              </p>
            </div>
            <Switch
              checked={notificationSettings.sound_enabled}
              onCheckedChange={(enabled) =>
                onUpdateNotificationSettings({ sound_enabled: enabled })
              }
            />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {notificationError || 'Notification settings are unavailable.'}
        </div>
      )}
    </div>
  );
}
