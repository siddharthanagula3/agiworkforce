/**
 * Cross-device Chrome preferences.
 *
 * Only this explicit boolean allowlist may enter chrome.storage.sync. Browser
 * history, page allowlists, autofill profiles, credentials, task payloads, and
 * native-bridge state remain device-local.
 */
export const SYNCED_PREFERENCE_KEYS = [
  'agi_task_notifications',
  'agi_thinking_enabled',
  'agi_quick_mode',
  'agi_cu_ask_before_acting',
  // Written by side_panel.ts and read by inPagePanel/setup.ts. The `agi_`
  // prefix the other entries carry is not part of this one's real key.
  'in_page_panel_enabled',
] as const;

type SyncedPreferenceKey = (typeof SYNCED_PREFERENCE_KEYS)[number];

interface StorageAreaLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

interface StorageChangeLike {
  newValue?: unknown;
  oldValue?: unknown;
}

type StorageChangeListener = (changes: Record<string, StorageChangeLike>, areaName: string) => void;

interface StorageChangeEventLike {
  addListener(listener: StorageChangeListener): void;
  removeListener(listener: StorageChangeListener): void;
}

export interface SyncedPreferenceStorage {
  local: StorageAreaLike;
  sync: StorageAreaLike;
  onChanged: StorageChangeEventLike;
}

function owns(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

function allowedChanges(
  changes: Record<string, StorageChangeLike>,
): Array<[SyncedPreferenceKey, StorageChangeLike]> {
  const allowed = new Set<string>(SYNCED_PREFERENCE_KEYS);
  return Object.entries(changes).filter(
    (entry): entry is [SyncedPreferenceKey, StorageChangeLike] =>
      allowed.has(entry[0]) &&
      (entry[1].newValue === undefined || typeof entry[1].newValue === 'boolean'),
  );
}

async function applyChanges(
  destination: StorageAreaLike,
  changes: Array<[SyncedPreferenceKey, StorageChangeLike]>,
): Promise<void> {
  if (changes.length === 0) return;

  const keys = changes.map(([key]) => key);
  const current = await destination.get(keys);
  const valuesToSet: Record<string, unknown> = {};
  const keysToRemove: string[] = [];

  for (const [key, change] of changes) {
    if (change.newValue === undefined) {
      if (owns(current, key)) keysToRemove.push(key);
    } else if (!owns(current, key) || !valuesMatch(current[key], change.newValue)) {
      valuesToSet[key] = change.newValue;
    }
  }

  await Promise.all([
    Object.keys(valuesToSet).length > 0 ? destination.set(valuesToSet) : Promise.resolve(),
    keysToRemove.length > 0 ? destination.remove(keysToRemove) : Promise.resolve(),
  ]);
}

async function hydratePreferences(storage: SyncedPreferenceStorage): Promise<void> {
  const keys = [...SYNCED_PREFERENCE_KEYS];
  const [localValues, syncedValues] = await Promise.all([
    storage.local.get(keys),
    storage.sync.get(keys),
  ]);
  const localChanges: Array<[SyncedPreferenceKey, StorageChangeLike]> = [];
  const syncChanges: Array<[SyncedPreferenceKey, StorageChangeLike]> = [];

  for (const key of SYNCED_PREFERENCE_KEYS) {
    if (owns(syncedValues, key) && typeof syncedValues[key] === 'boolean') {
      localChanges.push([key, { newValue: syncedValues[key] }]);
    } else if (owns(localValues, key) && typeof localValues[key] === 'boolean') {
      syncChanges.push([key, { newValue: localValues[key] }]);
    }
  }

  await Promise.all([
    applyChanges(storage.local, localChanges),
    applyChanges(storage.sync, syncChanges),
  ]);
}

/**
 * Hydrate local preferences from sync and mirror subsequent safe preference
 * changes in both directions. Returns a cleanup function for tests/reloads.
 */
export async function initializeSyncedPreferences(
  storage: SyncedPreferenceStorage = chrome.storage,
  onMirrorError: (error: unknown) => void = () => undefined,
): Promise<() => void> {
  const listener: StorageChangeListener = (changes, areaName) => {
    const changesToMirror = allowedChanges(changes);
    if (areaName === 'local') {
      void applyChanges(storage.sync, changesToMirror).catch(onMirrorError);
    } else if (areaName === 'sync') {
      void applyChanges(storage.local, changesToMirror).catch(onMirrorError);
    }
  };

  storage.onChanged.addListener(listener);
  try {
    await hydratePreferences(storage);
  } catch (error) {
    storage.onChanged.removeListener(listener);
    throw error;
  }

  return () => storage.onChanged.removeListener(listener);
}
