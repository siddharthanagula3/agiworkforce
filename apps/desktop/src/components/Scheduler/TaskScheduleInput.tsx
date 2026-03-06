import { Calendar, Clock, Info, RefreshCw } from 'lucide-react';
import { type TaskInterval, type TaskSchedule } from '../../stores/scheduledTaskStore';
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

function getPreviewLabel(schedule: TaskSchedule): string {
  if (schedule.type === 'once') {
    if (schedule.runAt) {
      const d = new Date(schedule.runAt);
      return `Runs once on ${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return 'Select a date and time above';
  }

  const intervalMap: Record<TaskInterval, string> = {
    hourly: 'Runs every hour',
    daily: 'Runs every day',
    weekly: 'Runs every 7 days',
    monthly: 'Runs every 30 days',
    custom: schedule.cronExpression
      ? `Cron: ${schedule.cronExpression}`
      : 'Enter a cron expression above',
  };
  return intervalMap[schedule.interval ?? 'daily'];
}

export function TaskScheduleInput({ value, onChange, disabled = false }: TaskScheduleInputProps) {
  const isOnce = value.type === 'once';

  const handleTypeChange = (type: 'once' | 'recurring') => {
    if (type === 'once') {
      onChange({ type: 'once', runAt: undefined });
    } else {
      onChange({ type: 'recurring', interval: 'daily' });
    }
  };

  const handleRunAtChange = (raw: string) => {
    const ts = raw ? new Date(raw).getTime() : undefined;
    onChange({ ...value, type: 'once', runAt: ts });
  };

  const handleIntervalChange = (interval: TaskInterval) => {
    onChange({ ...value, type: 'recurring', interval });
  };

  const handleCronChange = (cron: string) => {
    onChange({ ...value, type: 'recurring', interval: 'custom', cronExpression: cron });
  };

  // Format a timestamp to the value required by datetime-local input
  const formatForInput = (ts: number | undefined): string => {
    if (!ts) return '';
    const d = new Date(ts);
    // datetime-local expects: "YYYY-MM-DDTHH:mm"
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fieldClass = cn(
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white',
    'placeholder-slate-500 outline-none transition',
    'focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30',
    disabled && 'cursor-not-allowed opacity-50',
  );

  return (
    <div className="space-y-3">
      {/* Type toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleTypeChange('once')}
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
          onClick={() => handleTypeChange('recurring')}
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

      {/* Conditional inputs */}
      {isOnce ? (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Date &amp; Time</label>
          <input
            type="datetime-local"
            value={formatForInput(value.runAt)}
            onChange={(e) => handleRunAtChange(e.target.value)}
            disabled={disabled}
            className={cn(fieldClass, '[color-scheme:dark]')}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Repeat interval
            </label>
            <select
              value={value.interval ?? 'daily'}
              onChange={(e) => handleIntervalChange(e.target.value as TaskInterval)}
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

          {value.interval === 'custom' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Cron expression
              </label>
              <input
                type="text"
                value={value.cronExpression ?? ''}
                onChange={(e) => handleCronChange(e.target.value)}
                placeholder="0 9 * * * (daily at 9 AM)"
                disabled={disabled}
                className={fieldClass}
              />
              <a
                href="https://crontab.guru"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
              >
                <Info className="h-3 w-3" />
                crontab.guru — cron expression helper
              </a>
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
        <Clock className="h-3.5 w-3.5 flex-shrink-0 text-teal-400" />
        <span className="text-xs text-slate-400">{getPreviewLabel(value)}</span>
      </div>
    </div>
  );
}
