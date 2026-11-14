'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { McpServerSummary } from '@agiworkforce/types/protocol';
import { Spinner, Switch, useConfirmAction } from '@agiworkforce/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui/dialog';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import {
  addDeveloperMcpServer,
  developerMcpServerTools,
  listDeveloperMcpServers,
  listDeveloperSessions,
  openDeveloperMcpConfig,
  removeDeveloperMcpServer,
  setDeveloperMcpServerEnabled,
  testDeveloperMcpServer,
  type DeveloperMcpServerInput,
} from '../lib/runtime-client';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsEmpty,
  DesktopSettingsGroup,
  DesktopSettingsHeading,
} from './DesktopSettingsRow';
import { TerminalSettings } from './TerminalSettings';

const HEADING = 'Developer';
const HEADING_HINT =
  'MCP servers on this computer, started by the AGI CLI for your coding sessions.';
const SERVERS_HEADING = 'Local MCP servers';
const ADD_LABEL = 'Add server';
const EDIT_CONFIG_LABEL = 'Edit config';
const NO_SERVERS = 'No MCP servers yet. Add one, or edit the config file.';
const NO_FOLDER =
  'Approve a folder for coding sessions first. MCP servers run through the AGI CLI, which starts in an approved folder.';
const LOAD_FAILED = 'MCP servers could not be read.';
const ACTION_FAILED = 'That could not be done.';
const TEST_LABEL = 'Test';
const TOOLS_LABEL = 'Tools';
const REMOVE_LABEL = 'Remove';
const PROJECT_NOTE = 'From a project. Review it in the Code rail before it can run.';
const FIELD_CLASS =
  'h-8 w-full rounded-md border border-border bg-transparent px-2.5 text-sm text-[var(--text-1)]';
const AREA_CLASS =
  'min-h-16 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-xs text-[var(--text-1)]';

const STATUS_LABELS: Record<McpServerSummary['status'], string> = {
  configured: 'Ready',
  authorized: 'Signed in',
  needs_auth: 'Needs sign-in',
  blocked: 'Blocked by policy',
  needs_approval: 'Needs approval',
};

const SCOPE_LABELS: Record<McpServerSummary['scope'], string> = {
  user: 'Yours',
  project: 'Project',
  plugin: 'Plugin',
};

type Detail =
  | { kind: 'test'; text: string; failure: boolean }
  | { kind: 'tools'; names: Array<{ name: string; description: string }> };

function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of parseLines(text)) {
    const at = line.indexOf('=');
    if (at > 0) env[line.slice(0, at).trim()] = line.slice(at + 1);
  }
  return env;
}

function AddServerDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (input: DeveloperMcpServerInput) => Promise<boolean>;
}) {
  const ids = { name: useId(), command: useId(), args: useId(), url: useId(), env: useId() };
  const [kind, setKind] = useState<'command' | 'url'>('command');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const environment = parseEnv(env);
    const added = await onAdd(
      kind === 'url'
        ? { name: name.trim(), url: url.trim(), transport: 'http' }
        : {
            name: name.trim(),
            command: command.trim(),
            args: parseLines(args),
            ...(Object.keys(environment).length > 0 ? { env: environment } : {}),
          },
    );
    setBusy(false);
    if (added) {
      setName('');
      setCommand('');
      setArgs('');
      setUrl('');
      setEnv('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ADD_LABEL}</DialogTitle>
          <DialogDescription>
            The app asks once more before the CLI runs anything you add.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <label htmlFor={ids.name} className="flex flex-col gap-1 text-sm">
            Name
            <input
              id={ids.name}
              className={FIELD_CLASS}
              value={name}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="flex gap-2" role="radiogroup" aria-label="Server type">
            {(['command', 'url'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={kind === option}
                className={`${DESKTOP_SETTINGS_BUTTON_CLASS} ${kind === option ? 'bg-muted' : ''}`}
                onClick={() => setKind(option)}
              >
                {option === 'command' ? 'Program on this computer' : 'Server address'}
              </button>
            ))}
          </div>
          {kind === 'command' ? (
            <>
              <label htmlFor={ids.command} className="flex flex-col gap-1 text-sm">
                Command
                <input
                  id={ids.command}
                  className={FIELD_CLASS}
                  placeholder="npx"
                  value={command}
                  required
                  spellCheck={false}
                  onChange={(event) => setCommand(event.target.value)}
                />
              </label>
              <label htmlFor={ids.args} className="flex flex-col gap-1 text-sm">
                Arguments, one per line
                <textarea
                  id={ids.args}
                  className={AREA_CLASS}
                  value={args}
                  spellCheck={false}
                  onChange={(event) => setArgs(event.target.value)}
                />
              </label>
              <label htmlFor={ids.env} className="flex flex-col gap-1 text-sm">
                Environment, NAME=value per line
                <textarea
                  id={ids.env}
                  className={AREA_CLASS}
                  value={env}
                  spellCheck={false}
                  onChange={(event) => setEnv(event.target.value)}
                />
              </label>
            </>
          ) : (
            <label htmlFor={ids.url} className="flex flex-col gap-1 text-sm">
              Address
              <input
                id={ids.url}
                className={FIELD_CLASS}
                placeholder="https://mcp.example.com/mcp"
                value={url}
                required
                spellCheck={false}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
          )}
          <div className="flex justify-end">
            <button type="submit" className={DESKTOP_SETTINGS_BUTTON_CLASS} disabled={busy}>
              {busy ? <Spinner size="sm" aria-hidden="true" /> : ADD_LABEL}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LocalMcpSettings() {
  const host = useElectronHost();
  const { confirm, dialog } = useConfirmAction();
  const [rootId, setRootId] = useState<string | null | undefined>(undefined);
  const [servers, setServers] = useState<McpServerSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (root: string) => {
    try {
      setServers(await listDeveloperMcpServers(root));
      setFailure(null);
    } catch (cause: unknown) {
      setFailure(toUserMessage(cause, LOAD_FAILED));
    }
  }, []);

  useEffect(() => {
    if (!host) return undefined;
    let cancelled = false;
    void listDeveloperSessions()
      .then((list) => {
        if (cancelled) return;
        const usable = list.groups.find(
          (group) =>
            group.worktree === undefined &&
            group.sessionsWithheld !== true &&
            group.unavailable === undefined &&
            !group.sessions.some((session) => session.environment === 'ssh'),
        );
        setRootId(usable?.rootId ?? null);
        if (usable) void load(usable.rootId);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setFailure(toUserMessage(cause, LOAD_FAILED));
      });
    return () => {
      cancelled = true;
    };
  }, [host, load]);

  useEffect(() => {
    if (!rootId) return undefined;
    const reload = () => void load(rootId);
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [rootId, load]);

  if (!host) return null;

  const act = async (name: string, work: () => Promise<unknown>) => {
    if (!rootId) return;
    setBusy(name);
    setFailure(null);
    try {
      await work();
      await load(rootId);
    } catch (cause: unknown) {
      setFailure(toUserMessage(cause, ACTION_FAILED));
    } finally {
      setBusy(null);
    }
  };

  const show = async (name: string, read: () => Promise<Detail>) => {
    setBusy(name);
    try {
      const detail = await read();
      setDetails((current) => ({ ...current, [name]: detail }));
    } catch (cause: unknown) {
      setDetails((current) => ({
        ...current,
        [name]: { kind: 'test', text: toUserMessage(cause, ACTION_FAILED), failure: true },
      }));
    } finally {
      setBusy(null);
    }
  };

  const add = async (input: DeveloperMcpServerInput): Promise<boolean> => {
    if (!rootId) return false;
    try {
      await addDeveloperMcpServer(rootId, input);
      await load(rootId);
      return true;
    } catch (cause: unknown) {
      setFailure(toUserMessage(cause, ACTION_FAILED));
      return false;
    }
  };

  const askToRemove = (server: McpServerSummary) =>
    confirm({
      title: `Remove ${server.name}?`,
      description:
        'The server is removed from your MCP config and coding sessions stop starting it. Its settings, including any environment values, cannot be recovered here.',
      confirmLabel: REMOVE_LABEL,
      destructive: true,
      onConfirm: () =>
        act(server.name, () => removeDeveloperMcpServer(rootId as string, server.name)),
    });

  return (
    <div className="flex flex-col gap-6">
      <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />
      <DesktopSettingsGroup
        title={SERVERS_HEADING}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className={DESKTOP_SETTINGS_BUTTON_CLASS}
              onClick={() =>
                void openDeveloperMcpConfig().catch((cause: unknown) =>
                  setFailure(toUserMessage(cause, ACTION_FAILED)),
                )
              }
            >
              {EDIT_CONFIG_LABEL}
            </button>
            <button
              type="button"
              className={DESKTOP_SETTINGS_BUTTON_CLASS}
              disabled={!rootId}
              onClick={() => setAdding(true)}
            >
              {ADD_LABEL}
            </button>
          </div>
        }
      >
        {rootId === undefined && servers === null && failure === null && (
          <p className="flex items-center gap-2 py-3 text-sm text-[var(--text-3)]" role="status">
            <Spinner size="sm" aria-hidden="true" />
          </p>
        )}
        {rootId === null && <DesktopSettingsEmpty>{NO_FOLDER}</DesktopSettingsEmpty>}
        {servers !== null && servers.length === 0 && (
          <DesktopSettingsEmpty>{NO_SERVERS}</DesktopSettingsEmpty>
        )}
        {servers?.map((server) => {
          const detail = details[server.name];
          const editable = server.scope === 'user';
          return (
            <div
              key={`${server.scope}:${server.name}`}
              className="flex flex-col gap-2 border-b border-[var(--settings-border)] py-[14px]"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-[var(--text-1)]">{server.name}</span>
                  <span className="break-all text-sm text-[var(--text-3)]">
                    {[
                      SCOPE_LABELS[server.scope],
                      server.disabled ? 'Off' : STATUS_LABELS[server.status],
                      server.url ?? server.transport,
                    ].join(' · ')}
                  </span>
                  {server.scope === 'project' && server.status === 'needs_approval' && (
                    <span className="text-sm text-[var(--text-3)]">{PROJECT_NOTE}</span>
                  )}
                  {server.policyRefusal && (
                    <span className="text-sm text-[var(--settings-destructive-text)]">
                      {server.policyRefusal}
                    </span>
                  )}
                </span>
                {editable && (
                  <Switch
                    checked={server.disabled !== true}
                    disabled={busy !== null}
                    aria-label={`${server.disabled ? 'Turn on' : 'Turn off'} ${server.name}`}
                    onCheckedChange={(checked) =>
                      void act(server.name, () =>
                        setDeveloperMcpServerEnabled(rootId as string, server.name, checked),
                      )
                    }
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={DESKTOP_SETTINGS_BUTTON_CLASS}
                  disabled={busy !== null || server.disabled === true}
                  onClick={() =>
                    void show(server.name, async () => {
                      const result = await testDeveloperMcpServer(rootId as string, server.name);
                      return result.connected
                        ? {
                            kind: 'test',
                            text: `Connected in ${result.elapsedMs} ms with ${result.toolCount} ${result.toolCount === 1 ? 'tool' : 'tools'}.`,
                            failure: false,
                          }
                        : {
                            kind: 'test',
                            text: result.error ?? 'Could not connect.',
                            failure: true,
                          };
                    })
                  }
                >
                  {busy === server.name ? <Spinner size="sm" aria-hidden="true" /> : TEST_LABEL}
                </button>
                <button
                  type="button"
                  className={DESKTOP_SETTINGS_BUTTON_CLASS}
                  disabled={busy !== null || server.disabled === true}
                  onClick={() =>
                    void show(server.name, async () => ({
                      kind: 'tools',
                      names: (await developerMcpServerTools(rootId as string, server.name)).tools,
                    }))
                  }
                >
                  {TOOLS_LABEL}
                </button>
                {editable && (
                  <button
                    type="button"
                    className={DESKTOP_SETTINGS_BUTTON_CLASS}
                    disabled={busy !== null}
                    onClick={() => askToRemove(server)}
                  >
                    {REMOVE_LABEL}
                  </button>
                )}
              </div>
              {detail?.kind === 'test' && (
                <p
                  className={
                    detail.failure
                      ? 'text-sm text-[var(--settings-destructive-text)]'
                      : 'text-sm text-[var(--text-3)]'
                  }
                  role={detail.failure ? 'alert' : 'status'}
                >
                  {detail.text}
                </p>
              )}
              {detail?.kind === 'tools' && (
                <ul className="flex flex-col gap-1 text-sm">
                  {detail.names.map((tool) => (
                    <li key={tool.name}>
                      <span className="font-mono text-[var(--text-1)]">{tool.name}</span>
                      {tool.description && (
                        <span className="text-[var(--text-3)]"> {tool.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </DesktopSettingsGroup>
      {failure !== null && (
        <p className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {failure}
        </p>
      )}
      <AddServerDialog open={adding} onOpenChange={setAdding} onAdd={add} />
      <TerminalSettings />
      {dialog}
    </div>
  );
}
