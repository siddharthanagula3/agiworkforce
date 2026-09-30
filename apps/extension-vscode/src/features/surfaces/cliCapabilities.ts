import { getActiveWorkspaceFolder } from '../../platform/workspaceFolders';
import type { AppServerCapabilities } from '../../integrations/localRuntimeClient';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';

export const CLI_CAPABILITY_REQUIREMENT = 'Needs AGI CLI 1.8';

export const CLI_CAPABILITY_METHODS = {
  skills: 'listSkills',
  skillsSetEnabled: 'setSkillEnabled',
  skillsConsent: 'setProjectSkillConsent',
  skillsInstall: 'installSkill',
  skillsRemove: 'removeSkill',
  plugins: 'listPlugins',
  pluginsSetEnabled: 'setPluginEnabled',
  pluginsInstall: 'installPlugin',
  pluginsRemove: 'removePlugin',
  mcpServers: 'listMcpServers',
  mcpLogin: 'loginMcpServer',
  mcpAdd: 'addMcpServer',
  mcpRemove: 'removeMcpServer',
  mcpTest: 'testMcpServer',
  mcpTools: 'listMcpServerTools',
  hooks: 'listHooks',
  hooksAdd: 'addHook',
  hooksRemove: 'removeHook',
  instructions: 'contextInstructions',
  commands: 'listCommands',
  runCommand: 'runCommand',
  readSettings: 'readSettings',
  writeSettings: 'writeSettings',
  accountStatus: 'accountStatus',
  accountLogin: 'startAccountLogin',
  accountLoginWait: 'waitForAccountLogin',
  accountToken: 'accountToken',
  savedPermissions: 'listSavedPermissions',
  savedPermissionsRemove: 'removeSavedPermission',
  mcpInspect: 'inspectMcpServer',
  pluginsUpdate: 'updatePlugin',
  memoryAdd: 'addMemory',
  worktreeCreate: 'createWorktree',
  worktreeList: 'listWorktrees',
  worktreeRemove: 'removeWorktree',
  pullRequestPlan: 'planPullRequest',
  pullRequestCreate: 'createPullRequest',
  permissionRules: 'listPermissionRules',
  permissionRulesAdd: 'addPermissionRule',
  trustedFolders: 'listTrustedFolders',
  trustedFoldersRevoke: 'revokeTrustedFolder',
  providerKeys: 'listProviderKeys',
  providerKeysSet: 'setProviderKey',
  providerKeysRemove: 'removeProviderKey',
} as const;

export type CliCapability = keyof typeof CLI_CAPABILITY_METHODS;

export type CliFamily = keyof Pick<
  AppServerCapabilities,
  | 'skills'
  | 'plugins'
  | 'mcp'
  | 'hooks'
  | 'instructions'
  | 'commands'
  | 'settings'
  | 'account'
  | 'installs'
  | 'mcpTools'
  | 'savedPermissions'
  | 'mcpInspect'
  | 'pluginUpdates'
  | 'memory'
  | 'worktrees'
  | 'pullRequests'
  | 'permissionRules'
  | 'trust'
  | 'providerKeys'
  | 'turnToolFilters'
>;

const CLI_CAPABILITY_FAMILIES: Record<CliCapability, CliFamily> = {
  skills: 'skills',
  skillsSetEnabled: 'skills',
  skillsConsent: 'skills',
  skillsInstall: 'installs',
  skillsRemove: 'installs',
  plugins: 'plugins',
  pluginsSetEnabled: 'plugins',
  pluginsInstall: 'installs',
  pluginsRemove: 'installs',
  mcpServers: 'mcp',
  mcpLogin: 'mcp',
  mcpAdd: 'installs',
  mcpRemove: 'installs',
  mcpTest: 'mcpTools',
  mcpTools: 'mcpTools',
  hooks: 'hooks',
  hooksAdd: 'installs',
  hooksRemove: 'installs',
  instructions: 'instructions',
  commands: 'commands',
  runCommand: 'commands',
  readSettings: 'settings',
  writeSettings: 'settings',
  accountStatus: 'account',
  accountLogin: 'account',
  accountLoginWait: 'account',
  accountToken: 'account',
  savedPermissions: 'savedPermissions',
  savedPermissionsRemove: 'savedPermissions',
  mcpInspect: 'mcpInspect',
  pluginsUpdate: 'pluginUpdates',
  memoryAdd: 'memory',
  worktreeCreate: 'worktrees',
  worktreeList: 'worktrees',
  worktreeRemove: 'worktrees',
  pullRequestPlan: 'pullRequests',
  pullRequestCreate: 'pullRequests',
  permissionRules: 'permissionRules',
  permissionRulesAdd: 'permissionRules',
  trustedFolders: 'trust',
  trustedFoldersRevoke: 'trust',
  providerKeys: 'providerKeys',
  providerKeysSet: 'providerKeys',
  providerKeysRemove: 'providerKeys',
};

const CLI_FAMILY_LABELS: Record<CliFamily, string> = {
  skills: 'skills',
  plugins: 'plugins',
  mcp: 'MCP servers',
  hooks: 'hooks',
  instructions: 'instructions',
  commands: 'commands',
  settings: 'settings',
  account: 'account sign-in',
  installs: 'installing and removing from VS Code',
  mcpTools: 'MCP server tool lists',
  savedPermissions: 'saved approvals',
  mcpInspect: 'MCP server details',
  pluginUpdates: 'updating plugins',
  memory: 'repository memory',
  worktrees: 'session worktrees',
  pullRequests: 'opening pull requests',
  permissionRules: 'permission rules',
  trust: 'trusted folders',
  providerKeys: 'provider API keys',
  turnToolFilters: 'choosing tools for a session',
};

export function cliCapabilityNotOffered(capability: CliCapability): string {
  return `The AGI CLI for this workspace does not offer ${CLI_FAMILY_LABELS[CLI_CAPABILITY_FAMILIES[capability]]}.`;
}

export type CliCapabilityResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string };

export interface CliCapabilityEntry {
  label: string;
  description?: string;
  detail?: string;
}

export interface CliWebSearchSetup {
  key?: string;
  logins: string[];
}

export interface CliAccountStatus {
  signedIn: boolean;
  email?: string;
  tier?: string;
  webSearch?: CliWebSearchSetup;
}

const LOGIN_TARGET = /^[A-Za-z0-9_-]{1,64}$/u;

function readWebSearchSetup(record: Record<string, unknown>): CliWebSearchSetup | undefined {
  const logins = record['webSearchLogins'];
  if (!Array.isArray(logins)) return undefined;
  const key = readString(record, ['webSearchKey']);
  return {
    ...(key === undefined ? {} : { key }),
    logins: logins.filter(
      (login): login is string => typeof login === 'string' && LOGIN_TARGET.test(login),
    ),
  };
}

export interface CliLoginChallenge {
  loginId: string;
  verificationUrl: string;
  userCode?: string;
}

export interface CliLoginGrant {
  outcome: 'completed' | 'expired' | 'failed';
  message?: string;
}

type CapabilityHost = Record<string, unknown>;

function readString(source: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return undefined;
}

export function normalizeCapabilityEntries(value: unknown): CliCapabilityEntry[] {
  const rows = Array.isArray(value)
    ? value
    : value !== null && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>).find(Array.isArray)
      : undefined;
  if (!Array.isArray(rows)) return [];
  const entries: CliCapabilityEntry[] = [];
  for (const row of rows) {
    if (typeof row === 'string') {
      if (row.trim() !== '') entries.push({ label: row.trim() });
      continue;
    }
    if (row === null || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const label = readString(record, ['name', 'title', 'label', 'id', 'command', 'path']);
    if (label === undefined) continue;
    const description = readString(record, ['description', 'summary', 'status', 'kind', 'version']);
    const detail = readString(record, ['detail', 'path', 'root', 'source', 'url', 'scope']);
    entries.push({
      label,
      ...(description === undefined ? {} : { description }),
      ...(detail === undefined ? {} : { detail }),
    });
  }
  return entries;
}

async function advertisedCapabilities(
  host: CapabilityHost,
): Promise<AppServerCapabilities | undefined> {
  const initialize = host['initialize'];
  if (typeof initialize !== 'function') return undefined;
  const handshake = (await (initialize as () => Promise<unknown>).apply(host)) as
    { capabilities?: AppServerCapabilities } | undefined;
  return handshake?.capabilities;
}

export class CliCapabilityAdapter {
  constructor(private readonly runtimes: LocalRuntimePool | undefined) {}

  private async host(): Promise<CapabilityHost | undefined> {
    if (this.runtimes === undefined) return undefined;
    const workspace = await getActiveWorkspaceFolder();
    if (workspace === undefined) return undefined;
    try {
      return this.runtimes.forWorkspace(workspace.uri.fsPath) as unknown as CapabilityHost;
    } catch {
      return undefined;
    }
  }

  async call<T>(capability: CliCapability, ...params: unknown[]): Promise<CliCapabilityResult<T>> {
    const host = await this.host();
    if (host === undefined) {
      return { status: 'unavailable', reason: 'Open a trusted workspace to reach the AGI CLI.' };
    }
    const method = host[CLI_CAPABILITY_METHODS[capability]];
    if (typeof method !== 'function') {
      return { status: 'unavailable', reason: CLI_CAPABILITY_REQUIREMENT };
    }
    try {
      const advertised = await advertisedCapabilities(host);
      if (advertised !== undefined && advertised[CLI_CAPABILITY_FAMILIES[capability]] !== true) {
        return { status: 'unavailable', reason: cliCapabilityNotOffered(capability) };
      }
      const value = (await (method as (...args: unknown[]) => Promise<unknown>).apply(
        host,
        params,
      )) as T;
      return { status: 'ok', value };
    } catch (error) {
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async offers(family: CliFamily): Promise<boolean> {
    const host = await this.host();
    if (host === undefined) return false;
    try {
      return (await advertisedCapabilities(host))?.[family] === true;
    } catch {
      return false;
    }
  }

  async listEntries(
    capability: Extract<
      CliCapability,
      'skills' | 'plugins' | 'mcpServers' | 'hooks' | 'commands' | 'instructions'
    >,
  ): Promise<CliCapabilityResult<CliCapabilityEntry[]>> {
    const result = await this.call<unknown>(capability);
    if (result.status !== 'ok') return result;
    return { status: 'ok', value: normalizeCapabilityEntries(result.value) };
  }

  async accountStatus(): Promise<CliCapabilityResult<CliAccountStatus>> {
    const result = await this.call<unknown>('accountStatus');
    if (result.status !== 'ok') return result;
    const record =
      result.value !== null && typeof result.value === 'object'
        ? (result.value as Record<string, unknown>)
        : {};
    const email = readString(record, ['email', 'account', 'user']);
    const tier = readString(record, ['tier', 'plan', 'planTier']);
    const webSearch = readWebSearchSetup(record);
    return {
      status: 'ok',
      value: {
        signedIn: record['signedIn'] === true,
        ...(email === undefined ? {} : { email }),
        ...(tier === undefined ? {} : { tier }),
        ...(webSearch === undefined ? {} : { webSearch }),
      },
    };
  }

  async accountToken(): Promise<string | undefined> {
    const result = await this.call<unknown>('accountToken');
    if (result.status !== 'ok') return undefined;
    if (typeof result.value === 'string' && result.value !== '') return result.value;
    if (result.value === null || typeof result.value !== 'object') return undefined;
    return readString(result.value as Record<string, unknown>, ['token', 'accessToken']);
  }

  async login(): Promise<CliCapabilityResult<CliLoginChallenge>> {
    const result = await this.call<unknown>('accountLogin');
    if (result.status !== 'ok') return result;
    const record =
      result.value !== null && typeof result.value === 'object'
        ? (result.value as Record<string, unknown>)
        : {};
    const verificationUrl = readString(record, [
      'verificationUrl',
      'verificationUri',
      'url',
      'loginUrl',
    ]);
    if (verificationUrl === undefined) {
      return { status: 'failed', reason: 'The AGI CLI did not return a sign-in URL.' };
    }
    const loginId = readString(record, ['loginId', 'id']);
    if (loginId === undefined) {
      return { status: 'failed', reason: 'The AGI CLI did not return a login to wait on.' };
    }
    const userCode = readString(record, ['userCode', 'code']);
    return {
      status: 'ok',
      value: { loginId, verificationUrl, ...(userCode === undefined ? {} : { userCode }) },
    };
  }

  async loginWait(loginId: string): Promise<CliCapabilityResult<CliLoginGrant>> {
    const result = await this.call<unknown>('accountLoginWait', loginId);
    if (result.status !== 'ok') return result;
    const record =
      result.value !== null && typeof result.value === 'object'
        ? (result.value as Record<string, unknown>)
        : {};
    const outcome = readString(record, ['outcome']);
    const message = readString(record, ['message']);
    return {
      status: 'ok',
      value: {
        outcome: outcome === 'completed' || outcome === 'expired' ? outcome : 'failed',
        ...(message === undefined ? {} : { message }),
      },
    };
  }
}
