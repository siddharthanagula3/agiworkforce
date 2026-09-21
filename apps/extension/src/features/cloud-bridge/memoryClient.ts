import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export interface AccountMemory {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const ACCOUNT_MEMORY_PATH = '/api/memory';
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

export function parseAccountMemory(value: unknown): AccountMemory {
  if (!value || typeof value !== 'object') throw new Error('Memory response was not an object');
  const memory = (value as Record<string, unknown>)['memory'];
  if (!isAccountMemory(memory)) throw new Error('Memory response was missing a memory');
  return {
    id: memory.id,
    content: memory.content,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
}

export function parseAccountMemoryList(value: unknown): AccountMemory[] {
  if (!value || typeof value !== 'object') throw new Error('Memory response was not an object');
  const memories = (value as Record<string, unknown>)['memories'];
  if (!Array.isArray(memories)) throw new Error('Memory response was missing a memory list');
  return memories.filter(isAccountMemory).map((memory) => ({
    id: memory.id,
    content: memory.content,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  }));
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
  signal?: AbortSignal,
): Promise<AccountMemory[]> {
  const body = await send(
    token,
    `${ACCOUNT_MEMORY_PATH}?limit=${ACCOUNT_MEMORY_PAGE_SIZE}`,
    { method: 'GET' },
    signal,
  );
  return parseAccountMemoryList(body);
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
