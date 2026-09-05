'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Switch } from '@agiworkforce/ui';
import {
  BREAK_REMINDER_MINUTES,
  TIME_FOCUS_PREFERENCES_NAMESPACE,
  defaultTimeFocusPreferences,
  normalizeTimeFocusPreferences,
  type TimeFocusPreferences,
  type TimeFocusWeekday,
} from '@agiworkforce/types';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { toUserMessage } from '@/lib/user-error-message';

interface StatusMessage {
  text: string;
  prefix: 'Load failed' | 'Save failed' | null;
}

const DAYS: ReadonlyArray<{ value: TimeFocusWeekday; label: string; shortLabel: string }> = [
  { value: 0, label: 'Sunday', shortLabel: 'S' },
  { value: 1, label: 'Monday', shortLabel: 'M' },
  { value: 2, label: 'Tuesday', shortLabel: 'T' },
  { value: 3, label: 'Wednesday', shortLabel: 'W' },
  { value: 4, label: 'Thursday', shortLabel: 'T' },
  { value: 5, label: 'Friday', shortLabel: 'F' },
  { value: 6, label: 'Saturday', shortLabel: 'S' },
];

function browserTimezone(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function TimeFocusSection() {
  const timezone = useMemo(() => browserTimezone(), []);
  const defaults = useMemo(() => defaultTimeFocusPreferences(timezone), [timezone]);
  const [draft, setDraft] = useState<TimeFocusPreferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<TimeFocusPreferences>(TIME_FOCUS_PREFERENCES_NAMESPACE, defaults)
      .then((value) => {
        if (cancelled) return;
        setDraft(normalizeTimeFocusPreferences(value, timezone));
        setMessage(null);
        setDirty(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage({
            text: toUserMessage(error, 'Failed to load time and focus'),
            prefix: 'Load failed',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [defaults, timezone]);

  function update(next: TimeFocusPreferences) {
    setDraft(next);
    setDirty(true);
    setMessage(null);
  }

  function toggleDay(day: TimeFocusWeekday) {
    const selected = draft.quietHours.days.includes(day);
    const days = selected
      ? draft.quietHours.days.filter((value) => value !== day)
      : [...draft.quietHours.days, day].sort((a, b) => a - b);
    update({ ...draft, quietHours: { ...draft.quietHours, days } });
  }

  async function save() {
    if (draft.quietHours.enabled && draft.quietHours.days.length === 0) {
      setMessage({ text: 'Choose at least one quiet-hours day.', prefix: null });
      return;
    }
    if (draft.quietHours.enabled && draft.quietHours.startTime === draft.quietHours.endTime) {
      setMessage({ text: 'Choose different start and end times.', prefix: null });
      return;
    }

    const next = normalizeTimeFocusPreferences(draft, timezone);
    setSaving(true);
    setMessage(null);
    try {
      await savePreferenceNamespace(TIME_FOCUS_PREFERENCES_NAMESPACE, next);
      setDraft(next);
      setDirty(false);
    } catch (error) {
      setMessage({
        text: toUserMessage(error, 'Failed to save time and focus'),
        prefix: 'Save failed',
      });
    } finally {
      setSaving(false);
    }
  }

  const status = loading
    ? 'Loading account settings...'
    : saving
      ? 'Saving...'
      : message
        ? `${message.prefix ? `${message.prefix}: ` : ''}${message.text}`
        : dirty
          ? 'Unsaved changes'
          : 'Saved';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Time and focus
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Optional boundaries you choose for yourself. Reminders never lock you out of AGI.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }} role="status">
          {status}
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 0',
          borderBottom: '1px solid var(--settings-border)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 14, color: 'var(--text-1)' }}>Break reminder</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Get one gentle nudge after this much visible time in AGI each day.
          </div>
        </div>
        <select
          aria-label="Break reminder"
          value={draft.breakReminderMinutes ?? ''}
          disabled={loading || saving}
          onChange={(event) => {
            const value = event.target.value;
            update({
              ...draft,
              breakReminderMinutes: value
                ? (Number(value) as TimeFocusPreferences['breakReminderMinutes'])
                : null,
            });
          }}
          style={{
            height: 32,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--settings-border)',
            background: 'var(--bg-base)',
            color: 'var(--text-1)',
            fontSize: 13,
            padding: '0 8px',
          }}
        >
          <option value="">Off</option>
          {BREAK_REMINDER_MINUTES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes < 60
                ? `${minutes} minutes`
                : `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`}
            </option>
          ))}
        </select>
      </div>

      <section aria-labelledby="quiet-hours-heading">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 0',
            borderBottom: '1px solid var(--settings-border)',
          }}
        >
          <div>
            <div id="quiet-hours-heading" style={{ fontSize: 14, color: 'var(--text-1)' }}>
              Quiet hours
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Add light friction when you open AGI during time you set aside.
            </div>
          </div>
          <Switch
            aria-label="Enable quiet hours"
            checked={draft.quietHours.enabled}
            disabled={loading || saving}
            onCheckedChange={(enabled) =>
              update({ ...draft, quietHours: { ...draft.quietHours, enabled } })
            }
          />
        </div>

        <div
          aria-disabled={!draft.quietHours.enabled}
          style={{
            borderBottom: '1px solid var(--settings-border)',
            display: 'grid',
            gap: 16,
            padding: '14px 0',
            opacity: draft.quietHours.enabled ? 1 : 0.5,
          }}
        >
          <fieldset
            disabled={!draft.quietHours.enabled || loading || saving}
            style={{ border: 0, margin: 0, padding: 0 }}
          >
            <legend
              style={{ marginBottom: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}
            >
              Days
            </legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DAYS.map((day) => {
                const selected = draft.quietHours.days.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-label={day.label}
                    aria-pressed={selected}
                    onClick={() => toggleDay(day.value)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      border: '1px solid var(--settings-border)',
                      background: selected ? 'hsl(var(--accent))' : 'var(--bg-base)',
                      color: selected ? 'white' : 'var(--text-2)',
                      cursor: 'pointer',
                    }}
                  >
                    {day.shortLabel}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 180px))', gap: 12 }}
          >
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
              Start
              <input
                type="time"
                aria-label="Quiet hours start"
                value={draft.quietHours.startTime}
                disabled={!draft.quietHours.enabled || loading || saving}
                onChange={(event) =>
                  update({
                    ...draft,
                    quietHours: { ...draft.quietHours, startTime: event.target.value },
                  })
                }
                style={{
                  height: 38,
                  borderRadius: 8,
                  border: '1px solid var(--settings-border)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-1)',
                  padding: '0 10px',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-2)' }}>
              End
              <input
                type="time"
                aria-label="Quiet hours end"
                value={draft.quietHours.endTime}
                disabled={!draft.quietHours.enabled || loading || saving}
                onChange={(event) =>
                  update({
                    ...draft,
                    quietHours: { ...draft.quietHours, endTime: event.target.value },
                  })
                }
                style={{
                  height: 38,
                  borderRadius: 8,
                  border: '1px solid var(--settings-border)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-1)',
                  padding: '0 10px',
                }}
              />
            </label>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
            Times use {draft.quietHours.timezone}. These reminders currently apply on the Website.
          </p>
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="button"
          disabled={loading || saving || !dirty}
          onClick={() => void save()}
          aria-label="Save time and focus settings"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}
