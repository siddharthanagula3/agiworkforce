import React from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@shared/ui/button';
import { Switch } from '@shared/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@shared/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import type { NotificationPreferencesFormData } from '@features/settings/schemas/settings-validation';

interface NotificationsPanelProps {
  notificationForm: UseFormReturn<NotificationPreferencesFormData>;
  isSaving: boolean;
  isUpdatePending: boolean;
  onSaveNotifications: (data: NotificationPreferencesFormData) => void;
}

const NOTIFICATION_FIELDS: {
  key: keyof NotificationPreferencesFormData;
  label: string;
  desc: string;
}[] = [
  {
    key: 'email_notifications',
    label: 'Email Notifications',
    desc: 'Receive notifications via email',
  },
  { key: 'push_notifications', label: 'Push Notifications', desc: 'Browser push notifications' },
  {
    key: 'workflow_alerts',
    label: 'Workflow Alerts',
    desc: 'Alerts when workflows complete or fail',
  },
  {
    key: 'employee_updates',
    label: 'Employee Updates',
    desc: 'Updates about AI employee performance',
  },
  {
    key: 'system_maintenance',
    label: 'System Maintenance',
    desc: 'Scheduled maintenance notifications',
  },
  { key: 'marketing_emails', label: 'Marketing Emails', desc: 'Product updates and offers' },
  { key: 'weekly_reports', label: 'Weekly Reports', desc: 'Weekly performance summaries' },
  { key: 'instant_alerts', label: 'Instant Alerts', desc: 'Real-time critical alerts' },
];

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  notificationForm,
  isSaving,
  isUpdatePending,
  onSaveNotifications,
}) => (
  <Card className="border-border bg-card">
    <CardHeader>
      <CardTitle className="text-foreground">Notification Preferences</CardTitle>
      <CardDescription>Choose how and when you want to receive notifications</CardDescription>
    </CardHeader>
    <CardContent>
      <Form {...notificationForm}>
        <form onSubmit={notificationForm.handleSubmit(onSaveNotifications)} className="space-y-6">
          <div className="space-y-4">
            {NOTIFICATION_FIELDS.map(({ key, label, desc }) => (
              <FormField
                key={key}
                control={notificationForm.control}
                name={key}
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-foreground">{label}</FormLabel>
                      <FormDescription>{desc}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {notificationForm.formState.isDirty && (
                <span className="text-yellow-500">You have unsaved changes</span>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSaving || !notificationForm.formState.isDirty}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdatePending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Preferences
            </Button>
          </div>
        </form>
      </Form>
    </CardContent>
  </Card>
);
