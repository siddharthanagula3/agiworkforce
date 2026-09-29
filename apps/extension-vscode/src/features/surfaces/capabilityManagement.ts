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
  PluginUpdate,
  ProviderKeyList,
  SavedPermissionList,
} from '../../integrations/localRuntimeClient';
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
            detail: skill.description,
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
            ...(inspects
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
            ...(toolLists
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
            label: `$(${server.status === 'needs_auth' ? 'key' : 'plug'}) ${server.name}`,
            description: `${MCP_STATUS_LABELS[server.status]}, ${server.transport}, ${server.scope}`,
            ...(server.url === undefined ? {} : { detail: server.url }),
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

const PROVIDER_KEY_SHAPE = /^\S{1,4096}$/u;

async function setProviderKey(
  adapter: CliCapabilityAdapter,
  provider: ProviderKeyList['providers'][number],
): Promise<CliCapabilityResult<unknown> | undefined> {
  const key = await vscode.window.showInputBox({
    title: t('providerKeys.prompt', { provider: provider.label }),
    prompt: provider.envVar,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() === '' || PROVIDER_KEY_SHAPE.test(value.trim())
        ? undefined
        : t('providerKeys.prompt', { provider: provider.label }),
  });
  if (key === undefined || key.trim() === '') return undefined;
  const result = await adapter.call('providerKeysSet', provider.id, key.trim());
  if (result.status === 'ok') {
    void vscode.window.showInformationMessage(
      t('providerKeys.saved', { provider: provider.label }),
    );
  }
  return result;
}

export async function manageProviderKeys(adapter: CliCapabilityAdapter): Promise<void> {
  return showManagedSurface(
    {
      title: t('providerKeys.title'),
      placeholder: t('providerKeys.placeholder'),
      empty: t('providerKeys.empty'),
      load: async () => {
        const result = await adapter.call<ProviderKeyList>('providerKeys');
        if (result.status !== 'ok') return result;
        const items: ManagedItem[] = result.value.providers.map((provider) => ({
          label: `$(${provider.source === undefined ? 'key' : 'pass'}) ${provider.label}`,
          description:
            provider.source === 'stored'
              ? t('providerKeys.stored')
              : provider.source === 'environment'
                ? t('providerKeys.fromEnvironment', { envVar: provider.envVar })
                : t('providerKeys.notSet'),
          detail: t('providerKeys.setDetail'),
          followUp: { run: () => setProviderKey(adapter, provider), reopen: true },
          ...(provider.source === 'stored'
            ? {
                actions: [
                  removeAction(async () =>
                    (await confirmRemoval(
                      t('providerKeys.removeTitle', { provider: provider.label }),
                      t('providerKeys.removeDetail', { provider: provider.label }),
                    ))
                      ? adapter.call('providerKeysRemove', provider.id)
                      : undefined,
                  ),
                ],
              }
            : {}),
        }));
        return { status: 'ok', value: items };
      },
    },
    t('providerKeys.noun'),
  );
}

async function addPermissionRule(
  adapter: CliCapabilityAdapter,
): Promise<CliCapabilityResult<unknown> | undefined> {
  const target = await vscode.window.showQuickPick(
    [
      {
        label: t('savedApprovals.targetCommand'),
        detail: t('savedApprovals.targetCommandDetail'),
        target: 'command' as const,
      },
      {
        label: t('savedApprovals.targetDomain'),
        detail: t('savedApprovals.targetDomainDetail'),
        target: 'domain' as const,
      },
    ],
    { title: t('savedApprovals.add') },
  );
  if (target === undefined) return undefined;
  const decision = await vscode.window.showQuickPick(
    [
      { label: t('savedApprovals.decisionAllow'), decision: 'allow' as const },
      { label: t('savedApprovals.decisionDeny'), decision: 'deny' as const },
    ],
    { title: target.label },
  );
  if (decision === undefined) return undefined;
  const pattern = await vscode.window.showInputBox({
    title: `${decision.label}: ${target.label}`,
    prompt:
      target.target === 'command'
        ? t('savedApprovals.patternCommand')
        : t('savedApprovals.patternDomain'),
    validateInput: (value) => (value.trim() === '' ? target.detail : undefined),
  });
  if (pattern === undefined || pattern.trim() === '') return undefined;
  if (
    target.target === 'command' &&
    decision.decision === 'allow' &&
    !(await confirmInstall(
      t('savedApprovals.allowCommandTitle', { pattern: pattern.trim() }),
      t('savedApprovals.allowCommandDetail'),
      t('savedApprovals.allowConfirm'),
    ))
  ) {
    return undefined;
  }
  return adapter.call('savedPermissionsAdd', {
    target: target.target,
    decision: decision.decision,
    pattern: pattern.trim(),
  });
}

export async function manageSavedApprovals(adapter: CliCapabilityAdapter): Promise<void> {
  return showManagedSurface(
    {
      title: t('savedApprovals.title'),
      placeholder: t('savedApprovals.placeholder'),
      empty: t('savedApprovals.empty'),
      load: async () => {
        const result = await adapter.call<SavedPermissionList>('savedPermissions');
        if (result.status !== 'ok') return result;
        const addItems: ManagedItem[] = (await adapter.offers('permissionRules'))
          ? [
              {
                label: `$(add) ${t('savedApprovals.add')}`,
                detail: t('savedApprovals.addDetail'),
                followUp: { run: () => addPermissionRule(adapter), reopen: true },
              },
            ]
          : [];
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
        return { status: 'ok', value: [...addItems, ...items] };
      },
    },
    t('savedApprovals.noun'),
  );
}
