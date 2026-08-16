
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BREAK_REMINDER_MINUTES,
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  defaultTimeFocusPreferences,
  normalizeTimeFocusPreferences,
  type TimeFocusPreferences,
  type TimeFocusWeekday,
} from '@agiworkforce/types';

import {
  getCloudPreferenceNamespace,
  saveCloudPreferenceNamespace,
} from '../../../api/cloudAccountSettings';
import { PRIMARY_BUTTON, SectionError, SectionHeading, SectionLoading } from './sectionChrome';

const DAYS: ReadonlyArray<{ value: TimeFocusWeekday; label: string; short: string }> = [
  { value: 0, label: 'Sunday', short: 'S' },
  { value: 1, label: 'Monday', short: 'M' },
  { value: 2, label: 'Tuesday', short: 'T' },
  { value: 3, label: 'Wednesday', short: 'W' },
  { value: 4, label: 'Thursday', short: 'T' },
  { value: 5, label: 'Friday', short: 'F' },
  { value: 6, label: 'Saturday', short: 'S' },
];

function browserTimezone(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatBreakLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`;
}

const CONTROL_CLASS =
  'h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-50';

export function CloudTimeFocusSection() {
  const timezone = useMemo(() => browserTimezone(), []);
  const defaults = useMemo(() => defaultTimeFocusPreferences(timezone), [timezone]);
  const [draft, setDraft] = useState<TimeFocusPreferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const stored = await getCloudPreferenceNamespace(TIME_FOCUS_PREFERENCES_NAMESPACE);
      if (generation.current !== current) return;
      setDraft(normalizeTimeFocusPreferences(stored, timezone));
      setDirty(false);
    } catch (caught) {
      if (generation.current === current) {
        setLoadFailed(true);
        setError(
          caught instanceof Error ? caught.message : 'Could not load your time and focus settings.',
        );
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [timezone]);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  const update = (next: TimeFocusPreferences) => {
    setDraft(next);
    setDirty(true);
    setValidationMessage(null);
    setSavedAt(null);
  };

  const toggleDay = (day: TimeFocusWeekday) => {
    const selected = draft.quietHours.days.includes(day);
    const days = (
      selected
        ? draft.quietHours.days.filter((value) => value !== day)
        : [...draft.quietHours.days, day].sort((a, b) => a - b)
    ) as TimeFocusWeekday[];
    update({ ...draft, quietHours: { ...draft.quietHours, days } });
  };

  const handleSave = async () => {
    if (draft.quietHours.enabled && draft.quietHours.days.length === 0) {
      setValidationMessage('Choose at least one quiet-hours day.');
      return;
    }
    if (draft.quietHours.enabled && draft.quietHours.startTime === draft.quietHours.endTime) {
      setValidationMessage('Choose different start and end times.');
      return;
    }

    const next = normalizeTimeFocusPreferences(draft, timezone);
    setSaving(true);
    setError(null);
    try {
      await saveCloudPreferenceNamespace(
        TIME_FOCUS_PREFERENCES_NAMESPACE,
        next as unknown as Record<string, unknown>,
      );
      setDraft(next);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not save your time and focus settings.',
      );
    } finally {
      setSaving(false);
    }
  };

  const controlsDisabled = loading || saving;

  return (
    <div className="flex flex-col gap-5" data-testid="cloud-time-focus">
      <SectionHeading
        title="Time and focus"
        description="Optional boundaries you choose for yourself. Reminders never lock you out of AGI."
      />

      {loading ? <SectionLoading label="Loading your time and focus settings…" /> : null}
      {error ? <SectionError message={error} onRetry={() => void load()} /> : null}

      {!loading && !loadFailed ? (
        <>
          <div className="rounded-lg border border-border bg-card/40 p-5">
            <p className="text-sm font-medium text-foreground">Break reminder</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              One gentle nudge after this much visible time in AGI each day.
            </p>
            <select
              aria-label="Break reminder"
              className={`mt-3 ${CONTROL_CLASS}`}
              value={draft.breakReminderMinutes ?? ''}
              disabled={controlsDisabled}
              onChange={(event) => {
                const value = event.target.value;
                update({
                  ...draft,
                  breakReminderMinutes: value
                    ? (Number(value) as TimeFocusPreferences['breakReminderMinutes'])
                    : null,
                });
              }}
            >
              <option value="">Off</option>
              {BREAK_REMINDER_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatBreakLabel(minutes)}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card/40">
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Quiet hours</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Add light friction when you open AGI during time you set aside.
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label="Enable quiet hours"
                  checked={draft.quietHours.enabled}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    update({
                      ...draft,
                      quietHours: { ...draft.quietHours, enabled: event.target.checked },
                    })
                  }
                />
                {draft.quietHours.enabled ? 'On' : 'Off'}
              </label>
            </div>

            <fieldset
              className="flex flex-col gap-4 border-t border-border/60 p-5 disabled:opacity-50"
              disabled={!draft.quietHours.enabled || controlsDisabled}
            >
              <div>
                <legend className="text-xs font-medium text-foreground">Days</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DAYS.map((day) => {
                    const selected = draft.quietHours.days.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        aria-label={day.label}
                        aria-pressed={selected}
                        onClick={() => toggleDay(day.value)}
                        className={`h-9 w-9 rounded-full border text-xs transition-colors ${
                          selected
                            ? 'border-primary bg-primary/15 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Start
                  <input
                    type="time"
                    aria-label="Quiet hours start"
                    className={CONTROL_CLASS}
                    value={draft.quietHours.startTime}
                    onChange={(event) =>
                      update({
                        ...draft,
                        quietHours: { ...draft.quietHours, startTime: event.target.value },
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  End
                  <input
                    type="time"
                    aria-label="Quiet hours end"
                    className={CONTROL_CLASS}
                    value={draft.quietHours.endTime}
                    onChange={(event) =>
                      update({
                        ...draft,
                        quietHours: { ...draft.quietHours, endTime: event.target.value },
                      })
                    }
                  />
                </label>
              </div>

              <p className="text-xs text-muted-foreground">
                Times use {draft.quietHours.timezone}.
              </p>
            </fieldset>
          </div>

          {validationMessage ? (
            <p role="alert" className="text-xs text-destructive">
              {validationMessage}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={controlsDisabled || !dirty}
              aria-busy={saving || undefined}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {savedAt !== null && error === null ? (
              <span role="status" className="text-xs text-muted-foreground">
                Synced to your account.
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
