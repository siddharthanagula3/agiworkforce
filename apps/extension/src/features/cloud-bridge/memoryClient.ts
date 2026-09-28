import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';
import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export interface AccountMemory {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  source?: string;
  sourceConversationId?: string;
  sourceConversationTitle?: string;
}

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

export type MemoryCommandStatus =
  | 'stored'
  | 'already_known'
  | 'refused'
  | 'confirmation_required'
  | 'nothing_to_forget'
  | 'forgotten'
  | 'failed';

export interface MemoryCommandResult {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus;
  message: string | null;
  matches: Array<{ id: string; content: string }>;
}

export interface MemoryCommandRequest {
  message: string;
  conversationId: string | null;
  projectId: string | null;
  confirmed?: boolean;
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
export const MEMORY_EXCLUSION_MIN_CHARS = 3;
export const MEMORY_EXCLUSION_MAX_CHARS = 100;
export const MEMORY_EXCLUSION_MAX_TERMS = 50;
export const ACCOUNT_MEMORY_CACHE_KEY = 'agi_account_memory_cache';
export const ACCOUNT_MEMORY_PAGE_SIZE = 100;
export const ACCOUNT_MEMORY_MAX_CONTENT_CHARS = 10_000;

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
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    record['id'].length > 0 &&
    typeof record['content'] === 'string' &&
    typeof record['createdAt'] === 'string' &&
    typeof record['updatedAt'] === 'string'
  );
}

function optionalText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toAccountMemory(memory: AccountMemory): AccountMemory {
  const record = memory as unknown as Record<string, unknown>;
  const source = optionalText(record, 'source');
  const sourceConversationId = optionalText(record, 'sourceConversationId');
  const sourceConversationTitle = optionalText(record, 'sourceConversationTitle');
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
  if (!value || typeof value !== 'object') throw new Error('Memory response was not an object');
  const memory = (value as Record<string, unknown>)['memory'];
  if (!isAccountMemory(memory)) throw new Error('Memory response was missing a memory');
  return toAccountMemory(memory);
}

export function parseAccountMemoryList(value: unknown): AccountMemory[] {
  if (!value || typeof value !== 'object') throw new Error('Memory response was not an object');
  const memories = (value as Record<string, unknown>)['memories'];
  if (!Array.isArray(memories)) throw new Error('Memory response was missing a memory list');
  return memories.filter(isAccountMemory).map(toAccountMemory);
}

export function parseAccountMemoryPage(value: unknown): AccountMemoryPage {
  return {
    memories: parseAccountMemoryList(value),
    hasMore: (value as Record<string, unknown>)['hasMore'] === true,
  };
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
    const message = body['error'] ?? body['message'];
    if (typeof message === 'string' && message.trim()) return message.trim();
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
  const body = await send(token, ACCOUNT_MEMORY_CONFLICTS_PATH, { method: 'GET' });
  const conflicts = (body as Record<string, unknown> | null)?.['conflicts'];
  if (!Array.isArray(conflicts)) throw new Error('Memory response was missing its conflicts');
  return conflicts.flatMap((entry): AccountMemoryConflict[] => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const kept = record['kept'] as Record<string, unknown> | undefined;
    const id = record['id'];
    const content = record['content'];
    const keptContent = kept?.['content'];
    return typeof id === 'string' && typeof content === 'string' && typeof keptContent === 'string'
      ? [{ id, content, keptContent }]
      : [];
  });
}

export async function restoreAccountMemory(token: string, id: string): Promise<void> {
  await send(token, `${ACCOUNT_MEMORY_PATH}/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
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

export const MEMORY_COMMAND_KINDS: ReadonlySet<string> = new Set<MemoryCommandKind>([
  'remember',
  'forget',
]);

export const MEMORY_COMMAND_STATUSES: ReadonlySet<string> = new Set<MemoryCommandStatus>([
  'stored',
  'already_known',
  'refused',
  'confirmation_required',
  'nothing_to_forget',
  'forgotten',
  'failed',
]);

export async function runAccountMemoryCommand(
  token: string,
  request: MemoryCommandRequest,
): Promise<MemoryCommandResult | null> {
  const body = (await send(token, ACCOUNT_MEMORY_COMMANDS_PATH, {
    method: 'POST',
    body: JSON.stringify(request),
  })) as Record<string, unknown> | null;
  const command = body?.['command'] as Record<string, unknown> | null | undefined;
  const kind = command?.['kind'];
  if (kind !== 'remember' && kind !== 'forget') return null;
  const status = body?.['status'];
  const message = body?.['message'];
  const memories = Array.isArray(body?.['memories']) ? (body['memories'] as unknown[]) : [];
  return {
    kind,
    status:
      typeof status === 'string' && MEMORY_COMMAND_STATUSES.has(status)
        ? (status as MemoryCommandStatus)
        : 'failed',
    message: typeof message === 'string' && message.trim() ? message.trim() : null,
    matches:
      body?.['requiresConfirmation'] === true
        ? memories.flatMap((entry) => {
            const record = entry as Record<string, unknown> | null;
            const id = record?.['id'];
            const content = record?.['content'];
            return typeof id === 'string' && typeof content === 'string' ? [{ id, content }] : [];
          })
        : [],
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
