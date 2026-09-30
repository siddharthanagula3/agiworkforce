import { getManagedCloudAuthContext } from '../features/cloud-bridge/freeTrialClient';
import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../features/cloud-bridge/managedCloudAuthority';
import {
  ACCOUNT_MEMORY_CACHE_KEY,
  ACCOUNT_MEMORY_MAX_CONTENT_CHARS,
  AccountMemoryHttpError,
  createAccountMemory,
  deleteAccountMemory,
  fetchAccountMemories,
  isAccountMemory,
  updateAccountMemory,
  type AccountMemory,
} from '../features/cloud-bridge/memoryClient';

export type MemoryItem = AccountMemory;
export type MemoryStatus = 'ready' | 'signed-out' | 'unavailable';

export interface MemoryListResult {
  status: MemoryStatus;
  memories: MemoryItem[];
  fromCache: boolean;
  hasMore?: boolean;
  error?: string;
}

export interface MemoryWriteResult {
  status: MemoryStatus;
  memory?: MemoryItem;
  error?: string;
}

const LEGACY_MEMORY_STORAGE_KEY = 'agi_memories';
const CACHE_MAX_AGE_MS = 60_000;

interface MemoryCache {
  owner: ManagedCloudOwner;
  fetchedAtMs: number;
  items: MemoryItem[];
}

function isMemoryCache(value: unknown): value is MemoryCache {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const owner = record['owner'] as Record<string, unknown> | undefined;
  return (
    typeof owner?.['accountId'] === 'string' &&
    typeof owner['authIncarnation'] === 'string' &&
    typeof record['fetchedAtMs'] === 'number' &&
    Array.isArray(record['items']) &&
    record['items'].every(isAccountMemory)
  );
}

async function readCache(owner: ManagedCloudOwner): Promise<MemoryCache | null> {
  try {
    const stored = await chrome.storage.local.get(ACCOUNT_MEMORY_CACHE_KEY);
    const cache = (stored as Record<string, unknown>)[ACCOUNT_MEMORY_CACHE_KEY];
    if (!isMemoryCache(cache)) return null;
    if (!sameManagedCloudOwner(cache.owner, owner)) return null;
    if (Date.now() - cache.fetchedAtMs > CACHE_MAX_AGE_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

async function writeCache(owner: ManagedCloudOwner, items: MemoryItem[]): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(ACCOUNT_MEMORY_CACHE_KEY);
    const previous = (stored as Record<string, unknown>)[ACCOUNT_MEMORY_CACHE_KEY];
    if (
      isMemoryCache(previous) &&
      sameManagedCloudOwner(previous.owner, owner) &&
      JSON.stringify(previous.items) === JSON.stringify(items)
    ) {
      return;
    }
    await chrome.storage.local.set({
      [ACCOUNT_MEMORY_CACHE_KEY]: { owner, fetchedAtMs: Date.now(), items } satisfies MemoryCache,
    });
  } catch {
    // A cache write failure must not fail the read it was serving.
  }
}

async function clearCache(): Promise<void> {
  try {
    await chrome.storage.local.remove(ACCOUNT_MEMORY_CACHE_KEY);
  } catch {
    // Nothing to recover: the next signed-in read refetches from the account.
  }
}

const PERMANENT_REFUSALS: ReadonlySet<number> = new Set([400, 409, 413, 422]);

async function migrateLegacyMemories(token: string): Promise<void> {
  let legacy: unknown;
  try {
    const stored = await chrome.storage.local.get(LEGACY_MEMORY_STORAGE_KEY);
    legacy = (stored as Record<string, unknown>)[LEGACY_MEMORY_STORAGE_KEY];
  } catch {
    return;
  }
  if (!Array.isArray(legacy)) return;

  const pending = legacy.filter(isAccountMemory);
  const kept: AccountMemory[] = [];
  let signedOutError: AccountMemoryHttpError | null = null;
  for (const [index, item] of pending.entries()) {
    const content = item.content.trim().slice(0, ACCOUNT_MEMORY_MAX_CONTENT_CHARS);
    if (!content) continue;
    try {
      await createAccountMemory(token, content);
    } catch (error) {
      if (error instanceof AccountMemoryHttpError && PERMANENT_REFUSALS.has(error.status)) continue;
      kept.push(...pending.slice(index));
      if (error instanceof AccountMemoryHttpError && error.status === 401) signedOutError = error;
      break;
    }
  }
  if (kept.length > 0) {
    await chrome.storage.local.set({ [LEGACY_MEMORY_STORAGE_KEY]: kept });
  } else {
    await chrome.storage.local.remove(LEGACY_MEMORY_STORAGE_KEY);
  }
  if (signedOutError) throw signedOutError;
}

function signedOut(): MemoryListResult {
  return { status: 'signed-out', memories: [], fromCache: false };
}

function failureMessage(error: unknown): string {
  if (error instanceof AccountMemoryHttpError) return error.message;
  return 'Memory could not be reached. Check your connection and try again.';
}

export async function memoryList(offset = 0): Promise<MemoryListResult> {
  const auth = await getManagedCloudAuthContext();
  if (!auth) {
    await clearCache();
    return signedOut();
  }

  try {
    if (offset > 0) {
      const page = await fetchAccountMemories(auth.token, offset);
      return { status: 'ready', memories: page.memories, fromCache: false, hasMore: page.hasMore };
    }
    await migrateLegacyMemories(auth.token);
    const page = await fetchAccountMemories(auth.token);
    await writeCache(auth.owner, page.memories);
    return { status: 'ready', memories: page.memories, fromCache: false, hasMore: page.hasMore };
  } catch (error) {
    if (error instanceof AccountMemoryHttpError && error.status === 401) {
      await clearCache();
      return signedOut();
    }
    const cached = await readCache(auth.owner);
    if (cached) {
      return {
        status: 'ready',
        memories: cached.items,
        fromCache: true,
        error: failureMessage(error),
      };
    }
    return { status: 'unavailable', memories: [], fromCache: false, error: failureMessage(error) };
  }
}

async function withAuthorizedWrite(
  write: (token: string) => Promise<MemoryItem | undefined>,
): Promise<MemoryWriteResult> {
  const auth = await getManagedCloudAuthContext();
  if (!auth) {
    await clearCache();
    return { status: 'signed-out' };
  }
  try {
    const memory = await write(auth.token);
    await clearCache();
    return memory ? { status: 'ready', memory } : { status: 'ready' };
  } catch (error) {
    if (error instanceof AccountMemoryHttpError && error.status === 401) {
      await clearCache();
      return { status: 'signed-out' };
    }
    return { status: 'unavailable', error: failureMessage(error) };
  }
}

function contentRefusal(content: string): string | null {
  if (!content) return 'Memory content is required';
  if (content.length > ACCOUNT_MEMORY_MAX_CONTENT_CHARS) {
    return `Content must be ${ACCOUNT_MEMORY_MAX_CONTENT_CHARS.toLocaleString('en-US')} characters or less`;
  }
  return null;
}

export async function memoryAdd(content: string): Promise<MemoryWriteResult> {
  const trimmed = content.trim();
  const refusal = contentRefusal(trimmed);
  if (refusal) return { status: 'unavailable', error: refusal };
  return withAuthorizedWrite((token) => createAccountMemory(token, trimmed));
}

export async function memoryUpdate(id: string, content: string): Promise<MemoryWriteResult> {
  const trimmed = content.trim();
  const refusal = contentRefusal(trimmed);
  if (refusal) return { status: 'unavailable', error: refusal };
  return withAuthorizedWrite((token) => updateAccountMemory(token, id, trimmed));
}

export async function memoryDelete(id: string): Promise<MemoryWriteResult> {
  return withAuthorizedWrite(async (token) => {
    await deleteAccountMemory(token, id);
    return undefined;
  });
}

export { ACCOUNT_MEMORY_CACHE_KEY, ACCOUNT_MEMORY_MAX_CONTENT_CHARS };
