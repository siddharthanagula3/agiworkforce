import { getActiveWorkspaceFolder } from '../../platform/workspaceFolders';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';

export const CLI_CAPABILITY_REQUIREMENT = 'Needs AGI CLI 1.8';

export const CLI_CAPABILITY_METHODS = {
  skills: 'listSkills',
  plugins: 'listPlugins',
  mcpServers: 'listMcpServers',
  hooks: 'listHooks',
  instructions: 'contextInstructions',
  commands: 'listCommands',
  runCommand: 'runCommand',
  readSettings: 'readSettings',
  writeSettings: 'writeSettings',
  accountStatus: 'accountStatus',
  accountLogin: 'startAccountLogin',
  accountLoginWait: 'waitForAccountLogin',
  accountToken: 'accountToken',
} as const;

export type CliCapability = keyof typeof CLI_CAPABILITY_METHODS;

export type CliCapabilityResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string };

export interface CliCapabilityEntry {
  label: string;
  description?: string;
  detail?: string;
}

export interface CliAccountStatus {
  signedIn: boolean;
  email?: string;
  tier?: string;
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
      const value = (await (method as (...args: unknown[]) => Promise<unknown>).apply(
        host,
        params,
      )) as T;
      return { status: 'ok', value };
    } catch (error) {
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
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
    return {
      status: 'ok',
      value: {
        signedIn: record['signedIn'] === true,
        ...(email === undefined ? {} : { email }),
        ...(tier === undefined ? {} : { tier }),
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
