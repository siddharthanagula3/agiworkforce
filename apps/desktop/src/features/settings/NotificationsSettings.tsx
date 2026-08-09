/**
 * NotificationsSettings tab content
 *
 * Extracted from SettingsPanel.tsx for code organization.
 * Handles: Desktop Notifications, Sound Effects toggles.
 */
import { Loader2 } from 'lucide-react';
import { isCloudWeb } from '@/lib/tauri-mock';
import { Label } from '@/ui/Label';
import { Switch } from '@/ui/Switch';
import type { NotificationSettings, NotificationType } from '../../hooks/useNotifications';

interface NotificationsSettingsProps {
  notificationLoading: boolean;
  notificationSettings: NotificationSettings | null;
  notificationError: string | null;
  onUpdateNotificationSettings: (updates: Partial<NotificationSettings>) => void;
}

const NOTIFICATION_GROUPS: Array<{
  label: string;
  description: string;
  types: NotificationType[];
}> = [
  {
    label: 'Task completions',
    description: 'A scheduled or background task finishes successfully',
    types: ['task_complete'],
  },
  {
    label: 'Failures and input needed',
    description: 'A task fails, an agent pauses, or your attention is required',
    types: ['task_failed', 'agent_activity'],
  },
  {
    label: 'Permission and system alerts',
    description: 'Security warnings, MCP server changes, updates, and runtime errors',
    types: ['system', 'mcp_server', 'warning', 'error'],
  },
  {
    label: 'Reminders',
    description: 'Reminders you explicitly scheduled',
    types: ['reminder'],
  },
];

const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'system',
  'task_complete',
  'task_failed',
  'agent_activity',
  'mcp_server',
  'reminder',
  'achievement',
  'team',
  'info',
  'warning',
  'error',
];

export function NotificationsSettings({
  notificationLoading,
  notificationSettings,
  notificationError,
  onUpdateNotificationSettings,
}: NotificationsSettingsProps) {
  const enabledTypeSet = new Set(
    notificationSettings?.enabled_types.length
      ? notificationSettings.enabled_types
      : ALL_NOTIFICATION_TYPES,
  );

  const setGroupEnabled = (types: NotificationType[], enabled: boolean) => {
    const next = new Set(enabledTypeSet);
    for (const type of types) {
      if (enabled) next.add(type);
      else next.delete(type);
    }
    onUpdateNotificationSettings({ enabled_types: [...next] });
  };

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
              <Label>Notifications enabled</Label>
              <p className="text-xs text-muted-foreground">
                Master switch for in-app and system notification delivery
              </p>
            </div>
            <Switch
              checked={notificationSettings.enabled}
              onCheckedChange={(enabled) => onUpdateNotificationSettings({ enabled })}
            />
          </div>
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

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium">Notify me about</h4>
            <div className="mt-3 space-y-3">
              {NOTIFICATION_GROUPS.map((group) => {
                const checked = group.types.every((type) => enabledTypeSet.has(type));
                return (
                  <div key={group.label} className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label>{group.label}</Label>
                      <p className="text-xs text-muted-foreground">{group.description}</p>
                    </div>
                    <Switch
                      checked={checked}
                      onCheckedChange={(enabled) => setGroupEnabled(group.types, enabled)}
                      aria-label={group.label}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="space-y-0.5">
              <Label>App icon badge</Label>
              <p className="text-xs text-muted-foreground">
                Show the unread notification count on the app icon
              </p>
            </div>
            <Switch
              checked={notificationSettings.badge_enabled}
              onCheckedChange={(enabled) =>
                onUpdateNotificationSettings({ badge_enabled: enabled })
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
