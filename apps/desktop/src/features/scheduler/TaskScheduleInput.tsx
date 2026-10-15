import { Calendar, Clock, RefreshCw } from 'lucide-react';
import { useId } from 'react';
import {
  DEFAULT_DAY_OF_MONTH,
  DEFAULT_TIME_OF_DAY,
  DEFAULT_WEEKDAY,
  LAST_DAY_EVERY_MONTH_HAS,
  type TaskInterval,
  type TaskSchedule,
  WEEKDAY_LABELS,
  completeSchedule,
  localTimeZone,
} from '../../stores/schedulerStore';
import { cn } from '../../lib/utils';

export interface TaskScheduleInputProps {
  value: TaskSchedule;
  onChange: (schedule: TaskSchedule) => void;
  disabled?: boolean;
}

const INTERVAL_OPTIONS: Array<{ value: TaskInterval; label: string }> = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom (cron)' },
];

const DAYS_OF_MONTH = Array.from({ length: LAST_DAY_EVERY_MONTH_HAS }, (_, index) => index + 1);

const CRON_EXAMPLE = '0 9 * * 1';

function getPreviewLabel(schedule: TaskSchedule): string {
  if (schedule.type === 'once') {
    if (schedule.runAt) {
      const d = new Date(schedule.runAt);
      return `Runs once on ${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${localTimeZone()} time`;
    }
    return 'Select a date and time above';
  }

  const zone = `${schedule.timezone} time`;
  const time = schedule.timeOfDay ?? DEFAULT_TIME_OF_DAY;
  switch (schedule.interval) {
    case 'hourly':
      return `Runs every hour, on the hour, ${zone}`;
    case 'weekly':
      return `Runs every ${WEEKDAY_LABELS[schedule.weekday ?? DEFAULT_WEEKDAY]} at ${time}, ${zone}`;
    case 'monthly':
      return `Runs on day ${schedule.dayOfMonth ?? DEFAULT_DAY_OF_MONTH} of every month at ${time}, ${zone}`;
    case 'custom':
      return schedule.cronExpression
        ? `Cron ${schedule.cronExpression}, ${zone}`
        : 'Enter a cron expression above';
    default:
      return `Runs every day at ${time}, ${zone}`;
  }
}

export function TaskScheduleInput({ value, onChange, disabled = false }: TaskScheduleInputProps) {
  const schedule = completeSchedule(value);
  const isOnce = schedule.type === 'once';
  const interval = schedule.interval ?? 'daily';
  const fieldId = useId();

  const change = (next: TaskSchedule) => onChange(completeSchedule(next));

  const handleRunAtChange = (raw: string) => {
    const ts = raw ? new Date(raw).getTime() : undefined;
    change({ type: 'once', runAt: Number.isNaN(ts) ? undefined : ts });
  };

  const formatForInput = (ts: number | undefined): string => {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fieldClass = cn(
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white',
    'placeholder-slate-500 outline-none transition',
    'focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30',
    disabled && 'cursor-not-allowed opacity-50',
  );
  const labelClass = 'mb-1.5 block text-xs font-medium text-slate-400';

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={isOnce}
          onClick={() => change({ type: 'once' })}
          disabled={disabled}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition',
            isOnce
              ? 'border-teal-500 bg-teal-500/20 text-teal-300'
              : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200',
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          Run Once
        </button>
        <button
          type="button"
          aria-pressed={!isOnce}
          onClick={() => change({ type: 'recurring', interval: 'daily' })}
          disabled={disabled}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition',
            !isOnce
              ? 'border-teal-500 bg-teal-500/20 text-teal-300'
              : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200',
          )}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recurring
        </button>
      </div>

      {isOnce ? (
        <div>
          <label htmlFor={`${fieldId}-run-at`} className={labelClass}>
            Date &amp; Time
          </label>
          <input
            id={`${fieldId}-run-at`}
            type="datetime-local"
            value={formatForInput(schedule.runAt)}
            onChange={(e) => handleRunAtChange(e.target.value)}
            disabled={disabled}
            className={cn(fieldClass, '[color-scheme:dark]')}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor={`${fieldId}-interval`} className={labelClass}>
              Repeat interval
            </label>
            <select
              id={`${fieldId}-interval`}
              value={interval}
              onChange={(e) => change({ ...schedule, interval: e.target.value as TaskInterval })}
              disabled={disabled}
              className={cn(fieldClass, 'cursor-pointer')}
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {interval === 'weekly' && (
            <div>
              <label htmlFor={`${fieldId}-weekday`} className={labelClass}>
                Day of the week
              </label>
              <select
                id={`${fieldId}-weekday`}
                value={schedule.weekday ?? DEFAULT_WEEKDAY}
                onChange={(e) => change({ ...schedule, weekday: Number(e.target.value) })}
                disabled={disabled}
                className={cn(fieldClass, 'cursor-pointer')}
              >
                {WEEKDAY_LABELS.map((label, weekday) => (
                  <option key={label} value={weekday} className="bg-slate-900">
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {interval === 'monthly' && (
            <div>
              <label htmlFor={`${fieldId}-day-of-month`} className={labelClass}>
                Day of the month
              </label>
              <select
                id={`${fieldId}-day-of-month`}
                value={schedule.dayOfMonth ?? DEFAULT_DAY_OF_MONTH}
                onChange={(e) => change({ ...schedule, dayOfMonth: Number(e.target.value) })}
                disabled={disabled}
                className={cn(fieldClass, 'cursor-pointer')}
              >
                {DAYS_OF_MONTH.map((day) => (
                  <option key={day} value={day} className="bg-slate-900">
                    {day}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(interval === 'daily' || interval === 'weekly' || interval === 'monthly') && (
            <div>
              <label htmlFor={`${fieldId}-time`} className={labelClass}>
                Time
              </label>
              <input
                id={`${fieldId}-time`}
                type="time"
                value={schedule.timeOfDay ?? DEFAULT_TIME_OF_DAY}
                onChange={(e) =>
                  change({ ...schedule, timeOfDay: e.target.value || DEFAULT_TIME_OF_DAY })
                }
                disabled={disabled}
                className={cn(fieldClass, '[color-scheme:dark]')}
              />
            </div>
          )}

          {interval === 'custom' && (
            <div>
              <label htmlFor={`${fieldId}-cron`} className={labelClass}>
                Cron expression
              </label>
              <input
                id={`${fieldId}-cron`}
                type="text"
                value={value.cronExpression ?? ''}
                onChange={(e) =>
                  onChange({ ...schedule, interval: 'custom', cronExpression: e.target.value })
                }
                placeholder={CRON_EXAMPLE}
                aria-describedby={`${fieldId}-cron-help`}
                disabled={disabled}
                className={fieldClass}
              />
              <p id={`${fieldId}-cron-help`} className="mt-1 text-xs text-slate-400">
                Five fields: minute, hour, day of month, month, day of week. {CRON_EXAMPLE} runs
                every Monday at 09:00. A task can run at most every 5 minutes.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-teal-400" />
        <span className="text-xs text-slate-400">{getPreviewLabel(schedule)}</span>
      </div>
    </div>
  );
}
