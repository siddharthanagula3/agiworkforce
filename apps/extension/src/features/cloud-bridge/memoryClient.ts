import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';
import {
  MANAGED_MEMORY_COMMAND_STATUSES,
  MANAGED_MEMORY_MAX_CONTENT_CHARS,
  MANAGED_MEMORY_MAX_PAGE_SIZE,
  parseManagedMemoryCommandResponse,
  parseManagedMemoryConflictsResponse,
  parseManagedMemoryItemResponse,
  parseManagedMemoryListResponse,
  parseManagedMemoryRecord,
  parseManagedMemoryRestoreResponse,
  type ManagedMemoryCommandRequest,
  type ManagedMemoryCommandStatus,
  type ManagedMemoryRecord,
} from '@agiworkforce/types';
import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export type AccountMemory = Pick<
  ManagedMemoryRecord,
  'id' | 'content' | 'createdAt' | 'updatedAt'
> & {
  source?: string;
  sourceConversationId?: string;
  sourceConversationTitle?: string;
};

export interface AccountMemoryPage {
  memories: AccountMemory[];
  hasMore: boolean;
}

export interface AccountMemoryConflict {
  id: string;
  content: string;
  keptContent: string;
}

export type MemoryCommandKind = 'remember' | 'forget';

export type MemoryCommandStatus = ManagedMemoryCommandStatus | 'failed';

export interface MemoryCommandResult {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus;
  message: string | null;
  matches: Array<{ id: string; content: string }>;
}

export type MemoryCommandRequest = ManagedMemoryCommandRequest;

export interface MemoryPreferences {
  memory: boolean;
  searchPastChats: boolean;
  organizationAllows: boolean;
}

export interface ActiveMemoryWorkspace {
  scope: 'personal' | 'organization';
  name: string | null;
}

export const ACCOUNT_MEMORY_PATH = '/api/memory';
export const ACCOUNT_MEMORY_CONFLICTS_PATH = '/api/memory/conflicts';
export const ACCOUNT_MEMORY_COMMANDS_PATH = '/api/memory/commands';
export const MEMORY_COMMAND_HINT = /\b(remember(?:ing)?|forget|memor(?:y|ies|i[sz]e))\b/i;
export const ACCOUNT_WORKSPACES_PATH = '/api/settings/workspaces';
export const MEMORY_PREFERENCES_NAMESPACE = 'memory';
export const MEMORY_CAPABILITIES_NAMESPACE = 'capabilities';
export const MEMORY_EXCLUSION_MIN_CHARS = 3;
export const MEMORY_EXCLUSION_MAX_CHARS = 100;
export const MEMORY_EXCLUSION_MAX_TERMS = 50;
export const ACCOUNT_MEMORY_CACHE_KEY = 'agi_account_memory_cache';
export const ACCOUNT_MEMORY_PAGE_SIZE = MANAGED_MEMORY_MAX_PAGE_SIZE;
export const ACCOUNT_MEMORY_MAX_CONTENT_CHARS = MANAGED_MEMORY_MAX_CONTENT_CHARS;

export class AccountMemoryHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AccountMemoryHttpError';
  }
}

export function isAccountMemory(value: unknown): value is AccountMemory {
  return parseManagedMemoryRecord(value) !== null;
}

function toAccountMemory(memory: ManagedMemoryRecord): AccountMemory {
  const { source, sourceConversationId, sourceConversationTitle } = memory;
  return {
    id: memory.id,
    content: memory.content,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    ...(source ? { source } : {}),
    ...(sourceConversationId ? { sourceConversationId } : {}),
    ...(sourceConversationTitle ? { sourceConversationTitle } : {}),
  };
}

export function parseAccountMemory(value: unknown): AccountMemory {
  const parsed = parseManagedMemoryItemResponse(value);
  if (!parsed) throw new Error('Memory response was missing a memory');
  return toAccountMemory(parsed.memory);
}

export function parseAccountMemoryPage(value: unknown): AccountMemoryPage {
  const parsed = parseManagedMemoryListResponse(value);
  if (!parsed) throw new Error('Memory response was missing a memory list');
  return { memories: parsed.memories.map(toAccountMemory), hasMore: parsed.hasMore };
}

export function parseAccountMemoryList(value: unknown): AccountMemory[] {
  return parseAccountMemoryPage(value).memories;
}

export function normalizeMemoryExclusions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const terms = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const term = entry.trim().toLowerCase();
    if (term.length < MEMORY_EXCLUSION_MIN_CHARS || term.length > MEMORY_EXCLUSION_MAX_CHARS) {
      continue;
    }
    terms.add(term);
    if (terms.size >= MEMORY_EXCLUSION_MAX_TERMS) break;
  }
  return [...terms];
}

function headers(token: string, sendsBody: boolean): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest',
    ...platformRequestHeaders(),
    ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const error = body['error'];
    const message =
      error && typeof error === 'object' ? (error as Record<string, unknown>)['message'] : error;
    const text = typeof message === 'string' ? message : body['message'];
    if (typeof text === 'string' && text.trim()) return text.trim();
  } catch {
    // The gateway does not always answer with JSON.
  }
  return response.status === 401
    ? 'Sign in to use account memory.'
    : `Memory is unavailable (${response.status}).`;
}

async function send(
  token: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${path}`, {
    ...init,
    headers: headers(token, init.body !== undefined),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new AccountMemoryHttpError(await readError(response), response.status);
  return response.json();
}

export async function fetchAccountMemories(
  token: string,
  offset = 0,
  signal?: AbortSignal,
): Promise<AccountMemoryPage> {
  const body = await send(
    token,
    `${ACCOUNT_MEMORY_PATH}?limit=${ACCOUNT_MEMORY_PAGE_SIZE}&offset=${Math.max(0, offset)}`,
    { method: 'GET' },
    signal,
  );
  return parseAccountMemoryPage(body);
}

export async function fetchAccountMemoryConflicts(token: string): Promise<AccountMemoryConflict[]> {
  const parsed = parseManagedMemoryConflictsResponse(
    await send(token, ACCOUNT_MEMORY_CONFLICTS_PATH, { method: 'GET' }),
  );
  if (!parsed) throw new Error('Memory response was missing its conflicts');
  return parsed.conflicts.map((conflict) => ({
    id: conflict.id,
    content: conflict.content,
    keptContent: conflict.kept.content,
  }));
}

export async function restoreAccountMemory(token: string, id: string): Promise<void> {
  const body = await send(token, `${ACCOUNT_MEMORY_PATH}/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!parseManagedMemoryRestoreResponse(body)) {
    throw new Error('Memory response did not confirm the restore');
  }
}

export async function fetchMemoryExclusions(token: string): Promise<string[]> {
  const body = await send(
    token,
    managedCloudPreferencesNamespacePath(MEMORY_PREFERENCES_NAMESPACE),
    { method: 'GET' },
  );
  const settings = (body as Record<string, unknown> | null)?.['settings'];
  return normalizeMemoryExclusions(
    settings && typeof settings === 'object'
      ? (settings as Record<string, unknown>)['excludedTerms']
      : undefined,
  );
}

export async function saveMemoryExclusions(token: string, terms: readonly string[]): Promise<void> {
  await send(token, MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      namespace: MEMORY_PREFERENCES_NAMESPACE,
      patch: { excludedTerms: normalizeMemoryExclusions(terms) },
    }),
  });
}

export async function fetchMemoryPreferences(token: string): Promise<MemoryPreferences> {
  const body = (await send(
    token,
    managedCloudPreferencesNamespacePath(MEMORY_CAPABILITIES_NAMESPACE),
    { method: 'GET' },
  )) as Record<string, unknown> | null;
  const settings = body?.['settings'];
  const record =
    settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  return {
    memory: record['memory'] === true,
    searchPastChats: record['searchPastChats'] === true,
    organizationAllows: body?.['organizationMemoryAllowed'] !== false,
  };
}

export async function saveMemoryPreferences(
  token: string,
  preferences: Pick<MemoryPreferences, 'memory' | 'searchPastChats'>,
): Promise<void> {
  await send(token, MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    body: JSON.stringify({
      namespace: MEMORY_CAPABILITIES_NAMESPACE,
      patch: { memory: preferences.memory, searchPastChats: preferences.searchPastChats },
    }),
  });
}

export const MEMORY_COMMAND_KINDS: ReadonlySet<string> = new Set<MemoryCommandKind>([
  'remember',
  'forget',
]);

export const MEMORY_COMMAND_STATUSES: ReadonlySet<string> = new Set<MemoryCommandStatus>([
  ...MANAGED_MEMORY_COMMAND_STATUSES,
  'failed',
]);

export async function runAccountMemoryCommand(
  token: string,
  request: MemoryCommandRequest,
): Promise<MemoryCommandResult | null> {
  const parsed = parseManagedMemoryCommandResponse(
    await send(token, ACCOUNT_MEMORY_COMMANDS_PATH, {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  );
  if (!parsed?.command) return null;
  const message = parsed.message?.trim();
  return {
    kind: parsed.command.kind,
    status: parsed.status ?? 'failed',
    message: message ? message : null,
    matches: parsed.requiresConfirmation === true ? (parsed.memories ?? []) : [],
  };
}

export async function fetchActiveMemoryWorkspace(token: string): Promise<ActiveMemoryWorkspace> {
  const body = (await send(token, ACCOUNT_WORKSPACES_PATH, { method: 'GET' })) as Record<
    string,
    unknown
  > | null;
  const workspaces = Array.isArray(body?.['workspaces']) ? (body['workspaces'] as unknown[]) : [];
  const activeId = body?.['activeWorkspaceId'];
  const active = workspaces.find(
    (workspace) =>
      workspace !== null &&
      typeof workspace === 'object' &&
      (workspace as Record<string, unknown>)['id'] === activeId,
  ) as Record<string, unknown> | undefined;
  const name = active?.['name'];
  return {
    scope: body?.['scope'] === 'organization' ? 'organization' : 'personal',
    name: typeof name === 'string' && name.trim() ? name.trim() : null,
  };
}

export async function createAccountMemory(token: string, content: string): Promise<AccountMemory> {
  const body = await send(token, ACCOUNT_MEMORY_PATH, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  return parseAccountMemory(body);
}

export async function updateAccountMemory(
  token: string,
  id: string,
  content: string,
): Promise<AccountMemory> {
  const body = await send(token, `${ACCOUNT_MEMORY_PATH}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return parseAccountMemory(body);
}

export async function deleteAccountMemory(token: string, id: string): Promise<void> {
  await send(token, `${ACCOUNT_MEMORY_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
