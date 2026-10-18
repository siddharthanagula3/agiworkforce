import {
  MANAGED_MEMORY_COMMAND_STATUSES,
  MANAGED_MEMORY_MAX_CONTENT_CHARS,
  MANAGED_MEMORY_MAX_PAGE_SIZE,
  parseManagedMemoryCommandResponse,
  parseManagedMemoryItemResponse,
  parseManagedMemoryListResponse,
  parseManagedMemoryRecord,
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

export type MemoryCommandKind = 'remember' | 'forget';

export type MemoryCommandStatus = ManagedMemoryCommandStatus | 'failed';

export interface MemoryCommandResult {
  kind: MemoryCommandKind;
  status: MemoryCommandStatus;
  message: string | null;
  matches: Array<{ id: string; content: string }>;
}

export type MemoryCommandRequest = ManagedMemoryCommandRequest;

export const ACCOUNT_MEMORY_PATH = '/api/memory';
export const ACCOUNT_MEMORY_COMMANDS_PATH = '/api/memory/commands';
export const MEMORY_COMMAND_HINT = /\b(remember(?:ing)?|forget|memor(?:y|ies|i[sz]e))\b/i;
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
