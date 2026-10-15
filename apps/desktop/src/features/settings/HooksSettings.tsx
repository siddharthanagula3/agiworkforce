import { useCallback, useEffect, useId, useState } from 'react';
import { Download, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useConfirmAction } from '@agiworkforce/ui';
import { hooks } from '@agiworkforce/desktop-command-client';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Spinner } from '@/ui/Spinner';
import { Switch } from '@/ui/Switch';
import { Textarea } from '@/ui/Textarea';
import { isTauri } from '@/lib/tauri-mock';

type Hook = hooks.Hook;
type HookEdit = hooks.HookEdit;
type GuardShape = Pick<Hook, 'name' | 'enabled' | 'events'>;
type HookEventType = hooks.HookEventType;
type HookStats = hooks.HookStats;
type WaitingHooks = hooks.WaitingHooks;
type ConfirmAction = ReturnType<typeof useConfirmAction>['confirm'];

const HOOKS_FILE_FILTERS = [{ name: 'YAML', extensions: ['yaml', 'yml'] }];

const DEFAULT_TIMEOUT_SECS = 30;
const DEFAULT_PRIORITY = 50;

interface HookDraft {
  name: string;
  events: HookEventType[];
  command: string;
  timeoutSecs: string;
  workingDir: string;
  continueOnError: boolean;
}

const EMPTY_DRAFT: HookDraft = {
  name: '',
  events: [],
  command: '',
  timeoutSecs: String(DEFAULT_TIMEOUT_SECS),
  workingDir: '',
  continueOnError: false,
};

function draftFrom(hook: Hook): HookDraft {
  return {
    name: hook.name,
    events: hook.events,
    command: hook.command,
    timeoutSecs: String(hook.timeout_secs),
    workingDir: hook.working_dir ?? '',
    continueOnError: hook.continue_on_error,
  };
}

export function draftProblem(draft: HookDraft, takenNames: readonly string[]): string | null {
  if (!draft.name.trim()) return 'Give the hook a name.';
  if (takenNames.includes(draft.name.trim())) return 'Another hook already uses this name.';
  if (draft.events.length === 0) return 'Choose at least one event.';
  if (!draft.command.trim()) return 'Enter the command to run.';
  const timeout = Number(draft.timeoutSecs);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3600) {
    return 'Timeout must be a whole number of seconds from 1 to 3600.';
  }
  return null;
}

function hookFrom(draft: HookDraft, original: Hook | null): HookEdit {
  const workingDir = draft.workingDir.trim();
  return {
    name: draft.name.trim(),
    events: draft.events,
    priority: original?.priority ?? DEFAULT_PRIORITY,
    command: draft.command,
    enabled: original?.enabled ?? true,
    timeout_secs: Number(draft.timeoutSecs),
    ...(workingDir ? { working_dir: workingDir } : {}),
    continue_on_error: draft.continueOnError,
  };
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

const GUARDED: Partial<Record<HookEventType, string>> = {
  PreToolUse: 'tool calls',
  UserPromptSubmit: 'messages',
};

function guardedActions(hook: Pick<Hook, 'events'>): string[] {
  return hook.events.flatMap((event) => GUARDED[event] ?? []);
}

export function isGuard(hook: GuardShape): boolean {
  return hook.enabled && guardedActions(hook).length > 0;
}

export function environmentSummary(hook: Pick<Hook, 'env'>): string | null {
  if (hook.env.length === 0) return null;
  return hook.env
    .map(({ name, shown }) => (shown === null ? `${name} (value not shown)` : `${name}=${shown}`))
    .join('; ');
}

function keptEnvironmentNote(count: number): string {
  return count === 1
    ? 'Its 1 environment variable stays as it is. To change it, edit hooks.yaml and reload.'
    : `Its ${count} environment variables stay as they are. To change them, edit hooks.yaml and reload.`;
}

export function guardsLeftOff(armed: readonly Hook[], next: readonly GuardShape[]): Hook[] {
  return armed.filter(
    (hook) => isGuard(hook) && !next.some((after) => after.name === hook.name && isGuard(after)),
  );
}

function disarmingConsequence(hooks: readonly Hook[]): string {
  const actions = [...new Set(hooks.flatMap(guardedActions))].join(' and ');
  const names = hooks.map((hook) => `"${hook.name}"`).join(', ');
  return `${names} ${hooks.length === 1 ? 'stops' : 'stop'} checking ${actions} before they go ahead, so nothing ${hooks.length === 1 ? 'it refuses' : 'they refuse'} is refused until you add or turn ${hooks.length === 1 ? 'it' : 'them'} on again. A system dialog asks you once more, and nothing changes unless you agree there.`;
}

export function guardFailureNote(hook: Hook): string | null {
  if (guardedActions(hook).length === 0) return null;
  return hook.continue_on_error
    ? 'Blocks the tool or message if it cannot start, runs out of time or is killed. An error exit other than 2 is let through.'
    : 'Blocks the tool or message if it cannot start, runs out of time, is killed or exits with an error.';
}

export function waitingSummary(waiting: WaitingHooks, armedCount: number): string {
  const meanwhile = waiting.holdsTools
    ? 'tools and messages are held'
    : armedCount > 0
      ? 'the hooks you approved before keep running'
      : null;
  if (waiting.problem) {
    return `hooks.yaml could not be read, so nothing in it runs${meanwhile ? `, and ${meanwhile}` : ''}. Fix the file, then choose Reload from hooks.yaml.`;
  }
  if (waiting.hooks.length === 0) {
    return `hooks.yaml no longer lists any hooks${meanwhile ? `, and ${meanwhile} until you approve the change` : ''}.`;
  }
  return `hooks.yaml is new or was changed outside this page, so none of its ${countOf(waiting.hooks.length, 'hook')} runs${meanwhile ? `, and ${meanwhile} until you approve` : ''}. Check the commands below. Approving shows them once more in a system dialog, and you are not asked again until the file changes.`;
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function runSummary(stats: HookStats | null | undefined): {
  text: string;
  failures: string | null;
} {
  if (!stats || stats.totalRuns === 0) {
    return { text: 'Has not run since the app started.', failures: null };
  }
  const last = stats.lastExecution
    ? ` Last run ${new Date(stats.lastExecution).toLocaleString()}.`
    : '';
  return {
    text: `Ran ${countOf(stats.totalRuns, 'time')} since the app started.${last}`,
    failures: stats.failureCount > 0 ? `${countOf(stats.failureCount, 'run')} failed.` : null,
  };
}

function HookEditor({
  eventTypes,
  initial,
  original,
  takenNames,
  onCancel,
  onSaved,
  confirm,
}: {
  eventTypes: HookEventType[];
  initial: HookDraft;
  original: Hook | null;
  takenNames: readonly string[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  confirm: ConfirmAction;
}) {
  const baseId = useId();
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = draftProblem(draft, takenNames);

  const write = async (hook: HookEdit) => {
    setSaving(true);
    setError(null);
    try {
      if (original) await hooks.hooksUpdate(hook);
      else await hooks.hooksAdd(hook);
      await onSaved();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSubmitted(true);
    if (problem) return;
    const hook = hookFrom(draft, original);
    const leftOff = original ? guardsLeftOff([original], [hook]) : [];
    if (leftOff.length === 0) {
      await write(hook);
      return;
    }
    confirm({
      title: `Stop "${hook.name}" from guarding?`,
      description: `With these events it no longer runs before a tool or a message. ${disarmingConsequence(leftOff)}`,
      confirmLabel: 'Save and stop guarding',
      destructive: true,
      onConfirm: () => write(hook),
    });
  };

  return (
    <form
      noValidate
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={saving} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${baseId}-name`} className="text-sm font-medium text-foreground">
            Name
          </label>
          <Input
            id={`${baseId}-name`}
            value={draft.name}
            readOnly={original !== null}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Runs on</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {eventTypes.map((eventType) => (
              <label key={eventType} className="flex items-center gap-1.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={draft.events.includes(eventType)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      events: event.target.checked
                        ? [...draft.events, eventType]
                        : draft.events.filter((entry) => entry !== eventType),
                    })
                  }
                />
                {eventType}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${baseId}-command`} className="text-sm font-medium text-foreground">
            Command
          </label>
          <Textarea
            id={`${baseId}-command`}
            className="font-mono text-sm"
            rows={3}
            spellCheck={false}
            value={draft.command}
            aria-describedby={`${baseId}-command-hint`}
            onChange={(event) => setDraft({ ...draft, command: event.target.value })}
          />
          <p id={`${baseId}-command-hint`} className="text-sm text-muted-foreground">
            Runs in a shell with your user rights each time a chosen event fires. The event arrives
            as JSON on standard input, and also in HOOK_EVENT_JSON when it is under 16 KB. On
            PreToolUse and UserPromptSubmit, exit code 2 blocks the tool or the message and the
            first line of standard error is given as the reason.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${baseId}-timeout`} className="text-sm font-medium text-foreground">
              Timeout in seconds
            </label>
            <Input
              id={`${baseId}-timeout`}
              type="number"
              inputMode="numeric"
              min={1}
              max={3600}
              step={1}
              value={draft.timeoutSecs}
              onChange={(event) => setDraft({ ...draft, timeoutSecs: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${baseId}-cwd`} className="text-sm font-medium text-foreground">
              Working folder (optional)
            </label>
            <Input
              id={`${baseId}-cwd`}
              value={draft.workingDir}
              onChange={(event) => setDraft({ ...draft, workingDir: event.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={draft.continueOnError}
              aria-describedby={`${baseId}-keep-going-hint`}
              onChange={(event) => setDraft({ ...draft, continueOnError: event.target.checked })}
            />
            Keep going when this hook exits with an error
          </label>
          <p id={`${baseId}-keep-going-hint`} className="text-sm text-muted-foreground">
            {draft.continueOnError
              ? 'Ticked: an error exit is logged and the tool or message goes ahead.'
              : 'Unticked: an error exit blocks the tool or message this hook runs before. On other events it skips the hooks after this one.'}{' '}
            Exit code 2 blocks either way, and so does a PreToolUse or UserPromptSubmit hook that
            cannot start, runs out of time or is killed.
          </p>
        </div>

        {original && original.env.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {keptEnvironmentNote(original.env.length)}
          </p>
        ) : null}
      </fieldset>

      {submitted && problem ? (
        <p role="alert" className="text-sm text-danger-text">
          {problem}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      {saving ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Answer the system dialog to save it.
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {original ? 'Save hook' : 'Add hook'}
        </Button>
      </div>
    </form>
  );
}

export function HooksSettings({ isTauriHost = isTauri }: { isTauriHost?: boolean } = {}) {
  const [hookList, setHookList] = useState<Hook[]>([]);
  const [eventTypes, setEventTypes] = useState<HookEventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Hook | 'new' | null>(null);
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, HookStats | null>>({});
  const [busy, setBusy] = useState<'import' | 'export' | 'reload' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<WaitingHooks | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const refresh = useCallback(async () => {
    const [listed, types, unapproved] = await Promise.all([
      hooks.hooksList(),
      hooks.hooksGetEventTypes(),
      hooks.hooksWaitingForApproval(),
    ]);
    const runs = await Promise.all(listed.map((hook) => hooks.hooksGetStats(hook.name)));
    setHookList(listed);
    setEventTypes(types);
    setWaiting(unapproved);
    setStats(Object.fromEntries(listed.map((hook, index) => [hook.name, runs[index] ?? null])));
  }, []);

  useEffect(() => {
    if (!isTauriHost) return;
    let cancelled = false;
    void (async () => {
      try {
        await hooks.hooksInitialize();
        if (!cancelled) await refresh();
      } catch (cause) {
        if (!cancelled) setError(errorText(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTauriHost, refresh]);

  const setEnabled = async (hook: Hook, enabled: boolean) => {
    setTogglingName(hook.name);
    setError(null);
    try {
      await hooks.hooksToggle(hook.name, enabled);
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setTogglingName(null);
    }
  };

  const toggle = (hook: Hook, enabled: boolean) => {
    if (enabled || !isGuard(hook)) {
      void setEnabled(hook, enabled);
      return;
    }
    confirm({
      title: `Turn off the guard "${hook.name}"?`,
      description: disarmingConsequence([hook]),
      confirmLabel: 'Turn off guard',
      destructive: true,
      onConfirm: () => setEnabled(hook, false),
    });
  };

  const remove = (hook: Hook) =>
    confirm({
      title: `Remove the hook "${hook.name}"?`,
      description: isGuard(hook)
        ? `It is deleted from hooks.yaml. ${disarmingConsequence([hook])}`
        : `Its command stops running on ${hook.events.join(', ')} and is deleted from hooks.yaml. To use it again you have to add it again.`,
      confirmLabel: 'Remove hook',
      destructive: true,
      onConfirm: async () => {
        try {
          await hooks.hooksRemove(hook.name);
          await refresh();
        } catch (cause) {
          setError(errorText(cause));
        }
      },
    });

  const runFileAction = async (
    action: 'import' | 'export' | 'reload',
    work: () => Promise<string | null>,
  ) => {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const reload = () =>
    runFileAction('reload', async () => {
      await hooks.hooksReload();
      await refresh();
      return 'Reloaded hooks.yaml.';
    });

  const approveShown = () =>
    runFileAction('reload', async () => {
      await hooks.hooksReload();
      await refresh();
      return 'Approved. These hooks now run.';
    });

  const approve = () => {
    const leftOff = guardsLeftOff(hookList, waiting?.hooks ?? []);
    if (leftOff.length === 0) {
      void approveShown();
      return;
    }
    confirm({
      title: 'Approve a file that stops a guard?',
      description: `hooks.yaml no longer lists ${leftOff.length === 1 ? 'it as a guard' : 'them as guards'}. ${disarmingConsequence(leftOff)}`,
      confirmLabel: 'Approve and stop guarding',
      destructive: true,
      onConfirm: () => approveShown(),
    });
  };

  const exportHooks = () =>
    runFileAction('export', async () => {
      const path = await hooks.hooksExport();
      if (!path) return null;
      return `Exported ${countOf(hookList.length, 'hook')} to ${fileNameOf(path)}.`;
    });

  const importHooks = async () => {
    setError(null);
    setNotice(null);
    let yaml: string;
    let fileName: string;
    try {
      const selected = await open({ multiple: false, filters: HOOKS_FILE_FILTERS });
      if (typeof selected !== 'string') return;
      yaml = await readTextFile(selected);
      fileName = fileNameOf(selected);
    } catch (cause) {
      setError(errorText(cause));
      return;
    }

    const replace = () =>
      runFileAction('import', async () => {
        await hooks.hooksImport(yaml);
        await refresh();
        return `Imported the hooks in ${fileName}.`;
      });

    if (hookList.length === 0) {
      await replace();
      return;
    }
    confirm({
      title: `Replace your ${countOf(hookList.length, 'hook')} with the ones in ${fileName}?`,
      description: `Importing removes every hook listed here and overwrites hooks.yaml. The current hooks stop running and cannot be restored unless you exported them first.${hookList.some(isGuard) ? ' A guard among them stops checking tool calls and messages unless the file you import carries it too.' : ''} A system dialog shows the imported commands for approval next.`,
      confirmLabel: 'Replace hooks',
      destructive: true,
      onConfirm: () => {
        void replace();
      },
    });
  };

  if (!isTauriHost) return null;

  const closeEditor = () => setEditing(null);
  const saved = async () => {
    setEditing(null);
    await refresh();
  };

  return (
    <section aria-labelledby="hooks-settings-title" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="hooks-settings-title" className="text-lg font-semibold">
            Hooks
          </h3>
          <p className="text-sm text-muted-foreground">
            Shell commands that run automatically when a session starts, a tool runs or a prompt is
            sent. Every new or changed command is shown to you in a system dialog and runs only if
            you approve it there.
          </p>
        </div>
        {editing === null ? (
          <Button
            type="button"
            variant="outline"
            disabled={waiting !== null}
            onClick={() => setEditing('new')}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add hook
          </Button>
        ) : null}
      </div>

      {waiting ? (
        <section
          aria-labelledby="hooks-waiting-title"
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <h4 id="hooks-waiting-title" className="text-sm font-semibold text-foreground">
            Hooks are waiting for your approval
          </h4>
          <p className="text-sm text-muted-foreground">
            {waitingSummary(waiting, hookList.length)}
          </p>
          {waiting.problem ? (
            <p role="alert" className="break-words text-sm text-danger-text">
              {waiting.problem}
            </p>
          ) : null}
          {waiting.hooks.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {waiting.hooks.map((hook) => (
                <li key={hook.name} className="space-y-1 p-3">
                  <p className="text-sm font-medium text-foreground">{hook.name}</p>
                  <p className="text-sm text-muted-foreground">{hook.events.join(', ')}</p>
                  <code className="block break-all font-mono text-sm text-foreground">
                    {hook.command}
                  </code>
                  {environmentSummary(hook) ? (
                    <p className="break-all text-sm text-muted-foreground">
                      Environment: {environmentSummary(hook)}
                    </p>
                  ) : null}
                  {guardFailureNote(hook) ? (
                    <p className="text-sm text-muted-foreground">{guardFailureNote(hook)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {waiting.problem ? null : (
            <Button type="button" disabled={busy !== null} onClick={approve}>
              Approve
            </Button>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || busy !== null || waiting !== null}
          onClick={() => void importHooks()}
        >
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
          Import
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || busy !== null || hookList.length === 0}
          onClick={() => void exportHooks()}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Export
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || busy !== null}
          onClick={() => void reload()}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Reload from hooks.yaml
        </Button>
      </div>

      {busy !== null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Answer the system dialog to continue.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}

      {editing !== null ? (
        <HookEditor
          key={editing === 'new' ? 'new' : editing.name}
          eventTypes={eventTypes}
          initial={editing === 'new' ? EMPTY_DRAFT : draftFrom(editing)}
          original={editing === 'new' ? null : editing}
          takenNames={editing === 'new' ? hookList.map((hook) => hook.name) : []}
          onCancel={closeEditor}
          onSaved={saved}
          confirm={confirm}
        />
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Loading hooks
        </p>
      ) : hookList.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hooks yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {hookList.map((hook) => {
            const runs = runSummary(stats[hook.name]);
            return (
              <li key={hook.name} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-foreground">{hook.name}</p>
                  <p className="text-sm text-muted-foreground">{hook.events.join(', ')}</p>
                  <code className="block break-all font-mono text-sm text-foreground">
                    {hook.command}
                  </code>
                  {environmentSummary(hook) ? (
                    <p className="break-all text-sm text-muted-foreground">
                      Environment: {environmentSummary(hook)}
                    </p>
                  ) : null}
                  {guardFailureNote(hook) ? (
                    <p className="text-sm text-muted-foreground">{guardFailureNote(hook)}</p>
                  ) : null}
                  <p className="text-sm text-muted-foreground">
                    {runs.text}
                    {runs.failures ? (
                      <span className="text-danger-text"> {runs.failures}</span>
                    ) : null}
                  </p>
                </div>
                <Switch
                  checked={hook.enabled}
                  disabled={togglingName === hook.name || waiting !== null}
                  aria-label={`${hook.enabled ? 'Turn off' : 'Turn on'} ${hook.name}`}
                  onCheckedChange={(enabled) => toggle(hook, enabled)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${hook.name}`}
                  disabled={editing !== null || waiting !== null}
                  onClick={() => setEditing(hook)}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${hook.name}`}
                  disabled={waiting !== null}
                  onClick={() => remove(hook)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
}

export default HooksSettings;
