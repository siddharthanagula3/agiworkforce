'use client';

import { Switch } from '@shared/ui/switch';
import { Label } from '@shared/ui/label';
import { Input } from '@shared/ui/input';
import { Bell, Mail, Webhook } from 'lucide-react';
import type { NotificationSettings } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleNotificationSettingsProps {
  settings: NotificationSettings;
  onChange: (settings: NotificationSettings) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleNotificationSettings({
  settings,
  onChange,
}: ScheduleNotificationSettingsProps) {
  const update = (patch: Partial<NotificationSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Notifications
      </p>

      {/* Email on complete */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="notif-complete" className="cursor-pointer text-sm font-normal">
            Email on completion
          </Label>
        </div>
        <Switch
          id="notif-complete"
          checked={settings.emailOnComplete}
          onCheckedChange={(checked) => update({ emailOnComplete: checked })}
        />
      </div>

      {/* Email on failure */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="notif-failure" className="cursor-pointer text-sm font-normal">
            Email on failure
          </Label>
        </div>
        <Switch
          id="notif-failure"
          checked={settings.emailOnFailure}
          onCheckedChange={(checked) => update({ emailOnFailure: checked })}
        />
      </div>

      {/* Push notification */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="notif-push" className="cursor-pointer text-sm font-normal">
            Push notification
          </Label>
        </div>
        <Switch
          id="notif-push"
          checked={settings.pushNotification}
          onCheckedChange={(checked) => update({ pushNotification: checked })}
        />
      </div>

      {/* Webhook URL */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="notif-webhook" className="text-sm font-normal">
            Webhook URL{' '}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
        </div>
        <Input
          id="notif-webhook"
          type="url"
          placeholder="https://hooks.example.com/..."
          value={settings.webhookUrl || ''}
          onChange={(e) => update({ webhookUrl: e.target.value })}
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          We&apos;ll POST a JSON payload to this URL after each run.
        </p>
      </div>
    </div>
  );
}

export default ScheduleNotificationSettings;
