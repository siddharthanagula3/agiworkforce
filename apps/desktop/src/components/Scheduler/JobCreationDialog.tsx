/**
 * JobCreationDialog Component
 *
 * Modal dialog for creating and editing scheduled jobs.
 * Features a cron expression builder for easy schedule configuration.
 */
import { format } from 'date-fns';
import {
  AlertCircle,
  Bell,
  Calendar,
  Clock,
  Code,
  Globe,
  Play,
  RefreshCw,
  Terminal,
  Workflow,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ScheduledJob, SchedulerActionType } from '@/hooks/useScheduler';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Textarea } from '../ui/Textarea';

// ============================================================================
// Types
// ============================================================================

interface JobCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingJob?: ScheduledJob | null;
  onSave: (
    name: string,
    schedule: string,
    actionType: SchedulerActionType,
    actionData: Record<string, unknown>,
  ) => Promise<void>;
}

type SchedulePreset = 'every_minute' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

// ============================================================================
// Cron Expression Builder Utilities
// ============================================================================

const SCHEDULE_PRESETS: Record<
  SchedulePreset,
  { label: string; cron: string; description: string }
> = {
  every_minute: {
    label: 'Every minute',
    cron: '* * * * *',
    description: 'Runs every minute',
  },
  hourly: {
    label: 'Hourly',
    cron: '0 * * * *',
    description: 'Runs at the start of every hour',
  },
  daily: {
    label: 'Daily',
    cron: '0 9 * * *',
    description: 'Runs every day at 9:00 AM',
  },
  weekly: {
    label: 'Weekly',
    cron: '0 9 * * 1',
    description: 'Runs every Monday at 9:00 AM',
  },
  monthly: {
    label: 'Monthly',
    cron: '0 9 1 * *',
    description: 'Runs on the 1st of every month at 9:00 AM',
  },
  custom: {
    label: 'Custom',
    cron: '',
    description: 'Define your own cron expression',
  },
};

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: format(new Date().setHours(i, 0), 'h:00 a'),
}));

const MINUTES = [
  { value: '0', label: ':00' },
  { value: '15', label: ':15' },
  { value: '30', label: ':30' },
  { value: '45', label: ':45' },
];

/**
 * Parse a cron expression into its component parts
 */
function parseCronExpression(cron: string): CronParts {
  const parts = cron.split(' ');
  return {
    minute: parts[0] || '*',
    hour: parts[1] || '*',
    dayOfMonth: parts[2] || '*',
    month: parts[3] || '*',
    dayOfWeek: parts[4] || '*',
  };
}

/**
 * Build a cron expression from its component parts
 */
function buildCronExpression(parts: CronParts): string {
  return `${parts.minute} ${parts.hour} ${parts.dayOfMonth} ${parts.month} ${parts.dayOfWeek}`;
}

/**
 * Get a human-readable description of a cron expression
 */
function describeCronExpression(cron: string): string {
  const parts = parseCronExpression(cron);

  // Check for presets
  if (cron === '* * * * *') return 'Every minute';
  if (cron === '0 * * * *') return 'Every hour';
  if (parts.dayOfMonth === '*' && parts.month === '*' && parts.dayOfWeek === '*') {
    if (parts.minute === '0') {
      const hour = parseInt(parts.hour, 10);
      if (!isNaN(hour)) {
        return `Every day at ${format(new Date().setHours(hour, 0), 'h:00 a')}`;
      }
    }
  }
  if (parts.dayOfMonth === '*' && parts.month === '*' && parts.dayOfWeek !== '*') {
    const dayNum = parseInt(parts.dayOfWeek, 10);
    const day = DAYS_OF_WEEK.find((d) => d.value === parts.dayOfWeek)?.label || parts.dayOfWeek;
    const hour = parseInt(parts.hour, 10);
    const minute = parseInt(parts.minute, 10);
    if (!isNaN(hour) && !isNaN(dayNum)) {
      return `Every ${day} at ${format(new Date().setHours(hour, minute), 'h:mm a')}`;
    }
  }
  if (parts.dayOfMonth !== '*' && parts.month === '*' && parts.dayOfWeek === '*') {
    const day = parts.dayOfMonth;
    const hour = parseInt(parts.hour, 10);
    if (!isNaN(hour)) {
      return `Monthly on day ${day} at ${format(new Date().setHours(hour, 0), 'h:00 a')}`;
    }
  }

  return `Cron: ${cron}`;
}

/**
 * Validate a cron expression
 */
function validateCronExpression(cron: string): { valid: boolean; error?: string } {
  const parts = cron.split(' ');
  if (parts.length !== 5) {
    return {
      valid: false,
      error: 'Cron expression must have exactly 5 parts (minute hour day month weekday)',
    };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Validate minute (0-59 or *)
  if (minute !== '*' && !/^\d+$/.test(minute || '')) {
    const min = parseInt(minute || '', 10);
    if (isNaN(min) || min < 0 || min > 59) {
      return { valid: false, error: 'Minute must be 0-59 or *' };
    }
  }

  // Validate hour (0-23 or *)
  if (hour !== '*' && !/^\d+$/.test(hour || '')) {
    const h = parseInt(hour || '', 10);
    if (isNaN(h) || h < 0 || h > 23) {
      return { valid: false, error: 'Hour must be 0-23 or *' };
    }
  }

  // Validate day of month (1-31 or *)
  if (dayOfMonth !== '*' && !/^\d+$/.test(dayOfMonth || '')) {
    const d = parseInt(dayOfMonth || '', 10);
    if (isNaN(d) || d < 1 || d > 31) {
      return { valid: false, error: 'Day of month must be 1-31 or *' };
    }
  }

  // Validate month (1-12 or *)
  if (month !== '*' && !/^\d+$/.test(month || '')) {
    const m = parseInt(month || '', 10);
    if (isNaN(m) || m < 1 || m > 12) {
      return { valid: false, error: 'Month must be 1-12 or *' };
    }
  }

  // Validate day of week (0-6 or *)
  if (dayOfWeek !== '*' && !/^\d+$/.test(dayOfWeek || '')) {
    const dow = parseInt(dayOfWeek || '', 10);
    if (isNaN(dow) || dow < 0 || dow > 6) {
      return { valid: false, error: 'Day of week must be 0-6 (Sunday=0) or *' };
    }
  }

  return { valid: true };
}

// ============================================================================
// Component
// ============================================================================

export function JobCreationDialog({
  open,
  onOpenChange,
  existingJob,
  onSave,
}: JobCreationDialogProps) {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [actionType, setActionType] = useState<SchedulerActionType>('notification');
  const [actionData, setActionData] = useState<Record<string, unknown>>({});
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('daily');
  const [customCron, setCustomCron] = useState('0 9 * * *');
  const [cronParts, setCronParts] = useState<CronParts>({
    minute: '0',
    hour: '9',
    dayOfMonth: '*',
    month: '*',
    dayOfWeek: '*',
  });
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form when dialog opens or job changes
  useEffect(() => {
    if (open) {
      if (existingJob) {
        setName(existingJob.name);
        setDescription(existingJob.description || '');
        setActionType(existingJob.action_type);
        setActionData(existingJob.action_data);

        // Parse the schedule
        const cron = existingJob.schedule;
        const parts = parseCronExpression(cron);
        setCronParts(parts);
        setCustomCron(cron);

        // Determine if it matches a preset
        const matchingPreset = Object.entries(SCHEDULE_PRESETS).find(
          ([key, preset]) => key !== 'custom' && preset.cron === cron,
        );
        if (matchingPreset) {
          setSchedulePreset(matchingPreset[0] as SchedulePreset);
        } else {
          setSchedulePreset('custom');
        }
      } else {
        // Reset to defaults
        setName('');
        setDescription('');
        setActionType('notification');
        setActionData({});
        setSchedulePreset('daily');
        setCustomCron('0 9 * * *');
        setCronParts({
          minute: '0',
          hour: '9',
          dayOfMonth: '*',
          month: '*',
          dayOfWeek: '*',
        });
      }
      setValidationError(null);
    }
  }, [open, existingJob]);

  // Update cron parts when preset changes
  useEffect(() => {
    if (schedulePreset !== 'custom') {
      const preset = SCHEDULE_PRESETS[schedulePreset];
      const parts = parseCronExpression(preset.cron);
      setCronParts(parts);
      setCustomCron(preset.cron);
    }
  }, [schedulePreset]);

  // Update custom cron when parts change
  useEffect(() => {
    if (schedulePreset === 'custom') {
      setCustomCron(buildCronExpression(cronParts));
    }
  }, [cronParts, schedulePreset]);

  // Get the final cron expression
  const finalCron = useMemo(() => {
    if (schedulePreset === 'custom') {
      return customCron;
    }
    return SCHEDULE_PRESETS[schedulePreset].cron;
  }, [schedulePreset, customCron]);

  // Validate the cron expression
  const cronValidation = useMemo(() => validateCronExpression(finalCron), [finalCron]);

  // Get human-readable description
  const scheduleDescription = useMemo(() => {
    if (!cronValidation.valid) return 'Invalid schedule';
    return describeCronExpression(finalCron);
  }, [finalCron, cronValidation]);

  // Handle action type specific data
  const renderActionDataFields = useCallback(() => {
    switch (actionType) {
      case 'notification':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notificationTitle">Title</Label>
              <Input
                id="notificationTitle"
                value={(actionData['title'] as string) || ''}
                onChange={(e) => setActionData({ ...actionData, title: e.target.value })}
                placeholder="Notification title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notificationMessage">Message</Label>
              <Textarea
                id="notificationMessage"
                value={(actionData['message'] as string) || ''}
                onChange={(e) => setActionData({ ...actionData, message: e.target.value })}
                placeholder="Notification message"
                rows={3}
              />
            </div>
          </div>
        );

      case 'agi_task':
        return (
          <div className="space-y-2">
            <Label htmlFor="agiPrompt">Task Prompt</Label>
            <Textarea
              id="agiPrompt"
              value={(actionData['prompt'] as string) || ''}
              onChange={(e) => setActionData({ ...actionData, prompt: e.target.value })}
              placeholder="Describe what you want the AI to do..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              The AI will autonomously complete this task when the schedule triggers.
            </p>
          </div>
        );

      case 'shell_command':
        return (
          <div className="space-y-2">
            <Label htmlFor="shellCommand">Command</Label>
            <Input
              id="shellCommand"
              value={(actionData['command'] as string) || ''}
              onChange={(e) => setActionData({ ...actionData, command: e.target.value })}
              placeholder="e.g., ./backup.sh or npm run build"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Shell command to execute. Use absolute paths for scripts.
            </p>
          </div>
        );

      case 'workflow':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workflowId">Workflow ID</Label>
              <Input
                id="workflowId"
                value={(actionData['workflow_id'] as string) || ''}
                onChange={(e) => setActionData({ ...actionData, workflow_id: e.target.value })}
                placeholder="wf-xxxxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workflowParams">Parameters (JSON)</Label>
              <Textarea
                id="workflowParams"
                value={
                  actionData['parameters'] ? JSON.stringify(actionData['parameters'], null, 2) : ''
                }
                onChange={(e) => {
                  try {
                    const params = e.target.value ? JSON.parse(e.target.value) : {};
                    setActionData({ ...actionData, parameters: params });
                  } catch {
                    // Keep the raw value for editing
                  }
                }}
                placeholder='{"key": "value"}'
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          </div>
        );

      case 'webhook':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">URL</Label>
              <Input
                id="webhookUrl"
                value={(actionData['url'] as string) || ''}
                onChange={(e) => setActionData({ ...actionData, url: e.target.value })}
                placeholder="https://api.example.com/webhook"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhookMethod">Method</Label>
              <Select
                value={(actionData['method'] as string) || 'POST'}
                onValueChange={(v) => setActionData({ ...actionData, method: v })}
              >
                <SelectTrigger id="webhookMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhookBody">Body (JSON)</Label>
              <Textarea
                id="webhookBody"
                value={(actionData['body'] as string) || ''}
                onChange={(e) => setActionData({ ...actionData, body: e.target.value })}
                placeholder='{"key": "value"}'
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          </div>
        );

      case 'script':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scriptPath">Script Path</Label>
              <Input
                id="scriptPath"
                value={(actionData['script_path'] as string) || ''}
                onChange={(e) => setActionData({ ...actionData, script_path: e.target.value })}
                placeholder="/path/to/script.js"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scriptArgs">Arguments</Label>
              <Input
                id="scriptArgs"
                value={
                  Array.isArray(actionData['args'])
                    ? (actionData['args'] as string[]).join(' ')
                    : ''
                }
                onChange={(e) =>
                  setActionData({
                    ...actionData,
                    args: e.target.value.split(' ').filter(Boolean),
                  })
                }
                placeholder="--arg1 value --arg2"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [actionType, actionData]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!name.trim()) {
        setValidationError('Job name is required');
        return;
      }

      if (!cronValidation.valid) {
        setValidationError(cronValidation.error || 'Invalid cron expression');
        return;
      }

      setLoading(true);
      setValidationError(null);

      try {
        await onSave(name.trim(), finalCron, actionType, {
          ...actionData,
          description: description.trim() || undefined,
        });
        onOpenChange(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setValidationError(message);
      } finally {
        setLoading(false);
      }
    },
    [name, description, finalCron, actionType, actionData, cronValidation, onSave, onOpenChange],
  );

  // Action type icons
  const getActionIcon = (type: SchedulerActionType) => {
    switch (type) {
      case 'notification':
        return <Bell className="h-4 w-4" />;
      case 'agi_task':
        return <RefreshCw className="h-4 w-4" />;
      case 'shell_command':
        return <Terminal className="h-4 w-4" />;
      case 'workflow':
        return <Workflow className="h-4 w-4" />;
      case 'webhook':
        return <Globe className="h-4 w-4" />;
      case 'script':
        return <Code className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {existingJob ? 'Edit Scheduled Job' : 'Create Scheduled Job'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Job Name */}
          <div className="space-y-2">
            <Label htmlFor="jobName">Job Name</Label>
            <Input
              id="jobName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Daily Backup, Morning Briefing"
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="jobDescription">Description (optional)</Label>
            <Textarea
              id="jobDescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this job do?"
              rows={2}
            />
          </div>

          {/* Action Type */}
          <div className="space-y-2">
            <Label htmlFor="actionType">Action Type</Label>
            <Select
              value={actionType}
              onValueChange={(v) => {
                setActionType(v as SchedulerActionType);
                setActionData({});
              }}
            >
              <SelectTrigger id="actionType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notification">
                  <span className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notification
                  </span>
                </SelectItem>
                <SelectItem value="agi_task">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    AI Task
                  </span>
                </SelectItem>
                <SelectItem value="shell_command">
                  <span className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    Shell Command
                  </span>
                </SelectItem>
                <SelectItem value="workflow">
                  <span className="flex items-center gap-2">
                    <Workflow className="h-4 w-4" />
                    Workflow
                  </span>
                </SelectItem>
                <SelectItem value="webhook">
                  <span className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Webhook
                  </span>
                </SelectItem>
                <SelectItem value="script">
                  <span className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    Script
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action-specific fields */}
          <div className="rounded-md border p-4 bg-muted/30">
            <h4 className="font-medium mb-4 flex items-center gap-2">
              {getActionIcon(actionType)}
              Action Configuration
            </h4>
            {renderActionDataFields()}
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <Label>Schedule</Label>

            {/* Preset Selection */}
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(SCHEDULE_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  type="button"
                  variant={schedulePreset === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSchedulePreset(key as SchedulePreset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {/* Custom Cron Builder */}
            {schedulePreset === 'custom' && (
              <div className="rounded-md border p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cronHour">Hour</Label>
                    <Select
                      value={cronParts.hour}
                      onValueChange={(v) => setCronParts({ ...cronParts, hour: v })}
                    >
                      <SelectTrigger id="cronHour">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">Every hour</SelectItem>
                        {HOURS.map((h) => (
                          <SelectItem key={h.value} value={h.value}>
                            {h.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cronMinute">Minute</Label>
                    <Select
                      value={cronParts.minute}
                      onValueChange={(v) => setCronParts({ ...cronParts, minute: v })}
                    >
                      <SelectTrigger id="cronMinute">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">Every minute</SelectItem>
                        {MINUTES.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                        {/* Add more minutes */}
                        {Array.from({ length: 60 }, (_, i) => i)
                          .filter((i) => ![0, 15, 30, 45].includes(i))
                          .map((i) => (
                            <SelectItem key={i} value={i.toString()}>
                              :{i.toString().padStart(2, '0')}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cronDayOfWeek">Day of Week</Label>
                    <Select
                      value={cronParts.dayOfWeek}
                      onValueChange={(v) => setCronParts({ ...cronParts, dayOfWeek: v })}
                    >
                      <SelectTrigger id="cronDayOfWeek">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">Every day</SelectItem>
                        {DAYS_OF_WEEK.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cronDayOfMonth">Day of Month</Label>
                    <Select
                      value={cronParts.dayOfMonth}
                      onValueChange={(v) => setCronParts({ ...cronParts, dayOfMonth: v })}
                    >
                      <SelectTrigger id="cronDayOfMonth">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="*">Every day</SelectItem>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={d.toString()}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rawCron">Raw Cron Expression</Label>
                  <Input
                    id="rawCron"
                    value={customCron}
                    onChange={(e) => {
                      setCustomCron(e.target.value);
                      const parts = parseCronExpression(e.target.value);
                      setCronParts(parts);
                    }}
                    placeholder="* * * * *"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: minute hour day-of-month month day-of-week
                  </p>
                </div>
              </div>
            )}

            {/* Schedule Preview */}
            <div className="rounded-md bg-muted p-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <span className="font-medium">Schedule:</span> {scheduleDescription}
              </span>
            </div>
          </div>

          {/* Validation Error */}
          {validationError && (
            <div className="rounded-md bg-destructive/10 p-3 flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{validationError}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !cronValidation.valid}>
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  {existingJob ? 'Save Changes' : 'Create Job'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default JobCreationDialog;
