import { createBrowserConversationId } from './conversation-history';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

const SESSION_OWNER_KEY = 'agi_browser_conversation_owners_v1';
const SESSION_OWNER_LOCK = 'agi-browser-conversation-owners-v1';
const MAX_SESSION_OWNERS = 32;
const MAX_SESSION_OWNER_SCAN = MAX_SESSION_OWNERS * 2;

interface ConversationOwnerRecord {
  conversationId: string;
  owner: ManagedCloudOwner;
  touchedAt: number;
}

interface ConversationOwnerStore {
  version: 1;
  owners: Record<string, ConversationOwnerRecord>;
}

export interface ClaimedConversationOwner {
  conversationId: string;
  seedConversationId?: string;
}

export interface SelectedConversationOwner {
  conversationId: string;
  forked: boolean;
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

function assertManagedCloudOwner(owner: ManagedCloudOwner): void {
  if (!normalizeManagedCloudOwner(owner)) throw new Error('Invalid Managed Cloud owner');
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
  const rawOwners = candidate['owners'] as Record<string, unknown>;
  let scanned = 0;
  for (const scope in rawOwners) {
    if (!Object.prototype.hasOwnProperty.call(rawOwners, scope)) continue;
    if (scanned >= MAX_SESSION_OWNER_SCAN) break;
    scanned += 1;
    const rawRecord = rawOwners[scope];
    if (!isSafeIdentifier(scope) || !rawRecord || typeof rawRecord !== 'object') continue;
    const record = rawRecord as Record<string, unknown>;
    const owner = normalizeManagedCloudOwner(record['owner']);
    if (
      !owner ||
      !isSafeIdentifier(record['conversationId']) ||
      typeof record['touchedAt'] !== 'number' ||
      !Number.isFinite(record['touchedAt'])
    ) {
      continue;
    }
    owners[scope] = {
      conversationId: record['conversationId'],
      owner,
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

async function resolveLiveWindowScopes(): Promise<ReadonlySet<string> | null> {
  try {
    if (!chrome.windows?.getAll) return null;
    const windows = await chrome.windows.getAll();
    return new Set(
      windows.flatMap((window) =>
        typeof window.id === 'number' && Number.isSafeInteger(window.id) && window.id >= 0
          ? [`window:${window.id}`]
          : [],
      ),
    );
  } catch {
    return null;
  }
}

function pruneClosedWindowOwners(
  store: ConversationOwnerStore,
  liveWindowScopes: ReadonlySet<string> | null,
): void {
  if (!liveWindowScopes) return;
  for (const scope of Object.keys(store.owners)) {
    if (scope.startsWith('window:') && !liveWindowScopes.has(scope)) delete store.owners[scope];
  }
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
  owner: ManagedCloudOwner,
  seedConversationId?: string,
): Promise<ClaimedConversationOwner> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  assertManagedCloudOwner(owner);
  if (seedConversationId !== undefined && !isSafeIdentifier(seedConversationId)) {
    throw new Error('Invalid seed conversation id');
  }

  return mutateOwners(async (store) => {
    const liveWindowScopes = await resolveLiveWindowScopes();
    pruneClosedWindowOwners(store, liveWindowScopes);
    const existing = store.owners[scope];
    if (existing && !sameManagedCloudOwner(existing.owner, owner)) {
      delete store.owners[scope];
    }
    const currentOwner = store.owners[scope];
    if (currentOwner) {
      currentOwner.touchedAt = Date.now();
      await writeOwnerStore(store);
      return { conversationId: currentOwner.conversationId };
    }

    const seedHasLiveOwner = seedConversationId
      ? Object.entries(store.owners).some(
          ([ownerScope, candidate]) =>
            ownerScope !== scope &&
            sameManagedCloudOwner(candidate.owner, owner) &&
            candidate.conversationId === seedConversationId,
        )
      : false;
    const conversationId =
      seedConversationId && !seedHasLiveOwner ? seedConversationId : createBrowserConversationId();
    store.owners[scope] = { conversationId, owner: { ...owner }, touchedAt: Date.now() };
    await writeOwnerStore(store);
    return {
      conversationId,
      ...(seedConversationId && seedHasLiveOwner ? { seedConversationId } : {}),
    };
  });
}

export async function replaceConversationOwner(
  scope: string,
  owner: ManagedCloudOwner,
): Promise<string> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  assertManagedCloudOwner(owner);
  return mutateOwners(async (store) => {
    const conversationId = createBrowserConversationId();
    store.owners[scope] = { conversationId, owner: { ...owner }, touchedAt: Date.now() };
    await writeOwnerStore(store);
    return conversationId;
  });
}

export async function claimSelectedConversationOwner(
  scope: string,
  owner: ManagedCloudOwner,
  selectedConversationId: string,
): Promise<SelectedConversationOwner> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  assertManagedCloudOwner(owner);
  if (!isSafeIdentifier(selectedConversationId)) {
    throw new Error('Invalid selected conversation id');
  }

  return mutateOwners(async (store) => {
    const liveWindowScopes = await resolveLiveWindowScopes();
    pruneClosedWindowOwners(store, liveWindowScopes);
    const conflictingOwner = Object.entries(store.owners).some(
      ([ownerScope, candidate]) =>
        ownerScope !== scope &&
        sameManagedCloudOwner(candidate.owner, owner) &&
        candidate.conversationId === selectedConversationId,
    );
    const conversationId = conflictingOwner
      ? createBrowserConversationId()
      : selectedConversationId;
    store.owners[scope] = { conversationId, owner: { ...owner }, touchedAt: Date.now() };
    await writeOwnerStore(store);
    return { conversationId, forked: conflictingOwner };
  });
}

export async function assignConversationOwner(
  scope: string,
  owner: ManagedCloudOwner,
  conversationId: string,
): Promise<void> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  assertManagedCloudOwner(owner);
  if (!isSafeIdentifier(conversationId)) throw new Error('Invalid browser conversation id');
  await mutateOwners(async (store) => {
    store.owners[scope] = { conversationId, owner: { ...owner }, touchedAt: Date.now() };
    await writeOwnerStore(store);
  });
}

export async function restoreConversationOwnerIfCurrent(
  scope: string,
  owner: ManagedCloudOwner,
  expectedConversationId: string,
  replacementConversationId: string,
): Promise<boolean> {
  if (!isSafeIdentifier(scope)) throw new Error('Invalid browser conversation scope');
  assertManagedCloudOwner(owner);
  if (!isSafeIdentifier(expectedConversationId) || !isSafeIdentifier(replacementConversationId)) {
    throw new Error('Invalid browser conversation id');
  }
  return mutateOwners(async (store) => {
    if (
      store.owners[scope]?.conversationId !== expectedConversationId ||
      !sameManagedCloudOwner(store.owners[scope]?.owner, owner)
    ) {
      return false;
    }
    store.owners[scope] = {
      conversationId: replacementConversationId,
      owner: { ...owner },
      touchedAt: Date.now(),
    };
    await writeOwnerStore(store);
    return true;
  });
}
