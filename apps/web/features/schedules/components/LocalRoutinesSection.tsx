'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  DesktopRuntimeError,
  getHostBridge,
  localSessionPath,
  type DeveloperModelOption,
  type LocalRoutineInput,
  type LocalRoutineState,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import {
  allowDeveloperSessions,
  listDeveloperModels,
  listWorkspaceRoots,
  onWorkspaceChanged,
  pickWorkspaceRoot,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';

async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const bridge = getHostBridge();
  if (!bridge) throw new Error('Local routines require the Desktop app.');
  const result = await bridge.invokeRuntime<T>(command, args);
  if (!result.ok) throw new DesktopRuntimeError(result.error);
  return result.value;
}

export function LocalRoutinesSection() {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<LocalRoutineState | null>(null);
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);
  const [models, setModels] = useState<DeveloperModelOption[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [rootId, setRootId] = useState('');
  const [model, setModel] = useState('');
  const [cadence, setCadence] = useState<'interval' | 'once' | 'cron'>('interval');
  const [minutes, setMinutes] = useState('60');
  const [executeAt, setExecuteAt] = useState('');
  const [cron, setCron] = useState('');
  const [timezone, setTimezone] = useState('');
  const [missed, setMissed] = useState<'run_once' | 'skip'>('run_once');
  const [keepAwake, setKeepAwake] = useState(false);
  const [notifications, setNotifications] = useState({
    onSuccess: true,
    onFailure: true,
    onApproval: true,
    push: true,
    email: false,
  });
  const request = useRef<{ input: string; id: string } | null>(null);
  const { confirm, dialog: confirmation } = useConfirmAction();
  const refresh = useCallback(async () => {
    setState(await invoke<LocalRoutineState>('local_routine_list'));
  }, []);

  useEffect(() => {
    if (!getHostBridge()) return;
    setAvailable(true);
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    let active = true;
    const load = async () => {
      try {
        const [current, folders] = await Promise.all([
          invoke<LocalRoutineState>('local_routine_list'),
          listWorkspaceRoots(),
        ]);
        if (active) {
          setState(current);
          setRoots(folders);
        }
      } catch (failure) {
        if (active) setError(toUserMessage(failure, 'Local routines could not be read.'));
      }
    };
    void load();
    const timer = setInterval(() => {
      void load();
    }, 10_000);
    const unwatch = onWorkspaceChanged(() => {
      void load();
    });
    return () => {
      active = false;
      clearInterval(timer);
      unwatch();
    };
  }, []);

  useEffect(() => {
    setModels([]);
    setModel('');
    if (!rootId) return;
    let active = true;
    void listDeveloperModels(rootId).then(
      (result) => {
        if (active) {
          setModels(result.models);
          setModel(result.defaultModelId ?? result.models[0]?.id ?? '');
        }
      },
      (failure: unknown) => {
        if (active) setError(toUserMessage(failure, 'Models could not be loaded for this folder.'));
      },
    );
    return () => {
      active = false;
    };
  }, [rootId]);

  async function act(operation: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (failure) {
      setError(toUserMessage(failure, 'The local routine could not be changed.'));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    await act(async () => {
      const schedule: LocalRoutineInput['schedule'] = {
        type: cadence,
        enabled: true,
        timezone,
        ...(cadence === 'interval'
          ? { intervalMs: Number(minutes) * 60_000 }
          : cadence === 'cron'
            ? { cron }
            : { executeAt: new Date(executeAt).toISOString() }),
      };
      const input: LocalRoutineInput = {
        name,
        prompt,
        rootId,
        model,
        schedule,
        missedExecutionPolicy: missed,
        keepAwake,
        notificationSettings: notifications,
      };
      const serialized = JSON.stringify(input);
      if (request.current?.input !== serialized)
        request.current = { input: serialized, id: crypto.randomUUID() };
      await invoke('local_routine_create', { ...input, requestId: request.current.id });
      request.current = null;
      setOpen(false);
      setName('');
      setPrompt('');
    });
  }
  if (!available) return null;
  return (
    <section aria-label="Local routines" className="space-y-4 rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">On this computer</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Runs while the Desktop app is open. The selected model may still run in the cloud.
            Interrupted runs are kept for review.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setRootId(roots[0]?.id ?? '');
            setOpen(true);
          }}
          disabled={busy}
        >
          New local routine
        </Button>
      </div>
      {!open && (error || state?.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? state?.error}
        </p>
      )}
      {state?.suspended && (
        <p role="status" className="text-sm text-muted-foreground">
          Local runs are suspended until this computer wakes.
        </p>
      )}
      {state?.routines.length === 0 && (
        <p className="text-sm text-muted-foreground">No local routines on this device.</p>
      )}
      <ul className="space-y-3">
        {state?.routines.map((routine) => {
          const latest = routine.runs.at(-1);
          const active = latest && ['starting', 'running', 'awaiting_input'].includes(latest.state);
          const canResume =
            (routine.schedule.type !== 'once' ||
              Date.parse(routine.schedule.executeAt ?? '') > Date.now()) &&
            (!routine.schedule.expiresAt || Date.parse(routine.schedule.expiresAt) > Date.now()) &&
            (routine.schedule.maxExecutions === undefined ||
              routine.executionCount < routine.schedule.maxExecutions);
          return (
            <li key={routine.id} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-medium">{routine.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {latest?.state.replaceAll('_', ' ') ??
                      (routine.schedule.enabled ? 'Scheduled' : 'Paused')}
                    {routine.nextExecutionAt && routine.schedule.enabled
                      ? ` · Next: ${new Date(routine.nextExecutionAt).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {latest?.threadId && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={localSessionPath(routine.rootId, latest.threadId)}>Open run</Link>
                    </Button>
                  )}
                  {(routine.schedule.enabled || active || canResume) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        void act(() =>
                          invoke('local_routine_set_enabled', {
                            id: routine.id,
                            enabled: !(routine.schedule.enabled || active),
                          }),
                        );
                      }}
                    >
                      {routine.schedule.enabled || active ? 'Pause' : 'Resume'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      confirm({
                        title: `Remove ${routine.name}?`,
                        description:
                          'The active run will be stopped. Its coding session remains available in Code.',
                        confirmLabel: 'Remove routine',
                        onConfirm: () => {
                          void act(() => invoke('local_routine_remove', { id: routine.id }));
                        },
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {routine.pausedReason && (
                <p className="break-words text-sm text-muted-foreground">{routine.pausedReason}</p>
              )}
            </li>
          );
        })}
      </ul>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New local routine</DialogTitle>
            <DialogDescription>
              The app will ask for permission at this computer. Tool approvals remain enabled, and
              local routines never fall back to a cloud routine.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            {(error || state?.error) && (
              <p role="alert" className="text-sm text-destructive">
                {error ?? state?.error}
              </p>
            )}
            <fieldset disabled={busy} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-routine-name">Name</Label>
                <Input
                  id="local-routine-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={200}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="local-routine-folder">Project folder</Label>
                <select
                  id="local-routine-folder"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={rootId}
                  onChange={(event) => setRootId(event.target.value)}
                  required
                >
                  <option value="">Choose an approved folder</option>
                  {roots.map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void act(async () => {
                      const folder = await pickWorkspaceRoot();
                      setRoots(await listWorkspaceRoots());
                      setRootId(folder.id);
                    });
                  }}
                >
                  Choose folder
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="local-routine-model">Model</Label>
                {rootId && models.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void act(async () => {
                        await allowDeveloperSessions(rootId);
                        const result = await listDeveloperModels(rootId);
                        setModels(result.models);
                        setModel(result.defaultModelId ?? result.models[0]?.id ?? '');
                      });
                    }}
                  >
                    Allow agent and load models
                  </Button>
                )}
                <select
                  id="local-routine-model"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  required
                >
                  <option value="">Choose a model</option>
                  {models.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="local-routine-prompt">Instructions</Label>
                <Textarea
                  id="local-routine-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={100_000}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="local-routine-cadence">Repeat</Label>
                  <select
                    id="local-routine-cadence"
                    className="w-full rounded-md border border-input bg-background p-2 text-sm"
                    value={cadence}
                    onChange={(event) => setCadence(event.target.value as typeof cadence)}
                  >
                    <option value="interval">Every interval</option>
                    <option value="once">Once</option>
                    <option value="cron">Cron schedule</option>
                  </select>
                </div>
                <div className="space-y-2">
                  {cadence === 'interval' ? (
                    <>
                      <Label htmlFor="local-routine-minutes">Minutes</Label>
                      <Input
                        id="local-routine-minutes"
                        type="number"
                        min="1"
                        value={minutes}
                        onChange={(event) => setMinutes(event.target.value)}
                        required
                      />
                    </>
                  ) : cadence === 'once' ? (
                    <>
                      <Label htmlFor="local-routine-time">Run at</Label>
                      <Input
                        id="local-routine-time"
                        type="datetime-local"
                        value={executeAt}
                        onChange={(event) => setExecuteAt(event.target.value)}
                        required
                      />
                    </>
                  ) : (
                    <>
                      <Label htmlFor="local-routine-cron">Cron expression</Label>
                      <Input
                        id="local-routine-cron"
                        value={cron}
                        onChange={(event) => setCron(event.target.value)}
                        required
                      />
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="local-routine-timezone">Time zone</Label>
                <Input
                  id="local-routine-timezone"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="local-routine-missed">If a run is missed</Label>
                <select
                  id="local-routine-missed"
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  value={missed}
                  onChange={(event) => setMissed(event.target.value as typeof missed)}
                >
                  <option value="run_once">Run once when available</option>
                  <option value="skip">Skip missed runs</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="local-routine-awake">Keep this computer awake while running</Label>
                <Switch
                  id="local-routine-awake"
                  checked={keepAwake}
                  onCheckedChange={setKeepAwake}
                />
              </div>
              {(
                [
                  ['push', 'Desktop notifications'],
                  ['onSuccess', 'Notify on success'],
                  ['onFailure', 'Notify on failure'],
                  ['onApproval', 'Notify when approval is needed'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`local-routine-${key}`}>{label}</Label>
                  <Switch
                    id={`local-routine-${key}`}
                    checked={notifications[key]}
                    onCheckedChange={(checked) =>
                      setNotifications((current) => ({ ...current, [key]: checked }))
                    }
                  />
                </div>
              ))}
              <Button type="submit" className="w-full" disabled={busy || !rootId || !model}>
                {busy ? 'Saving…' : 'Allow and create routine'}
              </Button>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
      {confirmation}
    </section>
  );
}
