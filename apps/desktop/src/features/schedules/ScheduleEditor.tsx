/**
 * ScheduleEditor
 *
 * Full-page (modal overlay) editor for creating or editing a scheduled task.
 * Supports Daily / Weekly / Monthly / Custom (cron) frequencies.
 * Integrates with schedulerStore's createTask / updateTask actions.
 */
import { Calendar, Clock, Info, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useSchedulerStore } from '../../stores/schedulerStore';
import { buildSchedulePreview, type Frequency, type Schedule } from '../../stores/schedulesStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleEditorProps {
  isOpen: boolean;
  editingSchedule?: Schedule | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCY_OPTIONS: Array<{ value: Frequency; label: string; description: string }> = [
  { value: 'daily', label: 'Daily', description: 'Runs once per day at a chosen time' },
  { value: 'weekly', label: 'Weekly', description: 'Runs on selected days of the week' },
  { value: 'monthly', label: 'Monthly', description: 'Runs on the 1st of every month' },
  { value: 'custom', label: 'Custom', description: 'Advanced cron expression' },
];

const WEEKDAY_OPTIONS: Array<{ value: number; label: string; short: string }> = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 0, label: 'Sunday', short: 'Sun' },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = [0, 15, 30, 45];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCronExpression(schedule: {
  frequency: Frequency;
  hour: number;
  minute: number;
  weekDays: number[];
  cronExpression: string;
}): string {
  const { frequency, hour, minute, weekDays, cronExpression } = schedule;
  switch (frequency) {
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly': {
      const days = weekDays.length > 0 ? weekDays.sort((a, b) => a - b).join(',') : '1';
      return `${minute} ${hour} * * ${days}`;
    }
    case 'monthly':
      return `${minute} ${hour} 1 * *`;
    case 'custom':
      return cronExpression;
  }
}

function padTime(n: number): string {
  return String(n).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Field style helper
// ---------------------------------------------------------------------------

function fieldCn(extra?: string): string {
  return cn(
    'w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-2 text-sm text-[var(--chat-text-primary)]',
    'placeholder:text-[var(--chat-text-placeholder)] outline-none transition',
    'focus:border-[var(--chat-accent-primary)] focus:ring-1 focus:ring-[var(--chat-accent-primary)]/30',
    extra,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleEditor({ isOpen, editingSchedule, onClose }: ScheduleEditorProps) {
  const createTask = useSchedulerStore((s) => s.createTask);
  const updateTask = useSchedulerStore((s) => s.updateTask);

  const isEditing = editingSchedule != null;

  // Form state
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [weekDays, setWeekDays] = useState<number[]>([1]); // Monday default
  const [cronExpression, setCronExpression] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (editingSchedule) {
      setName(editingSchedule.name);
      setPrompt(editingSchedule.prompt);
      setFrequency(editingSchedule.frequency);
      setHour(editingSchedule.hour ?? 9);
      setMinute(editingSchedule.minute ?? 0);
      setWeekDays(editingSchedule.weekDays ?? [1]);
      setCronExpression(editingSchedule.cronExpression ?? '');
    } else {
      setName('');
      setPrompt('');
      setFrequency('daily');
      setHour(9);
      setMinute(0);
      setWeekDays([1]);
      setCronExpression('');
    }
  }, [editingSchedule, isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isSaving, onClose]);

  const handleClose = useCallback(() => {
    if (!isSaving) onClose();
  }, [isSaving, onClose]);

  const toggleWeekDay = useCallback((day: number) => {
    setWeekDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }, []);

  const previewLabel = buildSchedulePreview({ frequency, hour, minute, weekDays, cronExpression });

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();

    if (!trimmedName) {
      toast.error('Task name is required');
      return;
    }
    if (!trimmedPrompt) {
      toast.error('AI prompt is required');
      return;
    }
    if (frequency === 'weekly' && weekDays.length === 0) {
      toast.error('Select at least one day of the week');
      return;
    }
    if (frequency === 'custom' && !cronExpression.trim()) {
      toast.error('Cron expression is required');
      return;
    }

    const cron = buildCronExpression({ frequency, hour, minute, weekDays, cronExpression });

    setIsSaving(true);
    try {
      if (isEditing && editingSchedule) {
        await updateTask(editingSchedule.id, {
          name: trimmedName,
          prompt: trimmedPrompt,
          schedule: {
            type: 'recurring',
            interval: frequency === 'custom' ? 'custom' : frequency,
            cronExpression: cron,
          },
        });
        toast.success('Schedule updated');
      } else {
        await createTask({
          name: trimmedName,
          description: '',
          prompt: trimmedPrompt,
          schedule: {
            type: 'recurring',
            interval: frequency === 'custom' ? 'custom' : frequency,
            cronExpression: cron,
          },
          status: 'active',
        });
        toast.success('Schedule created');
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save schedule';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [
    name,
    prompt,
    frequency,
    hour,
    minute,
    weekDays,
    cronExpression,
    isEditing,
    editingSchedule,
    createTask,
    updateTask,
    onClose,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--chat-surface-overlay)]/80 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-editor-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--chat-accent-primary)]" />
            <h2
              id="schedule-editor-title"
              className="text-sm font-semibold text-[var(--chat-text-primary)]"
            >
              {isEditing ? 'Edit Schedule' : 'New Scheduled Task'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="rounded-md p-1 text-[var(--chat-text-muted)] transition hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Name */}
          <div>
            <label
              htmlFor="sched-name"
              className="mb-1.5 block text-sm font-medium text-[var(--chat-text-secondary)]"
            >
              Name <span className="text-[var(--chat-destructive)]">*</span>
            </label>
            <input
              id="sched-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily news summary"
              disabled={isSaving}
              className={fieldCn()}
            />
          </div>

          {/* Prompt */}
          <div>
            <label
              htmlFor="sched-prompt"
              className="mb-1.5 block text-sm font-medium text-[var(--chat-text-secondary)]"
            >
              Prompt / Task <span className="text-[var(--chat-destructive)]">*</span>
            </label>
            <textarea
              id="sched-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the AI do? e.g. 'Summarize the top 5 AI news stories from today…'"
              disabled={isSaving}
              rows={4}
              className={fieldCn('resize-none')}
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="mb-2 block text-sm font-medium text-[var(--chat-text-secondary)]">
              Frequency
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  disabled={isSaving}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-left transition',
                    frequency === opt.value
                      ? 'border-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/15 text-[var(--chat-text-primary)]'
                      : 'border-[var(--chat-border)] bg-[var(--chat-surface-base)] text-[var(--chat-text-muted)] hover:border-[var(--chat-border-strong)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-secondary)]',
                    isSaving && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="mt-0.5 text-xs text-[var(--chat-text-muted)]">
                    {opt.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Weekly: day picker */}
          {frequency === 'weekly' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--chat-text-secondary)]">
                Days of week
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const selected = weekDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekDay(day.value)}
                      disabled={isSaving}
                      aria-pressed={selected}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                        selected
                          ? 'border-[var(--chat-accent-primary)] bg-[var(--chat-accent-primary)]/20 text-[var(--chat-accent-primary)]'
                          : 'border-[var(--chat-border)] bg-[var(--chat-surface-base)] text-[var(--chat-text-muted)] hover:border-[var(--chat-border-strong)] hover:text-[var(--chat-text-secondary)]',
                        isSaving && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily / Weekly / Monthly: time picker */}
          {(frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') && (
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--chat-text-secondary)]">
                Time
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  disabled={isSaving}
                  aria-label="Hour"
                  className={cn(fieldCn('w-28 cursor-pointer'), 'w-28')}
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h} className="bg-[var(--chat-surface-base)]">
                      {padTime(h)}:00
                    </option>
                  ))}
                </select>
                <span className="text-[var(--chat-text-muted)]">:</span>
                <select
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  disabled={isSaving}
                  aria-label="Minute"
                  className={cn(fieldCn('w-24 cursor-pointer'), 'w-24')}
                >
                  {MINUTE_OPTIONS.map((m) => (
                    <option key={m} value={m} className="bg-[var(--chat-surface-base)]">
                      {padTime(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Custom: cron expression */}
          {frequency === 'custom' && (
            <div>
              <label
                htmlFor="sched-cron"
                className="mb-1.5 block text-sm font-medium text-[var(--chat-text-secondary)]"
              >
                Cron expression <span className="text-[var(--chat-destructive)]">*</span>
              </label>
              <input
                id="sched-cron"
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * 1-5 (weekdays at 9 AM)"
                disabled={isSaving}
                className={fieldCn('font-mono')}
              />
              <a
                href="https://crontab.guru"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--chat-accent-primary)] hover:opacity-80"
              >
                <Info className="h-3 w-3" />
                crontab.guru — cron expression helper
              </a>
            </div>
          )}

          {/* Preview */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-2.5">
            {frequency === 'custom' ? (
              <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 text-[var(--chat-accent-primary)]" />
            ) : (
              <Clock className="h-3.5 w-3.5 flex-shrink-0 text-[var(--chat-accent-primary)]" />
            )}
            <span className="text-xs text-[var(--chat-text-muted)]">{previewLabel}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--chat-border)] px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="rounded-lg border border-[var(--chat-border)] px-4 py-2 text-sm font-medium text-[var(--chat-text-secondary)] transition hover:bg-[var(--chat-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
              isSaving
                ? 'cursor-not-allowed bg-[var(--chat-accent-primary)]/50 text-[var(--chat-accent-primary-contrast)]/70'
                : 'bg-[var(--chat-accent-primary)] text-[var(--chat-accent-primary-contrast)] hover:opacity-90',
            )}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? 'Save changes' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
