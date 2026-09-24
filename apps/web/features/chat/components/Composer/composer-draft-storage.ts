const DRAFT_STORAGE_PREFIX = 'agi-composer-draft';
const DRAFT_RECORD_VERSION = 2;
const LEGACY_DRAFT_RECORD_VERSION = 1;
const NEW_CHAT_DRAFT_KEY = 'new-chat';
const DOCUMENT_OWNER_KEY = `${DRAFT_STORAGE_PREFIX}:document-owner`;

interface StoredDraftRecord {
  version: number;
  text: string;
}

interface DocumentOwnerState {
  current: string;
  previous: string[];
}

function draftScope(conversationId: string | null): string {
  return encodeURIComponent(conversationId ?? NEW_CHAT_DRAFT_KEY);
}

function draftStorageKey(ownerId: string, conversationId: string | null): string {
  return `${DRAFT_STORAGE_PREFIX}:v${DRAFT_RECORD_VERSION}:${ownerId}:${draftScope(conversationId)}`;
}

function readRecord(storage: Storage, key: string, version: number): StoredDraftRecord | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const record: unknown = JSON.parse(raw);
    if (
      !record ||
      typeof record !== 'object' ||
      !('version' in record) ||
      record.version !== version ||
      !('text' in record) ||
      typeof record.text !== 'string'
    ) {
      return { version, text: '' };
    }
    return record as StoredDraftRecord;
  } catch {
    return { version, text: '' };
  }
}

function writeRecord(storage: Storage, key: string, text: string): boolean {
  try {
    storage.setItem(key, JSON.stringify({ version: DRAFT_RECORD_VERSION, text }));
    return true;
  } catch {
    return false;
  }
}

export function createComposerDraftStorage(
  storage: Storage,
  ownerId: string,
  previousOwnerIds: readonly string[],
  retirePreviousOwners = false,
) {
  let migrationComplete = true;
  for (const previousOwnerId of previousOwnerIds) {
    if (previousOwnerId === ownerId) continue;
    const previousPrefix = `${DRAFT_STORAGE_PREFIX}:v${DRAFT_RECORD_VERSION}:${previousOwnerId}:`;
    const keys: string[] = [];
    try {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(previousPrefix)) keys.push(key);
      }
    } catch {
      migrationComplete = false;
    }
    for (const previousKey of keys) {
      const currentKey = `${DRAFT_STORAGE_PREFIX}:v${DRAFT_RECORD_VERSION}:${ownerId}:${previousKey.slice(previousPrefix.length)}`;
      const record = readRecord(storage, previousKey, DRAFT_RECORD_VERSION);
      if (!record) {
        migrationComplete = false;
        continue;
      }
      if (readRecord(storage, currentKey, DRAFT_RECORD_VERSION) === null) {
        if (!writeRecord(storage, currentKey, record.text)) {
          migrationComplete = false;
          continue;
        }
      }
      if (retirePreviousOwners) {
        try {
          storage.removeItem(previousKey);
        } catch {
          migrationComplete = false;
        }
      }
    }
  }

  const read = (conversationId: string | null): string => {
    const currentKey = draftStorageKey(ownerId, conversationId);
    const current = readRecord(storage, currentKey, DRAFT_RECORD_VERSION);
    if (current) return current.text;
    for (const previousOwnerId of previousOwnerIds) {
      const previous = readRecord(
        storage,
        draftStorageKey(previousOwnerId, conversationId),
        DRAFT_RECORD_VERSION,
      );
      if (previous) {
        writeRecord(storage, currentKey, previous.text);
        return previous.text;
      }
    }
    const legacyKey = `${DRAFT_STORAGE_PREFIX}:v${LEGACY_DRAFT_RECORD_VERSION}:${draftScope(conversationId)}`;
    const legacy = readRecord(storage, legacyKey, LEGACY_DRAFT_RECORD_VERSION);
    if (!legacy) return '';
    if (writeRecord(storage, currentKey, legacy.text)) {
      try {
        storage.removeItem(legacyKey);
      } catch {
        // The new copy is already durable; the old key can wait for sign-out cleanup.
      }
    }
    return legacy.text;
  };

  // Empty text stays as a tombstone so an inherited or legacy draft cannot reappear.
  const write = (conversationId: string | null, text: string): boolean =>
    writeRecord(storage, draftStorageKey(ownerId, conversationId), text.trim() ? text : '');

  return {
    read,
    write,
    clear: (conversationId: string | null): void => {
      write(conversationId, '');
    },
    migrationComplete,
  };
}

let activeStorage: ReturnType<typeof createComposerDraftStorage> | null | undefined;

function currentStorage(): ReturnType<typeof createComposerDraftStorage> | null {
  if (activeStorage !== undefined) return activeStorage;
  if (typeof window === 'undefined') return null;
  try {
    const rawOwner = window.sessionStorage.getItem(DOCUMENT_OWNER_KEY);
    let previousOwnerState: DocumentOwnerState | null = null;
    if (rawOwner) {
      try {
        const parsed: unknown = JSON.parse(rawOwner);
        if (
          parsed &&
          typeof parsed === 'object' &&
          'current' in parsed &&
          typeof parsed.current === 'string' &&
          'previous' in parsed &&
          Array.isArray(parsed.previous) &&
          parsed.previous.every((value) => typeof value === 'string')
        ) {
          previousOwnerState = parsed as DocumentOwnerState;
        }
      } catch {
        previousOwnerState = null;
      }
    }
    const random = new Uint8Array(16);
    window.crypto.getRandomValues(random);
    const ownerId = Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const previousOwnerIds = previousOwnerState
      ? [previousOwnerState.current, ...previousOwnerState.previous]
      : [];
    window.sessionStorage.setItem(
      DOCUMENT_OWNER_KEY,
      JSON.stringify({ current: ownerId, previous: previousOwnerIds }),
    );
    let retirePreviousOwners = false;
    try {
      const navigation = window.performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      retirePreviousOwners = navigation?.type === 'reload';
    } catch {
      retirePreviousOwners = false;
    }
    activeStorage = createComposerDraftStorage(
      window.localStorage,
      ownerId,
      previousOwnerIds,
      retirePreviousOwners,
    );
    if (activeStorage.migrationComplete) {
      window.sessionStorage.setItem(
        DOCUMENT_OWNER_KEY,
        JSON.stringify({ current: ownerId, previous: [] }),
      );
    }
    return activeStorage;
  } catch {
    activeStorage = null;
    return null;
  }
}

export function readPersistedDraft(conversationId: string | null): string {
  return currentStorage()?.read(conversationId) ?? '';
}

export function writePersistedDraft(conversationId: string | null, text: string): boolean {
  return currentStorage()?.write(conversationId, text) ?? false;
}

export function clearPersistedDraft(conversationId: string | null): void {
  currentStorage()?.clear(conversationId);
}

let reloadedPendingDraftClaimed = false;

export function claimReloadedPendingDraft(): string {
  if (reloadedPendingDraftClaimed) return '';
  reloadedPendingDraftClaimed = true;
  return readPersistedDraft(null);
}

export function __resetComposerDraftStorageForTests(): void {
  activeStorage = undefined;
}
