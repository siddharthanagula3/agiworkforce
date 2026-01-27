/**
 * ReminderDialog Component
 *
 * Modal dialog for creating and editing reminders/scheduled tasks.
 * Supports natural language input with schedule preview.
 */
import { format, parse, setHours, setMinutes } from 'date-fns';
import { Bell, Calendar, Clock, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ActionType, ScheduledJob, ScheduleType } from '@/stores/schedulerStore';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Textarea } from '../ui/Textarea';

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingJob?: ScheduledJob | null;
  onSave: (name: string, schedule: string, actionType: string, actionData: string) => Promise<void>;
}

type RepeatOption = 'once' | 'daily' | 'weekly' | 'custom';

interface SchedulePreview {
  scheduleType: ScheduleType;
  description: string;
  scheduleValue: string;
}

/**
 * Parses natural language time input and returns a Date object.
 */
function parseTimeInput(input: string): Date | null {
  const now = new Date();
  const normalizedInput = input.toLowerCase().trim();

  // Check for "in X minutes/hours" format
  const relativePattern = /^in\s+(\d+)\s*(minute|min|hour|hr)s?$/i;
  const relativeMatch = normalizedInput.match(relativePattern);
  if (relativeMatch && relativeMatch[1] && relativeMatch[2]) {
    const amount = relativeMatch[1];
    const unit = relativeMatch[2];
    const result = new Date(now);
    if (unit.startsWith('min')) {
      result.setMinutes(result.getMinutes() + parseInt(amount, 10));
    } else {
      result.setHours(result.getHours() + parseInt(amount, 10));
    }
    return result;
  }

  // Check for absolute time format: "3pm", "3:30pm", "15:00"
  const absolutePattern = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
  const absoluteMatch = normalizedInput.match(absolutePattern);
  if (absoluteMatch && absoluteMatch[1]) {
    const hours = absoluteMatch[1];
    const minutes = absoluteMatch[2] || '0';
    const period = absoluteMatch[3];
    let hour = parseInt(hours, 10);

    if (period) {
      if (period.toLowerCase() === 'pm' && hour < 12) {
        hour += 12;
      } else if (period.toLowerCase() === 'am' && hour === 12) {
        hour = 0;
      }
    }

    const result = setHours(setMinutes(now, parseInt(minutes, 10)), hour);
    // If the time is in the past today, schedule for tomorrow
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // Try standard time format
  try {
    const parsed = parse(normalizedInput, 'HH:mm', now);
    if (!isNaN(parsed.getTime())) {
      if (parsed <= now) {
        parsed.setDate(parsed.getDate() + 1);
      }
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

/**
 * Generates a cron expression from schedule parameters.
 */
function generateSchedule(
  repeatOption: RepeatOption,
  time: string,
  date: string,
  dayOfWeek: string,
  customInterval: string,
): SchedulePreview | null {
  const timeDate = parseTimeInput(time) || (time ? null : new Date());

  if (!timeDate && repeatOption !== 'custom') {
    return null;
  }

  const minutes = timeDate?.getMinutes() ?? 0;
  const hours = timeDate?.getHours() ?? 9;

  switch (repeatOption) {
    case 'once': {
      // For one-time reminders, use the run_at format
      let runAt: Date;
      if (date) {
        runAt = new Date(`${date}T${format(timeDate || new Date(), 'HH:mm')}:00`);
      } else if (timeDate) {
        runAt = timeDate;
      } else {
        return null;
      }

      return {
        scheduleType: 'once',
        description: `Once on ${format(runAt, 'MMM d, yyyy')} at ${format(runAt, 'h:mm a')}`,
        scheduleValue: runAt.toISOString(),
      };
    }

    case 'daily':
      return {
        scheduleType: 'cron',
        description: `Daily at ${format(timeDate || new Date(), 'h:mm a')}`,
        scheduleValue: `${minutes} ${hours} * * *`,
      };

    case 'weekly': {
      const day = parseInt(dayOfWeek, 10);
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        scheduleType: 'cron',
        description: `Every ${days[day]} at ${format(timeDate || new Date(), 'h:mm a')}`,
        scheduleValue: `${minutes} ${hours} * * ${day}`,
      };
    }

    case 'custom': {
      const intervalSeconds = parseInt(customInterval, 10) * 60; // Convert minutes to seconds
      if (isNaN(intervalSeconds) || intervalSeconds <= 0) {
        return null;
      }

      const intervalMinutes = intervalSeconds / 60;
      let description: string;
      if (intervalMinutes < 60) {
        description = `Every ${intervalMinutes} minute${intervalMinutes !== 1 ? 's' : ''}`;
      } else {
        const intervalHours = intervalMinutes / 60;
        description = `Every ${intervalHours} hour${intervalHours !== 1 ? 's' : ''}`;
      }

      return {
        scheduleType: 'interval',
        description,
        scheduleValue: intervalSeconds.toString(),
      };
    }

    default:
      return null;
  }
}

export function ReminderDialog({ open, onOpenChange, existingJob, onSave }: ReminderDialogProps) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [actionType, setActionType] = useState<ActionType>('reminder');
  const [repeatOption, setRepeatOption] = useState<RepeatOption>('once');
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1'); // Monday
  const [customInterval, setCustomInterval] = useState('30'); // 30 minutes default
  const [loading, setLoading] = useState(false);

  // Reset form when dialog opens/closes or when editing a different job
  useEffect(() => {
    if (open) {
      if (existingJob) {
        setName(existingJob.name);

        // Parse action data
        try {
          const actionData = JSON.parse(existingJob.action_data);
          setMessage(actionData.message || actionData.prompt || existingJob.action_data);
        } catch {
          setMessage(existingJob.action_data);
        }

        setActionType(existingJob.action_type);

        // Parse schedule
        if (existingJob.schedule_type === 'once' && existingJob.run_at) {
          setRepeatOption('once');
          const runAt = new Date(existingJob.run_at);
          setTime(format(runAt, 'HH:mm'));
          setDate(format(runAt, 'yyyy-MM-dd'));
        } else if (existingJob.schedule_type === 'interval' && existingJob.interval_seconds) {
          setRepeatOption('custom');
          setCustomInterval((existingJob.interval_seconds / 60).toString());
        } else if (existingJob.schedule_type === 'cron' && existingJob.cron_expression) {
          const cronParts = existingJob.cron_expression.split(' ');
          if (cronParts.length >= 5) {
            const minute = cronParts[0] ?? '0';
            const hour = cronParts[1] ?? '9';
            const dow = cronParts[4] ?? '*';
            const parsedTime = setHours(
              setMinutes(new Date(), parseInt(minute, 10)),
              parseInt(hour, 10),
            );
            setTime(format(parsedTime, 'HH:mm'));

            if (dow === '*') {
              setRepeatOption('daily');
            } else {
              setRepeatOption('weekly');
              setDayOfWeek(dow);
            }
          }
        }
      } else {
        // Reset to defaults for new reminder
        setName('');
        setMessage('');
        setActionType('reminder');
        setRepeatOption('once');
        setTime('');
        setDate(format(new Date(), 'yyyy-MM-dd'));
        setDayOfWeek('1');
        setCustomInterval('30');
      }
    }
  }, [open, existingJob]);

  const schedulePreview = useMemo(() => {
    return generateSchedule(repeatOption, time, date, dayOfWeek, customInterval);
  }, [repeatOption, time, date, dayOfWeek, customInterval]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !schedulePreview) {
      return;
    }

    setLoading(true);
    try {
      const actionData = JSON.stringify({
        message: message.trim(),
        action_type: actionType,
      });

      // Format the schedule string based on type
      let scheduleString: string;
      if (schedulePreview.scheduleType === 'once') {
        scheduleString = `once:${schedulePreview.scheduleValue}`;
      } else if (schedulePreview.scheduleType === 'interval') {
        scheduleString = `interval:${schedulePreview.scheduleValue}`;
      } else {
        scheduleString = `cron:${schedulePreview.scheduleValue}`;
      }

      await onSave(name.trim(), scheduleString, actionType, actionData);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save reminder:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = () => {
    switch (actionType) {
      case 'reminder':
        return <Bell className="h-4 w-4" />;
      case 'briefing':
        return <Calendar className="h-4 w-4" />;
      case 'agent_task':
        return <RefreshCw className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getActionIcon()}
            {existingJob ? 'Edit Reminder' : 'New Reminder'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning standup reminder"
              required
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What should this reminder say?"
              rows={3}
            />
          </div>

          {/* Action Type */}
          <div className="space-y-2">
            <Label htmlFor="actionType">Type</Label>
            <Select value={actionType} onValueChange={(v) => setActionType(v as ActionType)}>
              <SelectTrigger id="actionType">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reminder">
                  <span className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Reminder
                  </span>
                </SelectItem>
                <SelectItem value="briefing">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Briefing
                  </span>
                </SelectItem>
                <SelectItem value="agent_task">
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Agent Task
                  </span>
                </SelectItem>
                <SelectItem value="custom">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Custom
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Repeat Options */}
          <div className="space-y-2">
            <Label htmlFor="repeat">Repeat</Label>
            <Select value={repeatOption} onValueChange={(v) => setRepeatOption(v as RepeatOption)}>
              <SelectTrigger id="repeat">
                <SelectValue placeholder="Select repeat option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Once</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="custom">Custom interval</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time input - for once, daily, weekly */}
          {repeatOption !== 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </div>

              {/* Date - only for once */}
              {repeatOption === 'once' && (
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    required
                  />
                </div>
              )}

              {/* Day of week - for weekly */}
              {repeatOption === 'weekly' && (
                <div className="space-y-2">
                  <Label htmlFor="dayOfWeek">Day</Label>
                  <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                    <SelectTrigger id="dayOfWeek">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Custom interval */}
          {repeatOption === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="customInterval">Interval (minutes)</Label>
              <Input
                id="customInterval"
                type="number"
                min="1"
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
                placeholder="30"
                required
              />
            </div>
          )}

          {/* Schedule Preview */}
          {schedulePreview && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="font-medium">Schedule:</span>
                {schedulePreview.description}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !schedulePreview}>
              {loading ? 'Saving...' : existingJob ? 'Save Changes' : 'Create Reminder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
