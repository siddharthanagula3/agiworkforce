'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Label, Spinner, Switch, useConfirm } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import {
  GITHUB_TRIGGER_EVENT_TYPES,
  GMAIL_TRIGGER_EVENT_TYPES,
  GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
  type EventTrigger,
  type TriggerSource,
} from '@/lib/triggers/trigger-types';

interface ScheduleTriggersPanelProps {
  scheduleId: string;
  scheduleName: string;
}

interface CreatedTriggerSecrets {
  triggerId: string;
  verificationCode: string | null;
  signingSecret: string | null;
  webhookPath: string;
}

const SOURCES: ReadonlyArray<{
  value: TriggerSource;
  label: string;
  accountLabel: string | null;
  accountPlaceholder: string;
  eventTypes: readonly string[] | null;
  note: string;
}> = [
  {
    value: 'github',
    label: 'GitHub',
    accountLabel: 'Repository',
    accountPlaceholder: 'owner/name',
    eventTypes: GITHUB_TRIGGER_EVENT_TYPES,
    note: 'Fires for repositories your GitHub App installation covers.',
  },
  {
    value: 'slack',
    label: 'Slack',
    accountLabel: 'Workspace (team) id',
    accountPlaceholder: 'T0123ABCD',
    eventTypes: null,
    note: 'Post the verification code shown after saving in that workspace to prove it is yours.',
  },
  {
    value: 'gmail',
    label: 'Gmail',
    accountLabel: 'Mailbox address',
    accountPlaceholder: 'you@example.com',
    eventTypes: GMAIL_TRIGGER_EVENT_TYPES,
    note: 'Fires when the mailbox changes. Waits until the mailbox watch is registered for it.',
  },
  {
    value: 'google_calendar',
    label: 'Google Calendar',
    accountLabel: null,
    accountPlaceholder: '',
    eventTypes: GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
    note: 'Addressed by its own channel. Waits until the calendar watch is registered for it.',
  },
  {
    value: 'connector',
    label: 'Anything else (signed webhook)',
    accountLabel: null,
    accountPlaceholder: '',
    eventTypes: null,
    note: 'You get a URL and a signing secret to post events to.',
  },
];

const SOURCE_LABELS: Record<TriggerSource, string> = {
  github: 'GitHub',
  slack: 'Slack',
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  connector: 'Webhook',
};

const FIELD_CLASS = 'text-xs text-muted-foreground';

export default function ScheduleTriggersPanel({
  scheduleId,
  scheduleName,
}: ScheduleTriggersPanelProps) {
  const [opened, setOpened] = useState(false);
  const [triggers, setTriggers] = useState<EventTrigger[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<CreatedTriggerSecrets | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState<TriggerSource>('github');
  const [account, setAccount] = useState('');
  const [eventTypes, setEventTypes] = useState('');
  const [debounceSeconds, setDebounceSeconds] = useState('0');
  const { confirm, dialog } = useConfirm();

  const selected = SOURCES.find((entry) => entry.value === source)!;

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/triggers?taskId=${encodeURIComponent(scheduleId)}`, {
        cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      setTriggers((body as { triggers: EventTrigger[] }).triggers);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'Could not read the triggers for this schedule.'));
    }
  }, [scheduleId]);

  useEffect(() => {
    if (opened) void load();
  }, [opened, load]);

  async function createTrigger() {
    setSaving(true);
    setError(null);
    setSecrets(null);
    const chosenTypes = eventTypes
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean);
    try {
      const response = await fetch('/api/triggers', {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          taskId: scheduleId,
          name: name.trim() || `${SOURCE_LABELS[source]} trigger`,
          source,
          eventTypes: chosenTypes.length > 0 ? chosenTypes : ['*'],
          ...(selected.accountLabel ? { sourceAccount: account.trim() } : {}),
          debounceSeconds: Number(debounceSeconds || '0'),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      const created = body as {
        trigger: EventTrigger;
        verificationCode: string | null;
        signingSecret: string | null;
        webhookPath: string;
      };
      setSecrets({
        triggerId: created.trigger.id,
        verificationCode: created.verificationCode,
        signingSecret: created.signingSecret,
        webhookPath: created.webhookPath,
      });
      setName('');
      setAccount('');
      setEventTypes('');
      setAdding(false);
      await load();
    } catch (createError) {
      setError(toUserMessage(createError, 'Could not add that trigger.'));
    } finally {
      setSaving(false);
    }
  }

  async function setEnabled(trigger: EventTrigger, isEnabled: boolean) {
    setError(null);
    try {
      const response = await fetch(`/api/triggers/${trigger.id}`, {
        method: 'PATCH',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ isEnabled }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      await load();
    } catch (toggleError) {
      setError(toUserMessage(toggleError, 'Could not change that trigger.'));
    }
  }

  async function remove(trigger: EventTrigger) {
    const confirmed = await confirm({
      title: `Delete the ${SOURCE_LABELS[trigger.source]} trigger “${trigger.name}”?`,
      description:
        `${scheduleName} stops running when these events arrive, and the delivery history for this ` +
        `trigger is deleted with it. A connector trigger's URL and signing secret stop working and ` +
        `a new trigger gets new ones. This cannot be undone.`,
      confirmText: 'Delete trigger',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setError(null);
    try {
      const response = await fetch(`/api/triggers/${trigger.id}`, {
        method: 'DELETE',
        headers: await addCsrfHeaders({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
      }
      await load();
    } catch (deleteError) {
      setError(toUserMessage(deleteError, 'Could not delete that trigger.'));
    }
  }

  return (
    <details
      className="mt-6 border-t border-border/70 pt-5"
      onToggle={(event) => setOpened((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Triggers for {scheduleName}
      </summary>
      {dialog}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          An event from one of these sources starts this task, with the event attached to the run.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? 'Cancel' : 'Add trigger'}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {secrets ? (
        <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <p className="font-medium text-foreground">Shown once. Copy what you need now.</p>
          <p className="break-all">Endpoint: {secrets.webhookPath}</p>
          {secrets.signingSecret ? (
            <p className="break-all font-mono">Signing secret: {secrets.signingSecret}</p>
          ) : null}
          {secrets.verificationCode ? (
            <p className="break-all font-mono">
              Post this code in the workspace to verify it: {secrets.verificationCode}
            </p>
          ) : null}
        </div>
      ) : null}

      {adding ? (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void createTrigger();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`trigger-name-${scheduleId}`}>Name</Label>
            <Input
              id={`trigger-name-${scheduleId}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Failed CI on main…"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`trigger-source-${scheduleId}`}>Source</Label>
            <select
              id={`trigger-source-${scheduleId}`}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={source}
              onChange={(event) => setSource(event.target.value as TriggerSource)}
            >
              {SOURCES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <p className={FIELD_CLASS}>{selected.note}</p>
          </div>
          {selected.accountLabel ? (
            <div className="space-y-1">
              <Label htmlFor={`trigger-account-${scheduleId}`}>{selected.accountLabel}</Label>
              <Input
                id={`trigger-account-${scheduleId}`}
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder={selected.accountPlaceholder}
                spellCheck={false}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor={`trigger-events-${scheduleId}`}>Event types</Label>
            <Input
              id={`trigger-events-${scheduleId}`}
              value={eventTypes}
              onChange={(event) => setEventTypes(event.target.value)}
              placeholder={
                selected.eventTypes ? selected.eventTypes.join(', ') : '* for everything'
              }
              spellCheck={false}
            />
            <p className={FIELD_CLASS}>
              Comma separated. Leave empty to listen to everything this source sends.
              {selected.eventTypes ? ` Available: ${selected.eventTypes.join(', ')}.` : ''}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`trigger-debounce-${scheduleId}`}>Ignore repeats for (seconds)</Label>
            <Input
              id={`trigger-debounce-${scheduleId}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={86400}
              step={1}
              value={debounceSeconds}
              onChange={(event) => setDebounceSeconds(event.target.value)}
            />
          </div>
          <div className="flex items-end sm:col-span-2 sm:justify-end">
            <Button type="submit" size="sm" disabled={saving} aria-busy={saving}>
              {saving ? 'Adding…' : 'Add trigger'}
            </Button>
          </div>
        </form>
      ) : null}

      {triggers === null ? (
        <div className="mt-4 flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading triggers…</span>
        </div>
      ) : triggers.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No trigger yet. This task runs only on its schedule.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {triggers.map((trigger) => (
            <li
              key={trigger.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{trigger.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {SOURCE_LABELS[trigger.source]}
                  {trigger.sourceAccount ? ` · ${trigger.sourceAccount}` : ''} ·{' '}
                  {trigger.eventTypes.join(', ')}
                  {trigger.debounceSeconds > 0
                    ? ` · repeats ignored for ${trigger.debounceSeconds}s`
                    : ''}
                </p>
                {trigger.verificationStatus === 'pending' ? (
                  <p className="text-xs text-warning-text">
                    Waiting until this account is verified; nothing fires until then.
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={trigger.isEnabled}
                  onCheckedChange={(checked) => void setEnabled(trigger, checked)}
                  aria-label={`${trigger.isEnabled ? 'Disable' : 'Enable'} ${trigger.name}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void remove(trigger)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
