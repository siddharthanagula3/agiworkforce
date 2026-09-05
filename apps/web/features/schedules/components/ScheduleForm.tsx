'use client';

import { useEffect } from 'react';
import { Button, Input, Label, Switch, Textarea } from '@agiworkforce/ui';
import { CalendarClock, Loader2 } from 'lucide-react';
import { describeSweepCadence, SWEEP_INTERVAL_MS } from '@/lib/schedules/schedule-time';
import type { IntervalUnit, ScheduleDraft, ScheduleFormErrors } from '../types';
import { AVAILABLE_MODELS, DAYS_OF_WEEK } from '../types';

interface ScheduleFormProps {
  draft: ScheduleDraft;
  errors: ScheduleFormErrors;
  submitError: string | null;
  saving: boolean;
  isEdit: boolean;
  onChange: (patch: Partial<ScheduleDraft>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const FIELD_ORDER: (keyof ScheduleDraft)[] = [
  'name',
  'description',
  'prompt',
  'model',
  'recurrence',
  'scheduledLocal',
  'intervalValue',
  'timeOfDay',
  'daysOfWeek',
  'dayOfMonth',
  'cronExpression',
  'timezone',
  'expiresLocal',
  'maxExecutions',
];

const fieldId = (field: keyof ScheduleDraft) => `schedule-${field}`;

function FieldError({ field, errors }: { field: keyof ScheduleDraft; errors: ScheduleFormErrors }) {
  const message = errors[field];
  if (!message) return null;
  return (
    <p id={`${fieldId(field)}-error`} role="alert" className="text-xs text-danger">
      {message}
    </p>
  );
}

function describedBy(field: keyof ScheduleDraft, errors: ScheduleFormErrors, helper?: string) {
  return (
    [helper, errors[field] ? `${fieldId(field)}-error` : null].filter(Boolean).join(' ') ||
    undefined
  );
}

const nativeSelectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const INTERVAL_UNITS: { value: IntervalUnit; label: string; ms: number }[] = [
  { value: 'minutes', label: 'Minutes', ms: 60_000 },
  { value: 'hours', label: 'Hours', ms: 60 * 60_000 },
  { value: 'days', label: 'Days', ms: 24 * 60 * 60_000 },
];

export function ScheduleForm({
  draft,
  errors,
  submitError,
  saving,
  isEdit,
  onChange,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const visibleIntervalUnits = INTERVAL_UNITS.filter(
    (unit) => unit.ms >= SWEEP_INTERVAL_MS || unit.value === draft.intervalUnit,
  );

  useEffect(() => {
    const firstError = FIELD_ORDER.find((field) => errors[field]);
    if (!firstError) return;
    const target = document.getElementById(fieldId(firstError));
    if (target instanceof HTMLElement) target.focus();
  }, [errors]);

  const set = (patch: Partial<ScheduleDraft>) => onChange(patch);
  const toggleDay = (day: number) => {
    set({
      daysOfWeek: draft.daysOfWeek.includes(day)
        ? draft.daysOfWeek.filter((candidate) => candidate !== day)
        : [...draft.daysOfWeek, day],
    });
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-6 pr-3">
        <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Scheduled runs use Managed Cloud and return text. Web search, tools, research, files, and
          media generation are not available in this surface. Email and mobile-push alerts for a
          finished run are account-wide, not per schedule, turn them on in Settings → Notifications.
        </div>

        {submitError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-danger"
          >
            {submitError} Review the fields below or retry.
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={fieldId('name')}>Schedule Name</Label>
            <Input
              id={fieldId('name')}
              name="scheduleName"
              autoComplete="off"
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="Daily priorities…"
              maxLength={500}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describedBy('name', errors)}
            />
            <FieldError field="name" errors={errors} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={fieldId('description')}>Description</Label>
            <Input
              id={fieldId('description')}
              name="scheduleDescription"
              autoComplete="off"
              value={draft.description}
              onChange={(event) => set({ description: event.target.value })}
              placeholder="Why this task runs…"
              maxLength={2_000}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describedBy('description', errors, 'schedule-description-helper')}
            />
            <p id="schedule-description-helper" className="text-xs text-muted-foreground">
              Optional. This is visible only in your schedule list.
            </p>
            <FieldError field="description" errors={errors} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={fieldId('prompt')}>Task Instructions</Label>
            <Textarea
              id={fieldId('prompt')}
              name="taskInstructions"
              autoComplete="off"
              value={draft.prompt}
              onChange={(event) => set({ prompt: event.target.value })}
              placeholder="Describe the text task to run…"
              rows={5}
              maxLength={10_000}
              aria-invalid={Boolean(errors.prompt)}
              aria-describedby={describedBy('prompt', errors, 'schedule-prompt-helper')}
            />
            <p id="schedule-prompt-helper" className="text-xs text-muted-foreground">
              Write a self-contained instruction. Scheduled runs do not inherit chat context or
              memory.
            </p>
            <FieldError field="prompt" errors={errors} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId('model')}>Model</Label>
            <select
              id={fieldId('model')}
              name="model"
              autoComplete="off"
              className={nativeSelectClass}
              value={draft.model}
              onChange={(event) => set({ model: event.target.value })}
              aria-invalid={Boolean(errors.model)}
              aria-describedby={describedBy('model', errors, 'schedule-model-helper')}
            >
              {AVAILABLE_MODELS.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
            <p id="schedule-model-helper" className="text-xs text-muted-foreground">
              Limited to the models Managed Cloud runs schedules on.
            </p>
            <FieldError field="model" errors={errors} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={fieldId('recurrence')}>Frequency</Label>
            <select
              id={fieldId('recurrence')}
              name="recurrence"
              autoComplete="off"
              className={nativeSelectClass}
              value={draft.recurrence}
              onChange={(event) =>
                set({ recurrence: event.target.value as ScheduleDraft['recurrence'] })
              }
              aria-invalid={Boolean(errors.recurrence)}
              aria-describedby={describedBy('recurrence', errors)}
            >
              <option value="once">One Time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="interval">Interval</option>
              <option value="custom">Custom Cron</option>
            </select>
            <FieldError field="recurrence" errors={errors} />
          </div>
        </div>

        {draft.recurrence === 'once' && (
          <div className="space-y-2">
            <Label htmlFor={fieldId('scheduledLocal')}>Run At</Label>
            <Input
              id={fieldId('scheduledLocal')}
              name="scheduledLocal"
              type="datetime-local"
              autoComplete="off"
              value={draft.scheduledLocal}
              onChange={(event) => set({ scheduledLocal: event.target.value })}
              aria-invalid={Boolean(errors.scheduledLocal)}
              aria-describedby={describedBy('scheduledLocal', errors, 'schedule-run-at-helper')}
            />
            <p id="schedule-run-at-helper" className="text-xs text-muted-foreground">
              Interpreted in the IANA time zone below. Ambiguous or skipped daylight-saving times
              are rejected.
            </p>
            <FieldError field="scheduledLocal" errors={errors} />
          </div>
        )}

        {draft.recurrence === 'interval' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldId('intervalValue')}>Repeat Every</Label>
              <Input
                id={fieldId('intervalValue')}
                name="intervalValue"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                step={1}
                value={draft.intervalValue}
                onChange={(event) => set({ intervalValue: event.target.value })}
                aria-invalid={Boolean(errors.intervalValue)}
                aria-describedby={describedBy('intervalValue', errors)}
              />
              <FieldError field="intervalValue" errors={errors} />
              <p id="schedule-cadence-helper" className="text-xs text-muted-foreground">
                Scheduled tasks are swept {describeSweepCadence().cadence}, so the shortest
                supported interval is {describeSweepCadence().minimum}.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId('intervalUnit')}>Interval Unit</Label>
              <select
                id={fieldId('intervalUnit')}
                name="intervalUnit"
                autoComplete="off"
                className={nativeSelectClass}
                value={draft.intervalUnit}
                onChange={(event) =>
                  set({ intervalUnit: event.target.value as ScheduleDraft['intervalUnit'] })
                }
                aria-describedby="schedule-cadence-helper"
              >
                {visibleIntervalUnits.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {['daily', 'weekly', 'monthly'].includes(draft.recurrence) && (
          <div className="space-y-2">
            <Label htmlFor={fieldId('timeOfDay')}>Local Time</Label>
            <Input
              id={fieldId('timeOfDay')}
              name="timeOfDay"
              type="time"
              autoComplete="off"
              value={draft.timeOfDay}
              onChange={(event) => set({ timeOfDay: event.target.value })}
              aria-invalid={Boolean(errors.timeOfDay)}
              aria-describedby={describedBy('timeOfDay', errors)}
            />
            <FieldError field="timeOfDay" errors={errors} />
          </div>
        )}

        {draft.recurrence === 'weekly' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Days of Week</legend>
            <div id={fieldId('daysOfWeek')} tabIndex={-1} className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const selected = draft.daysOfWeek.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-label={day.longLabel}
                    aria-pressed={selected}
                    onClick={() => toggleDay(day.value)}
                    className="min-h-10 min-w-10 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <FieldError field="daysOfWeek" errors={errors} />
          </fieldset>
        )}

        {draft.recurrence === 'monthly' && (
          <div className="space-y-2">
            <Label htmlFor={fieldId('dayOfMonth')}>Day of Month</Label>
            <Input
              id={fieldId('dayOfMonth')}
              name="dayOfMonth"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={1}
              max={31}
              step={1}
              value={draft.dayOfMonth ?? ''}
              onChange={(event) =>
                set({ dayOfMonth: event.target.value ? Number(event.target.value) : null })
              }
              aria-invalid={Boolean(errors.dayOfMonth)}
              aria-describedby={describedBy('dayOfMonth', errors, 'schedule-month-day-helper')}
            />
            <p id="schedule-month-day-helper" className="text-xs text-muted-foreground">
              Months without that day are skipped.
            </p>
            <FieldError field="dayOfMonth" errors={errors} />
          </div>
        )}

        {draft.recurrence === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor={fieldId('cronExpression')}>Cron Expression</Label>
            <Input
              id={fieldId('cronExpression')}
              name="cronExpression"
              autoComplete="off"
              spellCheck={false}
              value={draft.cronExpression}
              onChange={(event) => set({ cronExpression: event.target.value })}
              placeholder="0 9 * * 1-5…"
              className="font-mono"
              aria-invalid={Boolean(errors.cronExpression)}
              aria-describedby={describedBy('cronExpression', errors, 'schedule-cron-helper')}
            />
            <p id="schedule-cron-helper" className="text-xs text-muted-foreground">
              Five fields only: minute, hour, day of month, month, and day of week. Tasks are swept
              {` ${describeSweepCadence().cadence}`}, so an expression that fires more often than
              that is rejected.
            </p>
            <FieldError field="cronExpression" errors={errors} />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={fieldId('timezone')}>IANA Time Zone</Label>
          <Input
            id={fieldId('timezone')}
            name="timezone"
            autoComplete="off"
            spellCheck={false}
            value={draft.timezone}
            onChange={(event) => set({ timezone: event.target.value })}
            placeholder="America/Chicago…"
            aria-invalid={Boolean(errors.timezone)}
            aria-describedby={describedBy('timezone', errors, 'schedule-timezone-helper')}
          />
          <p id="schedule-timezone-helper" className="text-xs text-muted-foreground">
            Uses daylight-saving rules for this location. Example: America/Chicago.
          </p>
          <FieldError field="timezone" errors={errors} />
        </div>

        <details className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Execution Limits
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldId('expiresLocal')}>Expire At</Label>
              <Input
                id={fieldId('expiresLocal')}
                name="expiresLocal"
                type="datetime-local"
                autoComplete="off"
                value={draft.expiresLocal}
                onChange={(event) => set({ expiresLocal: event.target.value })}
                aria-invalid={Boolean(errors.expiresLocal)}
                aria-describedby={describedBy('expiresLocal', errors)}
              />
              <FieldError field="expiresLocal" errors={errors} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldId('maxExecutions')}>Maximum Runs</Label>
              <Input
                id={fieldId('maxExecutions')}
                name="maxExecutions"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={1}
                max={1_000_000}
                step={1}
                value={draft.maxExecutions}
                onChange={(event) => set({ maxExecutions: event.target.value })}
                placeholder="No limit…"
                aria-invalid={Boolean(errors.maxExecutions)}
                aria-describedby={describedBy('maxExecutions', errors)}
              />
              <FieldError field="maxExecutions" errors={errors} />
            </div>
          </div>
        </details>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="min-w-0">
            <Label htmlFor={fieldId('isActive')} className="cursor-pointer">
              Active After Save
            </Label>
            <p className="text-xs text-muted-foreground">
              Pause it now if you want to review the schedule before it can run.
            </p>
          </div>
          <Switch
            id={fieldId('isActive')}
            checked={draft.isActive}
            onCheckedChange={(isActive) => set({ isActive })}
            aria-label="Active After Save"
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving} aria-busy={saving}>
          {saving ? (
            <Loader2
              className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Schedule'}
        </Button>
      </div>
    </form>
  );
}

export default ScheduleForm;
