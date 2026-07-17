import { createBrowserConversationId } from './conversation-history';

const SESSION_OWNER_KEY = 'agi_browser_conversation_owners_v1';
const SESSION_OWNER_LOCK = 'agi-browser-conversation-owners-v1';
const MAX_SESSION_OWNERS = 32;

interface ConversationOwnerRecord {
  conversationId: string;
  touchedAt: number;
}

interface ConversationOwnerStore {
  version: 1;
  owners: Record<string, ConversationOwnerRecord>;
}

export interface ClaimedConversationOwner {
  conversationId: string;
  /** Existing conversation used only to seed a newly-created window owner. */
  seedConversationId?: string;
}

let mutationQueue: Promise<void> = Promise.resolve();

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isSafeIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !containsControlCharacter(value)
  );
}

function normalizeOwnerStore(value: unknown): ConversationOwnerStore {
  if (!value || typeof value !== 'object') return { version: 1, owners: {} };
  const candidate = value as Record<string, unknown>;
  if (
    candidate['version'] !== 1 ||
    !candidate['owners'] ||
    typeof candidate['owners'] !== 'object'
  ) {
    return { version: 1, owners: {} };
  }

  const owners: Record<string, ConversationOwnerRecord> = {};
  for (const [scope, rawRecord] of Object.entries(candidate['owners'] as Record<string, unknown>)) {
    if (!isSafeIdentifier(scope) || !rawRecord || typeof rawRecord !== 'object') continue;
    const record = rawRecord as Record<string, unknown>;
    if (
      !isSafeIdentifier(record['conversationId']) ||
      typeof record['touchedAt'] !== 'number' ||
      !Number.isFinite(record['touchedAt'])
    ) {
      continue;
    }
    owners[scope] = {
      conversationId: record['conversationId'],
      touchedAt: record['touchedAt'],
    };
  }
  return { version: 1, owners };
}

async function readOwnerStore(): Promise<ConversationOwnerStore> {
  const result = await chrome.storage.session.get([SESSION_OWNER_KEY]);
  return normalizeOwnerStore(result[SESSION_OWNER_KEY]);
}

async function writeOwnerStore(store: ConversationOwnerStore): Promise<void> {
  const owners = Object.fromEntries(
    Object.entries(store.owners)
      .sort((left, right) => right[1].touchedAt - left[1].touchedAt)
      .slice(0, MAX_SESSION_OWNERS),
  );
  await chrome.storage.session.set({
    [SESSION_OWNER_KEY]: { version: 1, owners } satisfies ConversationOwnerStore,
  });
}

async function withOwnerLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(SESSION_OWNER_LOCK, operation);
  }
  return operation();
}

function mutateOwners<T>(operation: (store: ConversationOwnerStore) => Promise<T>): Promise<T> {
  const result = mutationQueue.then(() =>
    withOwnerLock(async () => operation(await readOwnerStore())),
  );
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function resolveBrowserConversationScope(panelInstanceId: string): Promise<string> {
  if (!isSafeIdentifier(panelInstanceId)) throw new Error('Invalid side-panel instance id');
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (
      typeof currentWindow.id === 'number' &&
      Number.isSafeInteger(currentWindow.id) &&
      currentWindow.id >= 0
    ) {
      return `window:${currentWindow.id}`;
    }
  } catch {
    // A detached extension page may not have a current Chrome window.
  }
  return `panel:${panelInstanceId}`;
}

export async function claimConversationOwner(
  scope: string,
  seedConversationId?: string,
): Promise<ClaimedConversationOwner> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  if (seedConversationId !== undefined && !isSafeIdentifier(seedConversationId)) {
    throw new Error('Invalid seed conversation id');
  }

  return mutateOwners(async (store) => {
    const existing = store.owners[scope];
    if (existing) {
      existing.touchedAt = Date.now();
      await writeOwnerStore(store);
      return { conversationId: existing.conversationId };
    }

    const conversationId = createBrowserConversationId();
    store.owners[scope] = { conversationId, touchedAt: Date.now() };
    await writeOwnerStore(store);
    return {
      conversationId,
      ...(seedConversationId ? { seedConversationId } : {}),
    };
  });
}

export async function replaceConversationOwner(scope: string): Promise<string> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  return mutateOwners(async (store) => {
    const conversationId = createBrowserConversationId();
    store.owners[scope] = { conversationId, touchedAt: Date.now() };
    await writeOwnerStore(store);
    return conversationId;
  });
}

export async function assignConversationOwner(
  scope: string,
  conversationId: string,
): Promise<void> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  if (!isSafeIdentifier(conversationId)) throw new Error('Invalid browser conversation id');
  await mutateOwners(async (store) => {
    store.owners[scope] = { conversationId, touchedAt: Date.now() };
    await writeOwnerStore(store);
  });
}
