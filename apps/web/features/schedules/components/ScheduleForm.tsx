'use client';

import { useState } from 'react';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { Textarea } from '@shared/ui/textarea';
import { Switch } from '@shared/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@shared/ui/select';
import { Separator } from '@shared/ui/separator';
import { Clock, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import {
  TIMEZONES,
  AVAILABLE_MODELS,
  DAYS_OF_WEEK,
  INITIAL_NOTIFICATION_SETTINGS,
} from '../types';
import type { ScheduleFormData } from '../types';
import { ScheduleNotificationSettings } from './ScheduleNotificationSettings';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScheduleFormProps {
  form: ScheduleFormData;
  onChange: (patch: Partial<ScheduleFormData>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CRON_EXAMPLES = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Weekdays at 9am', value: '0 9 * * 1-5' },
  { label: 'Every Sunday midnight', value: '0 0 * * 0' },
  { label: 'First of month', value: '0 9 1 * *' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  isEdit,
}: ScheduleFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const set = (patch: Partial<ScheduleFormData>) => onChange(patch);

  const toggleDay = (day: number) => {
    const current = form.daysOfWeek;
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    set({ daysOfWeek: next });
  };

  return (
    <div className="space-y-4 py-1">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-name">Name</Label>
        <Input
          id="sf-name"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Daily market summary"
          maxLength={500}
          autoFocus
        />
      </div>

      {/* Prompt */}
      <div className="space-y-1.5">
        <Label htmlFor="sf-prompt">Prompt</Label>
        <Textarea
          id="sf-prompt"
          value={form.prompt}
          onChange={(e) => set({ prompt: e.target.value })}
          placeholder="What should the AI do?"
          rows={4}
          maxLength={10000}
        />
      </div>

      {/* Model */}
      <div className="space-y-1.5">
        <Label>Model</Label>
        <Select value={form.model} onValueChange={(v) => set({ model: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_MODELS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Recurrence + Time */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Recurrence</Label>
          <Select value={form.recurrence} onValueChange={(v) => set({ recurrence: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">One-time</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom Cron</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.recurrence !== 'custom' && (
          <div className="space-y-1.5">
            <Label htmlFor="sf-time">Time</Label>
            <Input
              id="sf-time"
              type="time"
              value={form.timeOfDay}
              onChange={(e) => set({ timeOfDay: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Days of week picker — only for weekly */}
      {form.recurrence === 'weekly' && (
        <div className="space-y-1.5">
          <Label>Days of week</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS_OF_WEEK.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  form.daysOfWeek.includes(day.value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-muted-foreground hover:border-primary/50',
                )}
              >
                {day.label}
              </button>
            ))}
          </div>
          {form.daysOfWeek.length === 0 && (
            <p className="text-xs text-muted-foreground">Select at least one day.</p>
          )}
        </div>
      )}

      {/* Day of month — only for monthly */}
      {form.recurrence === 'monthly' && (
        <div className="space-y-1.5">
          <Label>Day of month</Label>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => set({ dayOfMonth: form.dayOfMonth === day ? null : day })}
                className={cn(
                  'h-7 w-7 rounded text-xs font-medium transition-colors',
                  form.dayOfMonth === day
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                )}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom cron expression */}
      {form.recurrence === 'custom' && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="sf-cron">
              Cron expression
              <span className="ml-1 text-muted-foreground">
                (minute hour day month weekday)
              </span>
            </Label>
            <Input
              id="sf-cron"
              value={form.cronExpression}
              onChange={(e) => set({ cronExpression: e.target.value })}
              placeholder="0 9 * * *"
              className="font-mono"
            />
          </div>
          <div className="rounded-md border border-border/50 bg-muted/20 p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              <span>Quick examples</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CRON_EXAMPLES.map((ex) => (
                <button
                  key={ex.value}
                  type="button"
                  onClick={() => set({ cronExpression: ex.value })}
                  className={cn(
                    'rounded border px-2 py-0.5 font-mono text-xs transition-colors',
                    form.cronExpression === ex.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-transparent text-muted-foreground hover:border-primary/50',
                  )}
                  title={ex.value}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timezone */}
      <div className="space-y-1.5">
        <Label>Timezone</Label>
        <Select value={form.timezone} onValueChange={(v) => set({ timezone: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
        <div>
          <p className="text-sm font-medium">Active</p>
          <p className="text-xs text-muted-foreground">Enable or pause this schedule</p>
        </div>
        <Switch
          checked={form.isActive}
          onCheckedChange={(checked) => set({ isActive: checked })}
        />
      </div>

      {/* Notifications collapsible */}
      <Separator />
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-sm font-medium"
        onClick={() => setShowNotifications((v) => !v)}
      >
        <span>Notification Settings</span>
        {showNotifications ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {showNotifications && (
        <ScheduleNotificationSettings
          settings={form.notificationSettings ?? INITIAL_NOTIFICATION_SETTINGS}
          onChange={(ns) => set({ notificationSettings: ns })}
        />
      )}

      {/* Advanced collapsible — only shows when not already shown via recurrence */}
      {form.recurrence !== 'custom' && (
        <>
          <Separator />
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-medium"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span>Advanced</span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showAdvanced && (
            <div className="space-y-1.5">
              <Label htmlFor="sf-cron-adv">
                Override with cron expression{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="sf-cron-adv"
                value={form.cronExpression}
                onChange={(e) => set({ cronExpression: e.target.value })}
                placeholder="Leave blank to use the settings above"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Setting a cron expression overrides the recurrence and time fields.
              </p>
            </div>
          )}
        </>
      )}

      {/* Footer buttons */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Clock className="mr-2 h-4 w-4" />
          )}
          {isEdit ? 'Save Changes' : 'Create Schedule'}
        </Button>
      </div>
    </div>
  );
}

export default ScheduleForm;
