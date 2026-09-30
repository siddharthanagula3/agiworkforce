import * as vscode from 'vscode';
import type {
  HookListResponse,
  McpServerListResponse,
  McpServerToolsResponse,
  PluginListResponse,
  SkillListResponse,
} from '@agiworkforce/types/protocol';
import type {
  McpServerInspection,
  McpServerProbe,
  PermissionRule,
  PermissionRuleList,
  PluginUpdate,
  ProviderKeyList,
  SavedPermissionList,
  TrustedFolderList,
} from '../../integrations/localRuntimeClient';
import type { ExtensionAgentMode } from '../permissions/agentModeConsent';
import { createSkill } from './skillAuthoring';
import type { McpServerDetailsProvider } from './mcpServerDetails';
import { t, tPlural } from '../../l10n';
import {
  CLI_CAPABILITY_REQUIREMENT,
  type CliCapabilityAdapter,
  type CliCapabilityResult,
} from './cliCapabilities';

type ManagedRun = () => Promise<CliCapabilityResult<unknown> | undefined>;

interface ManagedFollowUp {
  run: ManagedRun;
  reopen: boolean;
}

interface ManagedAction {
  button: vscode.QuickInputButton;
  followUp: ManagedFollowUp;
}

interface ManagedItem extends vscode.QuickPickItem {
  run?: ManagedRun;
  followUp?: ManagedFollowUp;
  actions?: ManagedAction[];
}

interface ManagedSurface {
  title: string;
  placeholder: string;
  empty: string;
  load: () => Promise<CliCapabilityResult<ManagedItem[]>>;
}

const MCP_STATUS_LABELS: Record<McpServerListResponse['servers'][number]['status'], string> = {
  configured: 'Configured',
  authorized: 'Signed in',
  needs_auth: 'Needs sign-in',
  blocked: 'Blocked by your workspace',
};

const REMOVE = 'Remove';

function unavailableLabel(reason: string, noun: string): string {
  return reason === CLI_CAPABILITY_REQUIREMENT ? `${reason} to manage ${noun}` : reason;
}

function reportFailure(outcome: CliCapabilityResult<unknown> | undefined): void {
  if (outcome !== undefined && outcome.status !== 'ok') {
    void vscode.window.showErrorMessage(`AGI Workforce: ${outcome.reason}`);
  }
}

function pickOnce(surface: ManagedSurface, noun: string): Promise<ManagedFollowUp | undefined> {
  const pick = vscode.window.createQuickPick<ManagedItem>();
  pick.title = surface.title;
  pick.placeholder = surface.placeholder;
  pick.matchOnDescription = true;
  pick.matchOnDetail = true;
  let followUp: ManagedFollowUp | undefined;

  const render = async (): Promise<void> => {
    pick.busy = true;
    const result = await surface.load();
    pick.busy = false;
    if (result.status !== 'ok') {
      pick.items = [{ label: unavailableLabel(result.reason, noun), alwaysShow: true }];
      return;
    }
    pick.items =
      result.value.length === 0
        ? [{ label: surface.empty, alwaysShow: true }]
        : result.value.map((item) =>
            item.actions === undefined
              ? item
              : { ...item, buttons: item.actions.map((action) => action.button) },
          );
  };

  const close = (next: ManagedFollowUp): void => {
    followUp = next;
    pick.hide();
  };

  return new Promise<ManagedFollowUp | undefined>((resolve) => {
    pick.onDidAccept(async () => {
      const item = pick.selectedItems[0];
      if (item?.followUp !== undefined) {
        close(item.followUp);
        return;
      }
      if (item?.run === undefined) return;
      pick.busy = true;
      reportFailure(await item.run());
      await render();
    });
    pick.onDidTriggerItemButton((event) => {
      const action = event.item.actions?.find((candidate) => candidate.button === event.button);
      if (action !== undefined) close(action.followUp);
    });
    pick.onDidHide(() => {
      pick.dispose();
      resolve(followUp);
    });
    pick.show();
    void render();
  });
}

async function showManagedSurface(surface: ManagedSurface, noun: string): Promise<void> {
  for (;;) {
    const followUp = await pickOnce(surface, noun);
    if (followUp === undefined) return;
    reportFailure(await followUp.run());
    if (!followUp.reopen) return;
  }
}

async function confirmInstall(
  question: string,
  consequence: string,
  action: string,
): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    question,
    { modal: true, detail: consequence },
    action,
  );
  return choice === action;
}

async function confirmRemoval(question: string, consequence: string): Promise<boolean> {
  const choice = await vscode.window.showWarningMessage(
    question,
    { modal: true, detail: consequence },
    REMOVE,
  );
  return choice === REMOVE;
}

function removeAction(run: ManagedRun): ManagedAction {
  return {
    button: { iconPath: new vscode.ThemeIcon('trash'), tooltip: REMOVE },
    followUp: { run, reopen: true },
  };
}

function toggleLabel(name: string, enabled: boolean): string {
  return `$(${enabled ? 'pass-filled' : 'circle-large-outline'}) ${name}`;
}

async function installSkillFromFolder(adapter: CliCapabilityAdapter): ReturnType<ManagedRun> {
  const folder = await vscode.window.showOpenDialog({
    title: 'AGI Workforce, Install a skill',
    openLabel: 'Install skill',
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
  });
  const source = folder?.[0]?.fsPath;
  if (source === undefined) return undefined;
  return adapter.call('skillsInstall', source);
}

function skillRequirements(skill: SkillListResponse['skills'][number]): string[] {
  const missing = [...skill.missingTools, ...skill.missingEnvVars];
  const required = [...skill.requiredTools, ...skill.requiredEnvVars];
  if (missing.length > 0) return [`$(warning) Missing ${missing.join(', ')}, so it will not load`];
  return required.length === 0 ? [] : [`Needs ${required.join(', ')}`];
}

export async function manageSkills(adapter: CliCapabilityAdapter): Promise<void> {
  const installs = await adapter.offers('installs');
  return showManagedSurface(
    {
      title: 'AGI Workforce, Skills',
      placeholder: 'Pick a skill to turn it on or off',
      empty: 'No skills are loaded in this workspace',
      load: async () => {
        const result = await adapter.call<SkillListResponse>('skills');
        if (result.status !== 'ok') return result;
        const items: ManagedItem[] = [
          {
            label: '$(add) Create a skill',
            detail: 'Write a new personal or project skill and open it to edit',
            followUp: {
              run: async () => {
                await createSkill();
                return undefined;
              },
              reopen: false,
            },
          },
        ];
        if (installs) {
          items.push({
            label: '$(cloud-download) Install a skill',
            detail: 'Copy a skill folder, the one that holds SKILL.md, into your skills',
            followUp: { run: () => installSkillFromFolder(adapter), reopen: true },
          });
        }
        if (result.value.skills.some((skill) => !skill.consented)) {
          items.push({
            label: '$(shield) Allow this folder’s project skills',
            detail: 'Project skills load only after you allow them for this workspace',
            run: () => adapter.call('skillsConsent', true),
          });
        }
        for (const skill of result.value.skills) {
          items.push({
            label: toggleLabel(skill.name, skill.enabled && skill.consented),
            description: `${skill.scope}${skill.consented ? '' : ', not allowed yet'}`,
            detail: [skill.description, ...skillRequirements(skill)].join(' · '),
            run: () => adapter.call('skillsSetEnabled', skill.name, !skill.enabled),
            ...(installs && skill.scope === 'user'
              ? {
                  actions: [
                    removeAction(async () =>
                      (await confirmRemoval(
                        `Remove the skill “${skill.name}”?`,
                        'Its folder is deleted from your skills, and it stops loading in every workspace. This cannot be undone.',
                      ))
                        ? adapter.call('skillsRemove', skill.name)
                        : undefined,
                    ),
                  ],
                }
              : {}),
          });
        }
        return { status: 'ok', value: items };
      },
    },
    'skills',
  );
}

async function installPlugin(adapter: CliCapabilityAdapter): ReturnType<ManagedRun> {
  const source = await vscode.window.showInputBox({
    title: 'AGI Workforce, Install a plugin',
    prompt: 'A Git URL or a plugin folder on this computer',
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === '' ? 'Enter where the plugin comes from.' : undefined,
  });
  if (source === undefined) return undefined;
  const integrity = await vscode.window.showInputBox({
    title: 'AGI Workforce, Install a plugin',
    prompt:
      'Its sha256 pin, as sha256:<hex>. Leave empty to require the publisher’s signature instead.',
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === '' || value.trim().startsWith('sha256:')
        ? undefined
        : 'A pin starts with sha256:',
  });
  if (integrity === undefined) return undefined;
  const confirmed = await confirmInstall(
    `Install the plugin from ${source.trim()}?`,
    'Its skills, commands, hooks and MCP servers run on this computer with your permissions. Install plugins only from publishers you trust.',
    'Install',
  );
  if (!confirmed) return undefined;
  return adapter.call('pluginsInstall', {
    source: source.trim(),
    ...(integrity.trim() === '' ? {} : { integrity: integrity.trim() }),
  });
}

async function updatePlugin(
  adapter: CliCapabilityAdapter,
  plugin: PluginListResponse['plugins'][number],
): ReturnType<ManagedRun> {
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('pluginUpdate.progress', { name: plugin.name }),
    },
    () => adapter.call<PluginUpdate>('pluginsUpdate', plugin.id),
  );
  if (result.status !== 'ok') return result;
  const { updated, previousVersion, version } = result.value;
  const name = plugin.name;
  void vscode.window.showInformationMessage(
    !updated
      ? t('pluginUpdate.upToDate', { name })
      : version === undefined
        ? t('pluginUpdate.updated', { name })
        : previousVersion === undefined || previousVersion === version
          ? t('pluginUpdate.updatedTo', { name, to: version })
          : t('pluginUpdate.updatedFromTo', { name, from: previousVersion, to: version }),
  );
  return undefined;
}

export async function managePlugins(adapter: CliCapabilityAdapter): Promise<void> {
  const [installs, updates] = await Promise.all([
    adapter.offers('installs'),
    adapter.offers('pluginUpdates'),
  ]);
  return showManagedSurface(
    {
      title: 'AGI Workforce, Plugins',
      placeholder: 'Pick a plugin to turn it on or off',
      empty: installs
        ? 'No plugins are installed yet'
        : 'No plugins are installed. Install one with agi plugin install.',
      load: async () => {
        const [result, skills] = await Promise.all([
          adapter.call<PluginListResponse>('plugins'),
          adapter.call<SkillListResponse>('skills'),
        ]);
        if (result.status !== 'ok') return result;
        const pluginSkills = skills.status === 'ok' ? skills.value.skills : [];
        const includedSkills = (pluginPath: string): string[] =>
          pluginSkills
            .filter((skill) => skill.scope === 'plugin' && skill.path.startsWith(pluginPath))
            .map((skill) => skill.name);
        const items: ManagedItem[] = installs
          ? [
              {
                label: '$(cloud-download) Install a plugin',
                detail: 'From a Git URL or a folder, signed by its publisher or pinned by sha256',
                followUp: { run: () => installPlugin(adapter), reopen: true },
              },
            ]
          : [];
        for (const plugin of result.value.plugins) {
          const actions: ManagedAction[] = [];
          if (updates && plugin.source === 'user') {
            actions.push({
              button: {
                iconPath: new vscode.ThemeIcon('sync'),
                tooltip: t('pluginUpdate.action'),
              },
              followUp: { run: () => updatePlugin(adapter, plugin), reopen: true },
            });
          }
          if (installs && plugin.source === 'user') {
            actions.push(
              removeAction(async () =>
                (await confirmRemoval(
                  `Remove the plugin “${plugin.name}”?`,
                  'It is deleted from this computer with the skills, commands, hooks and servers it adds. Installing it again needs its source.',
                ))
                  ? adapter.call('pluginsRemove', plugin.id)
                  : undefined,
              ),
            );
          }
          items.push({
            label: toggleLabel(plugin.name, plugin.enabled),
            description: [plugin.version, plugin.source].filter(Boolean).join(', '),
            detail:
              includedSkills(plugin.path).length === 0
                ? plugin.path
                : `Skills: ${includedSkills(plugin.path).join(', ')}`,
            run: () => adapter.call('pluginsSetEnabled', plugin.id, !plugin.enabled),
            ...(actions.length === 0 ? {} : { actions }),
          });
        }
        return { status: 'ok', value: items };
      },
    },
    'plugins',
  );
}

function splitCommandLine(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
}

async function askNamedValues(
  title: string,
  noun: string,
): Promise<Record<string, string> | undefined> {
  const values: Record<string, string> = {};
  for (;;) {
    const name = await vscode.window.showInputBox({
      title,
      prompt: `Add ${noun} by name, or leave empty to finish`,
      ignoreFocusOut: true,
    });
    if (name === undefined) return undefined;
    if (name.trim() === '') return values;
    const value = await vscode.window.showInputBox({
      title,
      prompt: `Value of ${name.trim()}`,
      password: true,
      ignoreFocusOut: true,
    });
    if (value === undefined) return undefined;
    values[name.trim()] = value;
  }
}

async function addMcpServer(
  adapter: CliCapabilityAdapter,
  existing: readonly string[],
): ReturnType<ManagedRun> {
  const title = 'AGI Workforce, Add an MCP server';
  const name = await vscode.window.showInputBox({
    title,
    prompt: 'A name for the server',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === '' ? 'The server needs a name.' : undefined),
  });
  if (name === undefined) return undefined;
  const overwrite = existing.includes(name.trim());
  if (overwrite) {
    const replace = await vscode.window.showWarningMessage(
      `Replace the MCP server “${name.trim()}”?`,
      {
        modal: true,
        detail:
          'Its command or address, environment variables and headers are replaced with the ones you enter next.',
      },
      'Replace',
    );
    if (replace !== 'Replace') return undefined;
  }
  const kind = await vscode.window.showQuickPick(
    [
      {
        label: 'Local command',
        detail: 'Starts on this computer and talks over stdio',
        value: 'stdio' as const,
      },
      { label: 'Remote server over HTTP', detail: 'Reached at a URL', value: 'http' as const },
      {
        label: 'Remote server over SSE',
        detail: 'Reached at a URL with server-sent events',
        value: 'sse' as const,
      },
    ],
    { title, placeHolder: 'How the server runs', ignoreFocusOut: true },
  );
  if (kind === undefined) return undefined;
  if (kind.value === 'stdio') {
    const line = await vscode.window.showInputBox({
      title,
      prompt: 'The command that starts the server, with its arguments',
      ignoreFocusOut: true,
      validateInput: (value) =>
        splitCommandLine(value).length === 0 ? 'Enter a command.' : undefined,
    });
    if (line === undefined) return undefined;
    const env = await askNamedValues(title, 'an environment variable');
    if (env === undefined) return undefined;
    const confirmed = await confirmInstall(
      `Add the MCP server “${name.trim()}”?`,
      `AGI starts ${line.trim()} on this computer, with your permissions, whenever a chat needs its tools.`,
      'Add',
    );
    if (!confirmed) return undefined;
    const [command, ...args] = splitCommandLine(line);
    return adapter.call('mcpAdd', {
      name: name.trim(),
      command,
      args,
      env,
      headers: {},
      overwrite,
    });
  }
  const url = await vscode.window.showInputBox({
    title,
    prompt: 'The server’s URL',
    ignoreFocusOut: true,
    validateInput: (value) => {
      try {
        const protocol = new URL(value.trim()).protocol;
        return protocol === 'https:' || protocol === 'http:'
          ? undefined
          : 'Enter an http or https URL.';
      } catch {
        return 'Enter an http or https URL.';
      }
    },
  });
  if (url === undefined) return undefined;
  const headers = await askNamedValues(title, 'a request header');
  if (headers === undefined) return undefined;
  const confirmed = await confirmInstall(
    `Add the MCP server “${name.trim()}”?`,
    `Chats send tool calls, and the data in them, to ${url.trim()}.`,
    'Add',
  );
  if (!confirmed) return undefined;
  return adapter.call('mcpAdd', {
    name: name.trim(),
    url: url.trim(),
    transport: kind.value,
    args: [],
    env: {},
    headers,
    overwrite,
  });
}

async function showMcpServerTools(
  adapter: CliCapabilityAdapter,
  name: string,
): ReturnType<ManagedRun> {
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `AGI Workforce: starting ${name}` },
    () => adapter.call<McpServerToolsResponse>('mcpTools', name),
  );
  if (result.status !== 'ok') return result;
  const { tools, prompts = [], resources = [], warnings = [] } = result.value;
  const items: vscode.QuickPickItem[] = [
    { label: 'Tools', kind: vscode.QuickPickItemKind.Separator },
    ...tools.map((tool) => ({ label: `$(tools) ${tool.name}`, detail: tool.description })),
    ...(prompts.length === 0
      ? []
      : [
          { label: 'Prompts', kind: vscode.QuickPickItemKind.Separator },
          ...prompts.map((prompt) => ({
            label: `$(comment) ${prompt.name}`,
            detail: prompt.description,
            ...((prompt.arguments ?? []).length === 0
              ? {}
              : {
                  description: (prompt.arguments ?? []).map((argument) => argument.name).join(', '),
                }),
          })),
        ]),
    ...(resources.length === 0
      ? []
      : [
          { label: 'Resources', kind: vscode.QuickPickItemKind.Separator },
          ...resources.map((resource) => ({
            label: `$(file) ${resource.name}`,
            description: resource.uri,
            ...(resource.description === undefined ? {} : { detail: resource.description }),
          })),
        ]),
    ...warnings.map((warning) => ({ label: `$(warning) ${warning}`, alwaysShow: true })),
  ];
  await vscode.window.showQuickPick(items, {
    title: `AGI Workforce, ${name}`,
    placeHolder:
      tools.length === 0 ? 'This server offers no tools' : 'What this server offers the agent',
    matchOnDetail: true,
  });
  return undefined;
}

async function testMcpServer(adapter: CliCapabilityAdapter, name: string): ReturnType<ManagedRun> {
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `AGI Workforce: testing ${name}` },
    () => adapter.call<McpServerProbe>('mcpTest', name),
  );
  if (result.status !== 'ok') return result;
  const probe = result.value;
  if (probe.connected) {
    void vscode.window.showInformationMessage(
      tPlural('mcp.connected', probe.toolCount, { name, ms: probe.elapsedMs }),
    );
    return undefined;
  }
  return {
    status: 'failed',
    reason: `${name} did not connect${probe.error === undefined ? '' : `: ${probe.error}`}`,
  };
}

async function showMcpServerDetails(
  adapter: CliCapabilityAdapter,
  details: McpServerDetailsProvider,
  name: string,
): ReturnType<ManagedRun> {
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t('mcpDetails.checking', { name }) },
    () => adapter.call<McpServerInspection>('mcpInspect', name),
  );
  if (result.status !== 'ok') return result;
  await details.show(result.value);
  return undefined;
}

export async function manageMcpServers(
  adapter: CliCapabilityAdapter,
  details: McpServerDetailsProvider,
): Promise<void> {
  const [installs, toolLists, inspects] = await Promise.all([
    adapter.offers('installs'),
    adapter.offers('mcpTools'),
    adapter.offers('mcpInspect'),
  ]);
  return showManagedSurface(
    {
      title: 'AGI Workforce, MCP servers',
      placeholder: 'Pick a server that needs sign-in to sign in',
      empty: installs
        ? 'No MCP servers are configured yet'
        : 'No MCP servers are configured. Add one with agi mcp add.',
      load: async () => {
        const result = await adapter.call<McpServerListResponse>('mcpServers');
        if (result.status !== 'ok') return result;
        const names = result.value.servers.map((server) => server.name);
        const items: ManagedItem[] = installs
          ? [
              {
                label: '$(add) Add an MCP server',
                detail: 'A local command or a remote URL, saved in your AGI CLI settings',
                followUp: { run: () => addMcpServer(adapter, names), reopen: true },
              },
            ]
          : [];
        for (const server of result.value.servers) {
          const actions: ManagedAction[] = [
            ...(inspects && server.status !== 'blocked'
              ? [
                  {
                    button: {
                      iconPath: new vscode.ThemeIcon('info'),
                      tooltip: t('mcpDetails.action'),
                    },
                    followUp: {
                      run: () => showMcpServerDetails(adapter, details, server.name),
                      reopen: false,
                    },
                  },
                ]
              : []),
            ...(toolLists && server.status !== 'blocked'
              ? [
                  {
                    button: { iconPath: new vscode.ThemeIcon('list-tree'), tooltip: 'Show tools' },
                    followUp: {
                      run: () => showMcpServerTools(adapter, server.name),
                      reopen: true,
                    },
                  },
                  {
                    button: {
                      iconPath: new vscode.ThemeIcon('debug-start'),
                      tooltip: 'Test connection',
                    },
                    followUp: { run: () => testMcpServer(adapter, server.name), reopen: true },
                  },
                ]
              : []),
          ];
          if (installs && server.scope === 'user') {
            actions.push(
              removeAction(async () =>
                (await confirmRemoval(
                  `Remove the MCP server “${server.name}”?`,
                  'Its entry is deleted from your AGI CLI settings with any environment variables and headers saved for it, and chats stop using its tools.',
                ))
                  ? adapter.call('mcpRemove', server.name)
                  : undefined,
              ),
            );
          }
          items.push({
            label: `$(${server.status === 'blocked' ? 'lock' : server.status === 'needs_auth' ? 'key' : 'plug'}) ${server.name}`,
            description: `${MCP_STATUS_LABELS[server.status]}, ${server.transport}, ${server.scope}`,
            ...([server.policyRefusal, server.url].filter(Boolean).length === 0
              ? {}
              : { detail: [server.policyRefusal, server.url].filter(Boolean).join(' · ') }),
            ...(server.status === 'needs_auth'
              ? { run: () => adapter.call('mcpLogin', server.name) }
              : {}),
            ...(actions.length === 0 ? {} : { actions }),
          });
        }
        return { status: 'ok', value: items };
      },
    },
    'MCP servers',
  );
}

async function addHook(adapter: CliCapabilityAdapter): ReturnType<ManagedRun> {
  const title = 'AGI Workforce, Add a hook';
  const event = await vscode.window.showInputBox({
    title,
    prompt:
      'The event the hook runs on. If the AGI CLI does not know it, it lists the ones it does.',
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === '' || /\s/u.test(value.trim()) ? 'Enter one event name.' : undefined,
  });
  if (event === undefined) return undefined;
  const command = await vscode.window.showInputBox({
    title,
    prompt: `The command to run on ${event.trim()}`,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === '' ? 'Enter a command.' : undefined),
  });
  if (command === undefined) return undefined;
  const confirmed = await confirmInstall(
    `Add this ${event.trim()} hook?`,
    `${command.trim()} runs on this computer, with your permissions, every time ${event.trim()} happens.`,
    'Add',
  );
  if (!confirmed) return undefined;
  return adapter.call('hooksAdd', { event: event.trim(), command: command.trim() });
}

export async function manageHooks(adapter: CliCapabilityAdapter): Promise<void> {
  const installs = await adapter.offers('installs');
  return showManagedSurface(
    {
      title: 'AGI Workforce, Hooks',
      placeholder: 'Commands the AGI CLI runs on agent events',
      empty: 'No hooks are configured',
      load: async () => {
        const result = await adapter.call<HookListResponse>('hooks');
        if (result.status !== 'ok') return result;
        const items: ManagedItem[] = installs
          ? [
              {
                label: '$(add) Add a hook',
                detail: 'Run a command on an agent event, saved in your hooks file',
                followUp: { run: () => addHook(adapter), reopen: true },
              },
            ]
          : [];
        for (const hook of result.value.hooks) {
          const position = hook.position;
          items.push({
            label: `$(symbol-event) ${hook.event}`,
            description: `${hook.scope}${hook.trusted ? '' : ', does not run'}`,
            detail: hook.command,
            ...(installs && hook.scope === 'user' && position !== undefined
              ? {
                  actions: [
                    removeAction(async () =>
                      (await confirmRemoval(
                        `Remove this ${hook.event} hook?`,
                        `“${hook.command}” stops running and is deleted from your hooks file.`,
                      ))
                        ? adapter.call('hooksRemove', { event: hook.event, position })
                        : undefined,
                    ),
                  ],
                }
              : {}),
          });
        }
        return { status: 'ok', value: items };
      },
    },
    'hooks',
  );
}

const SAVED_PERMISSION_KINDS = {
  command: 'savedApprovals.kindCommand',
  file: 'savedApprovals.kindFile',
  exec_policy: 'savedApprovals.kindPolicy',
} as const;

export interface SessionPermissions {
  mode(): ExtensionAgentMode;
  disallowedTools(): readonly string[];
  setDisallowedTools(tools: readonly string[]): void;
}

const MODE_SUMMARIES: Record<ExtensionAgentMode, { label: string; detail: string }> = {
  ask: { label: 'Ask before edits', detail: 'Every edit and command asks you first' },
  auto: {
    label: 'Auto safe operations',
    detail: 'Reads run on their own; writes and commands ask you first',
  },
  plan: { label: 'Plan mode', detail: 'Reads only; nothing changes until you approve the plan' },
  bypass: { label: 'Bypass permissions', detail: 'Nothing asks first, including commands' },
};

const SESSION_TOOLS: readonly { label: string; detail: string; specs: readonly string[] }[] = [
  { label: 'Shell commands', detail: 'Run commands in a terminal', specs: ['Bash'] },
  { label: 'File edits', detail: 'Change existing files and apply patches', specs: ['Edit'] },
  { label: 'New files', detail: 'Create or overwrite whole files', specs: ['Write'] },
  { label: 'Web search', detail: 'Search the web', specs: ['WebSearch'] },
  { label: 'Web pages', detail: 'Read a page by its URL', specs: ['WebFetch'] },
  {
    label: 'Browser',
    detail: 'Open, read and act on pages in the paired browser',
    specs: [
      'browser_read_page',
      'browser_find',
      'browser_click',
      'browser_type',
      'browser_fill_form',
      'browser_navigate',
      'browser_history',
      'browser_screenshot',
      'browser_console',
      'browser_network',
    ],
  },
];

function disabledToolLabels(disallowed: readonly string[]): string[] {
  return SESSION_TOOLS.filter((tool) => tool.specs.every((spec) => disallowed.includes(spec))).map(
    (tool) => tool.label,
  );
}

export async function chooseSessionTools(
  adapter: CliCapabilityAdapter,
  session: SessionPermissions,
): Promise<void> {
  if (!(await adapter.offers('turnToolFilters'))) {
    void vscode.window.showErrorMessage(
      `AGI Workforce: ${CLI_CAPABILITY_REQUIREMENT} to choose the tools a session may use.`,
    );
    return;
  }
  const disallowed = session.disallowedTools();
  const items = SESSION_TOOLS.map((tool) => ({
    label: tool.label,
    detail: tool.detail,
    picked: !tool.specs.every((spec) => disallowed.includes(spec)),
    specs: tool.specs,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'AGI Workforce, Tools for this session',
    placeHolder: 'Tick the tools the agent may use. Your choice applies from your next message.',
    canPickMany: true,
    ignoreFocusOut: true,
  });
  if (picked === undefined) return;
  session.setDisallowedTools(
    items.filter((item) => !picked.includes(item)).flatMap((item) => [...item.specs]),
  );
}

const RULE_DECISIONS: Record<PermissionRule['decision'], { icon: string; label: string }> = {
  allow: { icon: 'pass', label: 'Always allowed' },
  ask: { icon: 'question', label: 'Asks first' },
  deny: { icon: 'circle-slash', label: 'Blocked' },
};

const RULE_KINDS: Record<PermissionRule['kind'], string> = {
  command: 'Shell command',
  domain: 'Website',
  file: 'File edit',
  exec_policy: 'Command policy rule',
  mcp: 'MCP server tool',
};

async function addPermissionRule(adapter: CliCapabilityAdapter): ReturnType<ManagedRun> {
  const title = 'AGI Workforce, Add a permission rule';
  const kind = await vscode.window.showQuickPick(
    [
      {
        label: 'Website',
        detail: 'A host such as example.com or *.example.com that web tools may reach',
        value: 'domain' as const,
        prompt: 'The website, such as example.com or *.example.com',
      },
      {
        label: 'MCP server or tool',
        detail: 'Every tool from a server, or one tool, written server or server/tool',
        value: 'mcp' as const,
        prompt: 'The server, or server/tool, such as github or github/create_issue',
      },
      {
        label: 'Shell command',
        detail: 'A command such as npm test, or a command family such as git:*',
        value: 'command' as const,
        prompt: 'The command, such as npm test or git:*',
      },
    ],
    { title, placeHolder: 'What the rule applies to', ignoreFocusOut: true },
  );
  if (kind === undefined) return undefined;
  const target = await vscode.window.showInputBox({
    title,
    prompt: kind.prompt,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === '' ? 'Name what the rule applies to.' : undefined),
  });
  if (target === undefined) return undefined;
  const decision = await vscode.window.showQuickPick(
    (['allow', 'ask', 'deny'] as const).map((value) => ({
      label: RULE_DECISIONS[value].label,
      value,
    })),
    {
      title,
      placeHolder: `What happens when the agent uses ${target.trim()}`,
      ignoreFocusOut: true,
    },
  );
  if (decision === undefined) return undefined;
  return adapter.call('permissionRulesAdd', {
    kind: kind.value,
    target: target.trim(),
    decision: decision.value,
  });
}

async function loadPermissionsView(
  adapter: CliCapabilityAdapter,
  session: SessionPermissions,
  offersTools: boolean,
  offersTrust: boolean,
): Promise<CliCapabilityResult<ManagedItem[]>> {
  const [rules, trusted] = await Promise.all([
    adapter.call<PermissionRuleList>('permissionRules'),
    offersTrust ? adapter.call<TrustedFolderList>('trustedFolders') : Promise.resolve(undefined),
  ]);
  if (rules.status !== 'ok') return rules;
  const mode = MODE_SUMMARIES[session.mode()];
  const disabled = disabledToolLabels(session.disallowedTools());
  const items: ManagedItem[] = [
    { label: 'This session', kind: vscode.QuickPickItemKind.Separator },
    {
      label: `$(shield) ${mode.label}`,
      description: 'Mode',
      detail: mode.detail,
      followUp: {
        run: async () => {
          await vscode.commands.executeCommand('agi-workforce.setAgentMode');
          return undefined;
        },
        reopen: true,
      },
    },
    ...(offersTools
      ? [
          {
            label: `$(tools) ${disabled.length === 0 ? 'Every tool is on' : `Turned off: ${disabled.join(', ')}`}`,
            description: 'Tools',
            detail: 'Pick to choose which tools this session may use',
            followUp: {
              run: async () => {
                await chooseSessionTools(adapter, session);
                return undefined;
              },
              reopen: true,
            },
          },
        ]
      : []),
    { label: 'Rules for every session', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(add) Add a rule',
      detail: 'Allow, ask first or block a website, an MCP server or tool, or a shell command',
      followUp: { run: () => addPermissionRule(adapter), reopen: true },
    },
  ];
  for (const rule of rules.value.rules) {
    const decision = RULE_DECISIONS[rule.decision];
    items.push({
      label: `$(${decision.icon}) ${rule.label}`,
      description: `${decision.label}, ${RULE_KINDS[rule.kind]}`,
      actions: [
        removeAction(async () =>
          (await confirmRemoval(
            'Remove this permission rule?',
            `“${rule.label}” goes back to asking you first, in every session.`,
          ))
            ? adapter.call('savedPermissionsRemove', rule.id)
            : undefined,
        ),
      ],
    });
  }
  if (trusted !== undefined) {
    items.push({ label: 'Trusted folders', kind: vscode.QuickPickItemKind.Separator });
    if (trusted.status !== 'ok') {
      items.push({ label: `$(warning) ${trusted.reason}`, alwaysShow: true });
    } else if (trusted.value.folders.length === 0) {
      items.push({ label: 'No folders are trusted yet', alwaysShow: true });
    }
    for (const folder of trusted.status === 'ok' ? trusted.value.folders : []) {
      items.push({
        label: `$(folder) ${folder.path}`,
        description: 'The agent may read, edit and run commands here',
        ...(folder.trustedAt === undefined || folder.trustedAt === null
          ? {}
          : { detail: `Trusted ${new Date(folder.trustedAt).toLocaleString()}` }),
        actions: [
          {
            button: { iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Stop trusting' },
            followUp: {
              run: async () => {
                const choice = await vscode.window.showWarningMessage(
                  `Stop trusting ${folder.path}?`,
                  {
                    modal: true,
                    detail:
                      'The AGI CLI asks again before it reads, edits or runs anything in this folder.',
                  },
                  'Stop Trusting',
                );
                return choice === 'Stop Trusting'
                  ? adapter.call('trustedFoldersRevoke', folder.path)
                  : undefined;
              },
              reopen: true,
            },
          },
        ],
      });
    }
  }
  return { status: 'ok', value: items };
}

export async function manageSavedApprovals(
  adapter: CliCapabilityAdapter,
  session: SessionPermissions,
): Promise<void> {
  const [rules, tools, trust] = await Promise.all([
    adapter.offers('permissionRules'),
    adapter.offers('turnToolFilters'),
    adapter.offers('trust'),
  ]);
  if (rules) {
    return showManagedSurface(
      {
        title: 'AGI Workforce, Permissions',
        placeholder: 'What the agent may do, in this session and in every session',
        empty: t('savedApprovals.empty'),
        load: () => loadPermissionsView(adapter, session, tools, trust),
      },
      'permissions',
    );
  }
  return showManagedSurface(
    {
      title: t('savedApprovals.title'),
      placeholder: t('savedApprovals.placeholder'),
      empty: t('savedApprovals.empty'),
      load: async () => {
        const result = await adapter.call<SavedPermissionList>('savedPermissions');
        if (result.status !== 'ok') return result;
        const items: ManagedItem[] = result.value.permissions.map((permission) => {
          const allowed = permission.decision === 'allow';
          return {
            label: `$(${allowed ? 'pass' : 'circle-slash'}) ${permission.label}`,
            description: allowed ? t('savedApprovals.allowed') : t('savedApprovals.denied'),
            detail: t(SAVED_PERMISSION_KINDS[permission.kind]),
            actions: [
              removeAction(async () =>
                (await confirmRemoval(
                  t('savedApprovals.removeTitle'),
                  allowed
                    ? t('savedApprovals.removeAllowed', { label: permission.label })
                    : t('savedApprovals.removeDenied', { label: permission.label }),
                ))
                  ? adapter.call('savedPermissionsRemove', permission.id)
                  : undefined,
              ),
            ],
          };
        });
        return { status: 'ok', value: items };
      },
    },
    t('savedApprovals.noun'),
  );
}

async function setProviderKey(
  adapter: CliCapabilityAdapter,
  provider: ProviderKeyList['providers'][number],
): ReturnType<ManagedRun> {
  const apiKey = await vscode.window.showInputBox({
    title: `AGI Workforce, ${provider.label} API key`,
    prompt: `Paste your ${provider.label} API key. Turns you send to ${provider.label} models are billed to it.`,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === '' ? 'Paste a key.' : undefined),
  });
  if (apiKey === undefined) return undefined;
  const result = await adapter.call<ProviderKeyList>(
    'providerKeysSet',
    provider.provider,
    apiKey.trim(),
  );
  if (result.status === 'ok') {
    void vscode.window.showInformationMessage(
      `AGI Workforce: ${provider.label} models are now under Your providers in the model picker.`,
    );
  }
  return result;
}

export async function manageProviderKeys(adapter: CliCapabilityAdapter): Promise<void> {
  return showManagedSurface(
    {
      title: 'AGI Workforce, Provider API keys',
      placeholder: 'Pick a provider to add or replace your own API key',
      empty: 'The AGI CLI lists no providers that take a key',
      load: async () => {
        const result = await adapter.call<ProviderKeyList>('providerKeys');
        if (result.status !== 'ok') return result;
        return {
          status: 'ok',
          value: result.value.providers.map((provider) => ({
            label: `$(${provider.configured ? 'key' : 'circle-large-outline'}) ${provider.label}`,
            description: provider.configured ? 'Key saved' : 'No key',
            detail: `Saved in ${result.value.storage}, or read from ${provider.envVar}`,
            followUp: { run: () => setProviderKey(adapter, provider), reopen: true },
            ...(provider.configured
              ? {
                  actions: [
                    removeAction(async () =>
                      (await confirmRemoval(
                        `Remove your ${provider.label} API key?`,
                        `It is deleted from ${result.value.storage}, and ${provider.label} models leave Your providers until you add a key again.`,
                      ))
                        ? adapter.call('providerKeysRemove', provider.provider)
                        : undefined,
                    ),
                  ],
                }
              : {}),
          })),
        };
      },
    },
    'provider API keys',
  );
}
