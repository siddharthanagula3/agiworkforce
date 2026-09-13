'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ALWAYS_REFUSED_PROGRAMS,
  DesktopRuntimeError,
  EMPTY_SHELL_POLICY,
  LOCAL_MODEL_SERVERS,
  type LocalModelServerId,
  type LocalModelSettings,
  type ShellPolicy,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { useDesktopHost } from '../lib/host';
import {
  listWorkspaceRoots,
  pickWorkspaceRoot,
  readLocalCommandPolicy,
  readLocalModelSettings,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
  writeLocalCommandPolicy,
  writeLocalModelSettings,
} from '../lib/runtime-client';
import { useLocalModels } from '../hooks/use-local-models';

const HEADING = 'Local access';
const FOLDERS_HEADING = 'Folders';
const COMMANDS_HEADING = 'Commands';
const COMMANDS_INTRO =
  'Programs AGI Cloud may start inside an approved folder. Anything not listed asks you every time it runs, quoting the exact command first.';
const COMMANDS_FOOTNOTE = `${ALWAYS_REFUSED_PROGRAMS.join(', ')} are never available here, whatever this list says: changing which account a command runs as is not something approving a folder can cover.`;
const POLICY_LOAD_FAILED = 'The command list could not be read.';
const POLICY_SAVE_FAILED = 'The command list was not saved.';
const ALLOWED_EMPTY = 'Nothing runs without asking.';
const BLOCKED_EMPTY = 'Nothing is blocked outright.';
const INTRO =
  'Folders on this Mac that AGI Cloud may open. Files you attach from one are uploaded to your account the same way any attachment is.';
const EMPTY_COPY =
  'No folders approved yet. Add one to attach its files without leaving the app, and to let AGI read it when you ask.';
const LOAD_FAILED = 'Approved folders could not be read.';
const ADD_FAILED = 'That folder was not approved.';
const REVOKE_FAILED = 'That folder was not removed.';
const ADD_LABEL = 'Add a folder';
const ADD_BUSY_LABEL = 'Choosing…';

const BUTTON_CLASS =
  'min-h-[32px] rounded-md border border-border/60 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60';
const CHIP_CLASS =
  'inline-flex min-h-[28px] items-center gap-2 rounded-full border border-border/50 px-3 py-1 font-mono text-xs text-foreground';
const CHIP_REMOVE_CLASS =
  'min-h-[24px] min-w-[24px] rounded-full text-muted-foreground transition-colors hover:text-foreground';
const FIELD_CLASS =
  'min-h-[32px] w-40 rounded-md border border-border/60 bg-background px-3 py-1 font-mono text-xs text-foreground outline-none focus-visible:border-[var(--chat-accent-primary)]';
const SUB_HEADING_CLASS = 'text-xs font-medium uppercase tracking-wider text-muted-foreground';

const MODELS_HEADING = 'Local models';
const MODELS_INTRO =
  'Models already running on this Mac through Ollama or LM Studio. A chat on one of them is answered here: nothing in it reaches AGI Cloud or any provider, and it uses none of your plan.';
const MODELS_ALLOW_LABEL = 'Allow local models';
const MODELS_ALLOWED_TEXT = 'Allowed. The composer lists them under "On this device".';
const MODELS_NOT_RUNNING = 'Not running';
const MODELS_RUNNING = 'Running';
const MODELS_URL_LABEL = 'Address';
const MODELS_URL_FOOTNOTE =
  'Only a localhost address is accepted. A model reached over the network would not be local, so the Local label would be untrue.';
const MODELS_URL_SAVE_FAILED = 'That address was not saved.';
const MODEL_URL_FIELD_CLASS =
  'min-h-[32px] w-56 rounded-md border border-border/60 bg-background px-3 py-1 font-mono text-xs text-foreground outline-none focus-visible:border-[var(--chat-accent-primary)]';

function messageFor(error: unknown, fallback: string): string | null {
  if (error instanceof DesktopRuntimeError) {
    return error.code === 'cancelled' ? null : `${fallback} ${error.message}`;
  }
  return fallback;
}

function LocalModelsPanel() {
  const models = useLocalModels(true);
  const [settings, setSettings] = useState<LocalModelSettings | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<LocalModelServerId, string>>>({});
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    readLocalModelSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const saveBaseUrl = useCallback(
    async (serverId: LocalModelServerId, value: string) => {
      try {
        const next = await writeLocalModelSettings({
          baseUrls: { [serverId]: value } as LocalModelSettings['baseUrls'],
        });
        setSettings(next);
        setDrafts((current) => ({ ...current, [serverId]: undefined }));
        setUrlError(null);
        await models.refresh();
      } catch (cause) {
        // The field goes back to the address actually in force. Leaving the
        // refused text in place would read as though it had been accepted.
        setDrafts((current) => ({ ...current, [serverId]: undefined }));
        setUrlError(messageFor(cause, MODELS_URL_SAVE_FAILED));
      }
    },
    [models],
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border/40 pt-4">
      <div>
        <h4 className={SUB_HEADING_CLASS}>{MODELS_HEADING}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{MODELS_INTRO}</p>
      </div>

      {models.granted ? (
        <p className="text-xs text-muted-foreground">{MODELS_ALLOWED_TEXT}</p>
      ) : (
        <div>
          <button type="button" className={BUTTON_CLASS} onClick={() => void models.grant()}>
            {MODELS_ALLOW_LABEL}
          </button>
        </div>
      )}

      {models.error ? (
        <p role="alert" className="text-xs text-danger">
          {models.error}
        </p>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        {LOCAL_MODEL_SERVERS.map((serverId) => {
          const server = models.servers.find((candidate) => candidate.id === serverId);
          const baseUrl = settings?.baseUrls[serverId] ?? server?.baseUrl ?? '';
          const draft = drafts[serverId];
          return (
            <li
              key={serverId}
              className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border/40 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{server?.label ?? serverId}</p>
                <p className="text-xs text-muted-foreground">
                  {server?.reachable
                    ? `${MODELS_RUNNING} · ${server.modelCount} model${server.modelCount === 1 ? '' : 's'}`
                    : MODELS_NOT_RUNNING}
                </p>
              </div>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {MODELS_URL_LABEL}
                <input
                  className={MODEL_URL_FIELD_CLASS}
                  value={draft ?? baseUrl}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [serverId]: event.target.value }))
                  }
                  onBlur={(event) => {
                    if (event.target.value === baseUrl) return;
                    void saveBaseUrl(serverId, event.target.value);
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>

      {urlError ? (
        <p role="alert" className="text-xs text-danger">
          {urlError}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">{MODELS_URL_FOOTNOTE}</p>
    </div>
  );
}

export function LocalAccessSection() {
  const host = useDesktopHost();
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ShellPolicy>(EMPTY_SHELL_POLICY);
  const [draft, setDraft] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const refresh = useCallback(async () => {
    try {
      setRoots(await listWorkspaceRoots());
      setError(null);
    } catch (cause) {
      setError(messageFor(cause, LOAD_FAILED));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!host) {
      setLoading(false);
      return;
    }
    void refresh();
    readLocalCommandPolicy()
      .then(setPolicy)
      .catch((cause: unknown) => setError(messageFor(cause, POLICY_LOAD_FAILED)));
  }, [host, refresh]);

  const savePolicy = useCallback(async (next: ShellPolicy) => {
    try {
      setPolicy(await writeLocalCommandPolicy(next));
      setError(null);
    } catch (cause) {
      setError(messageFor(cause, POLICY_SAVE_FAILED));
    }
  }, []);

  const onListProgram = useCallback(
    (list: keyof ShellPolicy) => {
      const program = draft.trim();
      if (program === '') return;
      setDraft('');
      const without = (entries: string[]) => entries.filter((entry) => entry !== program);
      void savePolicy(
        list === 'allow'
          ? { allow: [...policy.allow, program], deny: without(policy.deny) }
          : { allow: without(policy.allow), deny: [...policy.deny, program] },
      );
    },
    [draft, policy, savePolicy],
  );

  const onUnlistProgram = useCallback(
    (list: keyof ShellPolicy, program: string) => {
      const without = (entries: string[]) => entries.filter((entry) => entry !== program);
      void savePolicy(
        list === 'allow'
          ? { allow: without(policy.allow), deny: policy.deny }
          : { allow: policy.allow, deny: without(policy.deny) },
      );
    },
    [policy, savePolicy],
  );

  const onAdd = useCallback(async () => {
    setBusy(true);
    try {
      await pickWorkspaceRoot();
      setError(null);
      await refresh();
    } catch (cause) {
      setError(messageFor(cause, ADD_FAILED));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const onRevoke = useCallback(
    (root: WorkspaceRoot) => {
      confirm({
        title: `Remove access to ${root.name}?`,
        description: `AGI stops being able to read or write anything under ${root.path}, and the folder leaves the composer's attach menu. Nothing on disk changes, and you can approve the folder again whenever you want.`,
        confirmLabel: 'Remove access',
        destructive: true,
        onConfirm: async () => {
          try {
            await revokeWorkspaceRoot(root.id);
            setError(null);
            await refresh();
          } catch (cause) {
            setError(messageFor(cause, REVOKE_FAILED));
          }
        },
      });
    },
    [confirm, refresh],
  );

  if (!host) return null;

  return (
    <section className="flex flex-col gap-4">
      {confirmDialog}
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {HEADING}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{INTRO}</p>
      </div>

      <h4 className={SUB_HEADING_CLASS}>{FOLDERS_HEADING}</h4>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      {loading ? (
        <Spinner aria-label="Loading approved folders" />
      ) : roots.length === 0 ? (
        <p className="text-xs text-muted-foreground">{EMPTY_COPY}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {roots.map((root) => (
            <li
              key={root.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border/40 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{root.name}</p>
                <p className="break-words text-xs text-muted-foreground">{root.path}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className={BUTTON_CLASS}
                  onClick={() => void revealWorkspaceRoot(root.id)}
                >
                  Reveal
                </button>
                <button type="button" className={BUTTON_CLASS} onClick={() => onRevoke(root)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={() => void onAdd()}>
          {busy ? ADD_BUSY_LABEL : ADD_LABEL}
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/40 pt-4">
        <div>
          <h4 className={SUB_HEADING_CLASS}>{COMMANDS_HEADING}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{COMMANDS_INTRO}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Runs without asking</p>
          {policy.allow.length === 0 ? (
            <p className="text-xs text-muted-foreground">{ALLOWED_EMPTY}</p>
          ) : (
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {policy.allow.map((program) => (
                <li key={program} className={CHIP_CLASS}>
                  {program}
                  <button
                    type="button"
                    className={CHIP_REMOVE_CLASS}
                    aria-label={`Ask before running ${program}`}
                    onClick={() => onUnlistProgram('allow', program)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Never runs</p>
          {policy.deny.length === 0 ? (
            <p className="text-xs text-muted-foreground">{BLOCKED_EMPTY}</p>
          ) : (
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {policy.deny.map((program) => (
                <li key={program} className={CHIP_CLASS}>
                  {program}
                  <button
                    type="button"
                    className={CHIP_REMOVE_CLASS}
                    aria-label={`Stop blocking ${program}`}
                    onClick={() => onUnlistProgram('deny', program)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Program name
            <input
              className={FIELD_CLASS}
              value={draft}
              placeholder="pnpm"
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={draft.trim() === ''}
            onClick={() => onListProgram('allow')}
          >
            Allow
          </button>
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={draft.trim() === ''}
            onClick={() => onListProgram('deny')}
          >
            Block
          </button>
        </div>

        <p className="text-xs text-muted-foreground">{COMMANDS_FOOTNOTE}</p>
      </div>

      <LocalModelsPanel />
    </section>
  );
}
