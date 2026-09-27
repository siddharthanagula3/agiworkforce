import { useCallback, useEffect, useState } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import {
  MANAGED_CLOUD_GITHUB_TRIGGER_EVENT_TYPES,
  MANAGED_CLOUD_GMAIL_TRIGGER_EVENT_TYPES,
  MANAGED_CLOUD_GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
  describeTriggerConditions,
  triggerConditionDraftsFrom,
  triggerConditionsFromDrafts,
  type ManagedCloudEventTrigger,
  type ManagedCloudEventTriggerCreated,
  type ManagedCloudTriggerSource,
  type TriggerConditionDraft,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_API_BASE_URL } from '../../api/cloudApi';
import {
  createTaskTrigger,
  deleteTaskTrigger,
  listTaskTriggers,
  registerTaskTriggerWatch,
  updateTaskTrigger,
} from '../../api/cloudTriggers';
import { DesktopTriggerConditionsEditor } from './DesktopTriggerConditionsEditor';

const FIELD_CLASS =
  'w-full rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-muted)] focus:border-[var(--chat-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-primary)]/20';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--chat-border)] px-3 py-2 text-sm font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] disabled:cursor-not-allowed disabled:opacity-50';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--chat-accent-primary)] px-3 py-2 text-sm font-medium text-[var(--chat-accent-primary-contrast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const LABEL_CLASS = 'mb-1.5 block text-xs font-medium text-[var(--chat-text-secondary)]';

const SOURCES: ReadonlyArray<{
  value: ManagedCloudTriggerSource;
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
    eventTypes: MANAGED_CLOUD_GITHUB_TRIGGER_EVENT_TYPES,
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
    eventTypes: MANAGED_CLOUD_GMAIL_TRIGGER_EVENT_TYPES,
    note: 'Runs once for each new email in this inbox. Use the address of the Gmail account connected in Connectors.',
  },
  {
    value: 'google_calendar',
    label: 'Google Calendar',
    accountLabel: null,
    accountPlaceholder: '',
    eventTypes: MANAGED_CLOUD_GOOGLE_CALENDAR_TRIGGER_EVENT_TYPES,
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

const SOURCE_LABELS: Record<ManagedCloudTriggerSource, string> = {
  github: 'GitHub',
  slack: 'Slack',
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  connector: 'Webhook',
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function mailboxWatchNotice(trigger: ManagedCloudEventTrigger): string | null {
  if (trigger.source !== 'gmail') return null;
  if (trigger.watchError) return trigger.watchError;
  if (trigger.verificationStatus === 'pending') {
    return 'The mailbox watch is not registered yet, so nothing fires.';
  }
  if (trigger.watchExpiresAt && Date.parse(trigger.watchExpiresAt) <= Date.now()) {
    return 'The mailbox watch lapsed, so new mail no longer starts this task.';
  }
  return null;
}

interface DesktopScheduleTriggersPanelProps {
  scheduleId: string;
  scheduleName: string;
}

export function DesktopScheduleTriggersPanel({
  scheduleId,
  scheduleName,
}: DesktopScheduleTriggersPanelProps) {
  const { confirm, dialog } = useConfirmAction();
  const [triggers, setTriggers] = useState<ManagedCloudEventTrigger[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ManagedCloudEventTriggerCreated | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [source, setSource] = useState<ManagedCloudTriggerSource>('github');
  const [account, setAccount] = useState('');
  const [eventTypes, setEventTypes] = useState('');
  const [debounceSeconds, setDebounceSeconds] = useState('0');
  const [conditions, setConditions] = useState<TriggerConditionDraft[]>([]);
  const [editing, setEditing] = useState<{
    triggerId: string;
    drafts: TriggerConditionDraft[];
  } | null>(null);

  const selected = SOURCES.find((entry) => entry.value === source) ?? SOURCES[0]!;

  const load = useCallback(async () => {
    setError(null);
    try {
      setTriggers(await listTaskTriggers(scheduleId));
    } catch (loadError) {
      setError(errorText(loadError, 'The triggers for this schedule could not be read.'));
    }
  }, [scheduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createTrigger = async () => {
    const parsed = triggerConditionsFromDrafts(conditions);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const chosenTypes = eventTypes
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    setCreated(null);
    try {
      const result = await createTaskTrigger({
        taskId: scheduleId,
        name: name.trim() || `${SOURCE_LABELS[source]} trigger`,
        source,
        eventTypes: chosenTypes.length > 0 ? chosenTypes : ['*'],
        ...(selected.accountLabel ? { sourceAccount: account.trim() } : {}),
        debounceSeconds: Number(debounceSeconds || '0'),
        conditions: parsed.conditions,
      });
      setCreated(result);
      setName('');
      setAccount('');
      setEventTypes('');
      setDebounceSeconds('0');
      setConditions([]);
      setAdding(false);
      await load();
    } catch (createError) {
      setError(errorText(createError, 'That trigger could not be added.'));
    } finally {
      setSaving(false);
    }
  };

  const setEnabled = async (trigger: ManagedCloudEventTrigger, isEnabled: boolean) => {
    setBusyId(trigger.id);
    setError(null);
    try {
      await updateTaskTrigger(trigger.id, { isEnabled });
      await load();
    } catch (toggleError) {
      setError(errorText(toggleError, 'That trigger could not be changed.'));
    } finally {
      setBusyId(null);
    }
  };

  const saveConditions = async (trigger: ManagedCloudEventTrigger) => {
    if (!editing) return;
    const parsed = triggerConditionsFromDrafts(editing.drafts);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusyId(trigger.id);
    setError(null);
    try {
      await updateTaskTrigger(trigger.id, { conditions: parsed.conditions });
      setEditing(null);
      await load();
    } catch (saveError) {
      setError(errorText(saveError, 'The conditions for that trigger could not be saved.'));
    } finally {
      setBusyId(null);
    }
  };

  const retryWatch = async (trigger: ManagedCloudEventTrigger) => {
    setBusyId(trigger.id);
    setError(null);
    try {
      await registerTaskTriggerWatch(trigger.id);
      await load();
    } catch (watchError) {
      setError(errorText(watchError, 'The mailbox watch could not be registered.'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = (trigger: ManagedCloudEventTrigger) =>
    confirm({
      title: `Delete the ${SOURCE_LABELS[trigger.source]} trigger “${trigger.name}”?`,
      description:
        `${scheduleName} stops running when these events arrive, and the delivery history for ` +
        `this trigger is deleted with it. A webhook trigger's URL and signing secret stop ` +
        `working and a new trigger gets new ones. This cannot be undone.`,
      confirmLabel: 'Delete trigger',
      destructive: true,
      onConfirm: async () => {
        setError(null);
        try {
          await deleteTaskTrigger(trigger.id);
          await load();
        } catch (deleteError) {
          setError(errorText(deleteError, 'That trigger could not be deleted.'));
        }
      },
    });

  return (
    <div className="space-y-3">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--chat-text-muted)]">
          An event from one of these sources starts this task, with the event attached to the run.
        </p>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          className={SECONDARY_BUTTON}
          aria-expanded={adding}
        >
          {adding ? 'Cancel' : 'Add trigger'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
          {error}
        </p>
      ) : null}

      {created ? (
        <div className="space-y-1 rounded-lg border border-[var(--chat-border)] p-3 text-xs">
          <p className="font-medium text-[var(--chat-text-primary)]">
            Shown once. Copy what you need now.
          </p>
          <p className="break-all text-[var(--chat-text-secondary)]">
            Endpoint: {`${CLOUD_API_BASE_URL}${created.webhookPath}`}
          </p>
          {created.signingSecret ? (
            <p className="break-all font-mono text-[var(--chat-text-secondary)]">
              Signing secret: {created.signingSecret}
            </p>
          ) : null}
          {created.verificationCode ? (
            <p className="break-all font-mono text-[var(--chat-text-secondary)]">
              Post this code in the workspace to verify it: {created.verificationCode}
            </p>
          ) : null}
        </div>
      ) : null}

      {adding ? (
        <form
          className="grid gap-3 rounded-lg border border-[var(--chat-border)] p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void createTrigger();
          }}
        >
          <label>
            <span className={LABEL_CLASS}>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Failed CI on main…"
              maxLength={200}
              className={FIELD_CLASS}
            />
          </label>
          <label>
            <span className={LABEL_CLASS}>Source</span>
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value as ManagedCloudTriggerSource);
                setConditions([]);
              }}
              className={FIELD_CLASS}
            >
              {SOURCES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[var(--chat-text-muted)]">
              {selected.note}
            </span>
          </label>
          {selected.accountLabel ? (
            <label>
              <span className={LABEL_CLASS}>{selected.accountLabel}</span>
              <input
                value={account}
                onChange={(event) => setAccount(event.target.value)}
                placeholder={selected.accountPlaceholder}
                spellCheck={false}
                className={FIELD_CLASS}
              />
            </label>
          ) : null}
          <label>
            <span className={LABEL_CLASS}>Event types</span>
            <input
              value={eventTypes}
              onChange={(event) => setEventTypes(event.target.value)}
              placeholder={
                selected.eventTypes ? selected.eventTypes.join(', ') : '* for everything'
              }
              spellCheck={false}
              className={FIELD_CLASS}
            />
            <span className="mt-1 block text-xs text-[var(--chat-text-muted)]">
              Comma separated. Leave empty to listen to everything this source sends.
              {selected.eventTypes ? ` Available: ${selected.eventTypes.join(', ')}.` : ''}
            </span>
          </label>
          <label>
            <span className={LABEL_CLASS}>Ignore repeats for (seconds)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={86400}
              step={1}
              value={debounceSeconds}
              onChange={(event) => setDebounceSeconds(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <div className="sm:col-span-2">
            <DesktopTriggerConditionsEditor
              source={source}
              drafts={conditions}
              onChange={setConditions}
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <button type="submit" disabled={saving} aria-busy={saving} className={PRIMARY_BUTTON}>
              {saving ? <Spinner size="sm" /> : null}
              {saving ? 'Adding…' : 'Add trigger'}
            </button>
          </div>
        </form>
      ) : null}

      {triggers === null && !error ? (
        <p className="flex items-center gap-2 text-xs text-[var(--chat-text-muted)]">
          <Spinner size="sm" />
          Reading triggers…
        </p>
      ) : triggers !== null && triggers.length === 0 ? (
        <p className="text-xs text-[var(--chat-text-muted)]">
          No trigger yet. This task runs only on its schedule.
        </p>
      ) : triggers !== null ? (
        <ul className="space-y-2">
          {triggers.map((trigger) => {
            const watchNotice = mailboxWatchNotice(trigger);
            const busy = busyId === trigger.id;
            return (
              <li
                key={trigger.id}
                className="space-y-2 rounded-lg border border-[var(--chat-border)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--chat-text-primary)]">
                      {trigger.name}
                    </p>
                    <p className="text-xs text-[var(--chat-text-muted)] [overflow-wrap:anywhere]">
                      {SOURCE_LABELS[trigger.source]}
                      {trigger.sourceAccount ? ` · ${trigger.sourceAccount}` : ''} ·{' '}
                      {trigger.eventTypes.join(', ')}
                      {trigger.debounceSeconds > 0
                        ? ` · repeats ignored for ${trigger.debounceSeconds}s`
                        : ''}
                    </p>
                    {trigger.conditions.length > 0 ? (
                      <p className="text-xs text-[var(--chat-text-muted)] [overflow-wrap:anywhere]">
                        Only when {describeTriggerConditions(trigger.conditions, trigger.source)}
                      </p>
                    ) : null}
                    {watchNotice ? (
                      <p
                        className={
                          trigger.watchError
                            ? 'text-xs text-[var(--chat-destructive-text)]'
                            : 'text-xs text-[var(--warning-text)]'
                        }
                      >
                        {watchNotice}
                      </p>
                    ) : trigger.verificationStatus === 'pending' ? (
                      <p className="text-xs text-[var(--warning-text)]">
                        Waiting until this account is verified; nothing fires until then.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {watchNotice && trigger.isEnabled ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-busy={busy}
                        onClick={() => void retryWatch(trigger)}
                        className={SECONDARY_BUTTON}
                      >
                        {busy ? <Spinner size="sm" /> : null}
                        Try again
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={editing?.triggerId === trigger.id}
                      onClick={() =>
                        setEditing((current) =>
                          current?.triggerId === trigger.id
                            ? null
                            : {
                                triggerId: trigger.id,
                                drafts: triggerConditionDraftsFrom(
                                  trigger.conditions,
                                  trigger.source,
                                ),
                              },
                        )
                      }
                      className={SECONDARY_BUTTON}
                    >
                      Conditions
                    </button>
                    <label className="flex items-center gap-2 rounded-lg border border-[var(--chat-border)] px-3 py-2">
                      <input
                        type="checkbox"
                        checked={trigger.isEnabled}
                        disabled={busy}
                        onChange={(event) => void setEnabled(trigger, event.target.checked)}
                        className="accent-[var(--chat-accent-primary)]"
                      />
                      <span className="text-sm text-[var(--chat-text-secondary)]">Enabled</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => remove(trigger)}
                      className={SECONDARY_BUTTON}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {editing?.triggerId === trigger.id ? (
                  <form
                    className="space-y-3 border-t border-[var(--chat-border)] pt-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveConditions(trigger);
                    }}
                  >
                    <DesktopTriggerConditionsEditor
                      source={trigger.source}
                      drafts={editing.drafts}
                      onChange={(drafts) => setEditing({ triggerId: trigger.id, drafts })}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className={SECONDARY_BUTTON}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        aria-busy={busy}
                        className={PRIMARY_BUTTON}
                      >
                        {busy ? <Spinner size="sm" /> : null}
                        Save conditions
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
