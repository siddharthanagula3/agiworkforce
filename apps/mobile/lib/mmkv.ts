import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { deleteAsync, documentDirectory } from 'expo-file-system/legacy';
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';
import { reportLocalDataReset } from '@/storage/localDataReset';
import {
  deleteSetAsideCopies,
  SET_ASIDE_MARKER,
  setAsideUnreadableFiles,
} from '@/storage/unreadableFiles';

const LEGACY_KEY_STORAGE_ID = 'agi_mmkv_encryption_key_v1';
const LEGACY_INSTANCE_ID = 'agiworkforce-mobile';
const MMKV_KEY_STORAGE_ID = 'agi_mmkv_encryption_key_v2';
const MMKV_INSTANCE_ID = 'agiworkforce-mobile-v2';
const MMKV_DIRECTORY = 'mmkv';
const MMKV_COMPANION_SUFFIXES = ['.crc'] as const;

const MMKV_KEY_LENGTH = 16;
const KEY_ALPHABET_FIRST = 0x21;
const KEY_ALPHABET_SIZE = 0x7e - KEY_ALPHABET_FIRST + 1;
const UNBIASED_BYTE_LIMIT = 256 - (256 % KEY_ALPHABET_SIZE);

let _storage: MMKV | null = null;
let opening: Promise<void> | null = null;

type MmkvReadyCallback = () => void | Promise<void>;
let readyCallbacks: MmkvReadyCallback[] = [];

function observeReadyCallback(result: void | Promise<void>): void {
  if (result && typeof result.catch === 'function') {
    result.catch((err) => {
      console.warn('[mmkv] whenMmkvReady async callback rejected:', err);
    });
  }
}

export function whenMmkvReady(cb: MmkvReadyCallback): void {
  if (_storage) {
    try {
      observeReadyCallback(cb());
    } catch (err) {
      console.warn('[mmkv] whenMmkvReady callback threw:', err);
    }
    return;
  }
  readyCallbacks.push(cb);
}

function getStorage(): MMKV {
  if (!_storage) {
    return new Proxy({} as MMKV, {
      get: () => () => undefined,
    });
  }
  return _storage;
}

/**
 * MMKV encrypts with AES-128 in CFB mode keyed by the first 16 bytes of the
 * UTF-8 encoding of this string (`AES_KEY_LEN` in react-native-mmkv's
 * MMKV/Core/MMKVPredef.h), so a longer key adds nothing. Each character is one
 * UTF-8 byte of printable ASCII, never NUL (`MMKV::cryptKey` reads the key back
 * with `strnlen`), drawn by rejection sampling so every character is equally
 * likely: 16 x log2(94), about 105 bits.
 */
export async function generateMmkvEncryptionKey(): Promise<string> {
  let key = '';
  while (key.length < MMKV_KEY_LENGTH) {
    const bytes = await Crypto.getRandomBytesAsync(MMKV_KEY_LENGTH * 2);
    for (let i = 0; i < bytes.length && key.length < MMKV_KEY_LENGTH; i++) {
      const byte = bytes[i] as number;
      if (byte < UNBIASED_BYTE_LIMIT) {
        key += String.fromCharCode(KEY_ALPHABET_FIRST + (byte % KEY_ALPHABET_SIZE));
      }
    }
  }
  return key;
}

function storeUri(id: string): string | null {
  return documentDirectory ? `${documentDirectory}${MMKV_DIRECTORY}/${id}` : null;
}

async function setAsideUnreadableStore(id: string): Promise<boolean> {
  const uri = storeUri(id);
  if (!uri) return false;
  return setAsideUnreadableFiles({
    uri,
    asideUri: (attempt) =>
      `${uri}${SET_ASIDE_MARKER}${Date.now()}${attempt > 0 ? `-${attempt}` : ''}`,
    companionSuffixes: MMKV_COMPANION_SUFFIXES,
  });
}

/**
 * The keys are kept this-device-only, so a backup restored onto another phone
 * brings the stores without their keys, and opening one with a new key reads
 * back nothing. The stores are renamed instead, and the person is told why
 * their Local chats are not there.
 */
async function setAsideUnreadableStores(): Promise<void> {
  const legacySetAside = await setAsideUnreadableStore(LEGACY_INSTANCE_ID);
  const currentSetAside = await setAsideUnreadableStore(MMKV_INSTANCE_ID);
  if (legacySetAside || currentSetAside) reportLocalDataReset('chats');
}

async function deleteStoreFiles(id: string): Promise<void> {
  const uri = storeUri(id);
  if (!uri) throw new Error('The MMKV directory is not available');
  for (const suffix of ['', ...MMKV_COMPANION_SUFFIXES]) {
    await deleteAsync(`${uri}${suffix}`, { idempotent: true });
  }
}

export async function deleteSetAsideStores(): Promise<void> {
  if (documentDirectory) await deleteSetAsideCopies(`${documentDirectory}${MMKV_DIRECTORY}`);
}

function readsOf(store: MMKV, name: string): unknown[] {
  const buffer = store.getBuffer(name);
  return [
    store.getString(name),
    store.getBoolean(name),
    store.getNumber(name),
    buffer === undefined ? undefined : new Uint8Array(buffer),
  ];
}

function readAlike(from: MMKV, to: MMKV, name: string): boolean {
  const expected = readsOf(from, name);
  const actual = readsOf(to, name);
  return expected.every((value, index) => {
    const other = actual[index];
    if (value instanceof Uint8Array && other instanceof Uint8Array) {
      return value.length === other.length && value.every((byte, at) => byte === other[at]);
    }
    return Object.is(value, other);
  });
}

// MMKV keeps no value types, so each value is written in the first form that
// every reader then returns exactly as it does from the original.
function copyValue(from: MMKV, to: MMKV, name: string): void {
  const forms = [
    from.getBuffer(name) as ArrayBuffer | undefined,
    from.getBoolean(name),
    from.getNumber(name),
  ];
  for (const form of forms) {
    if (form === undefined) continue;
    to.set(name, form);
    if (readAlike(from, to, name)) return;
  }
  throw new Error('A value could not be copied exactly');
}

function copyAndVerify(from: MMKV, to: MMKV): void {
  const names = from.getAllKeys();
  for (const name of names) copyValue(from, to, name);
  to.trim();
  const copied = new Set(to.getAllKeys());
  const complete =
    copied.size === names.length &&
    names.every((name) => copied.has(name) && readAlike(from, to, name));
  if (!complete) throw new Error('The copied store does not match the original');
}

async function recordKey(key: string): Promise<void> {
  let writeError: unknown;
  try {
    await SecureStore.setItemAsync(MMKV_KEY_STORAGE_ID, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    writeError = error;
  }
  if ((await SecureStore.getItemAsync(MMKV_KEY_STORAGE_ID)) !== key) {
    throw writeError ?? new Error('The keychain did not keep the new key');
  }
}

/**
 * Copies the store into a new one under a key from generateMmkvEncryptionKey.
 * MMKV's own recrypt rewrites the file in place, and a process killed half-way
 * leaves a file neither key reads, which MMKV discards on its CRC check. The
 * copy goes to a separate file instead, and the new key reaching the keychain
 * is the switch: until then the old store and its key are untouched.
 */
async function copyToStrongerKey(legacy: MMKV): Promise<MMKV> {
  await deleteStoreFiles(MMKV_INSTANCE_ID);
  const key = await generateMmkvEncryptionKey();
  const store = new MMKV({ id: MMKV_INSTANCE_ID, encryptionKey: key });
  copyAndVerify(legacy, store);
  await recordKey(key);
  return store;
}

async function retireLegacyStore(): Promise<void> {
  try {
    if (!(await SecureStore.getItemAsync(LEGACY_KEY_STORAGE_ID))) return;
    await deleteStoreFiles(LEGACY_INSTANCE_ID);
    await SecureStore.deleteItemAsync(LEGACY_KEY_STORAGE_ID);
  } catch (error) {
    console.warn('[mmkv] Could not remove the store kept under the old key:', error);
  }
}

async function openStore(): Promise<MMKV> {
  const key = await SecureStore.getItemAsync(MMKV_KEY_STORAGE_ID);
  if (key) {
    await retireLegacyStore();
    return new MMKV({ id: MMKV_INSTANCE_ID, encryptionKey: key });
  }

  const legacyKey = await SecureStore.getItemAsync(LEGACY_KEY_STORAGE_ID);
  if (legacyKey) {
    const legacy = new MMKV({ id: LEGACY_INSTANCE_ID, encryptionKey: legacyKey });
    const store = await copyToStrongerKey(legacy).catch((error: unknown) => {
      console.warn('[mmkv] Kept the store on its old key until the next launch:', error);
      return null;
    });
    if (!store) return legacy;
    await retireLegacyStore();
    return store;
  }

  await setAsideUnreadableStores();
  const newKey = await generateMmkvEncryptionKey();
  await SecureStore.setItemAsync(MMKV_KEY_STORAGE_ID, newKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return new MMKV({ id: MMKV_INSTANCE_ID, encryptionKey: newKey });
}

async function openAndNotify(): Promise<void> {
  _storage = await openStore();

  const queued = readyCallbacks;
  readyCallbacks = [];
  for (const cb of queued) {
    try {
      await cb();
    } catch (err) {
      console.warn('[mmkv] whenMmkvReady callback threw:', err);
    }
  }
}

export async function initMmkvEncryption(): Promise<void> {
  if (_storage) return;
  opening ??= openAndNotify().finally(() => {
    opening = null;
  });
  return opening;
}

/**
 * Direct access to the underlying MMKV instance.
 * Exported for the rare cases (e.g. onboarding flag read in _layout.tsx) where
 * the Zustand adapter is not used. Always call `initMmkvEncryption()` first.
 */
export const storage = new Proxy({} as MMKV, {
  get(_target, prop) {
    return getStorage()[prop as keyof MMKV];
  },
});

export const mmkvStorage: StateStorage = {
  getItem: (name: string) => {
    const value = getStorage().getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    getStorage().set(name, value);
  },
  removeItem: (name: string) => {
    getStorage().delete(name);
  },
};

/**
 * Shared MMKV-race helper for Zustand persist stores.
 *
 * Persist-enabled stores must defer `persist.rehydrate()` until the encrypted
 * MMKV instance is ready. This helper consolidates that pattern so:
 *   1. New stores opt in via one call, not three lines.
 *   2. Structured logging / metrics around rehydration timing have one place
 *      to change.
 *   3. The shape `{ persist: { rehydrate(): Promise<void> | void } }` is
 *      enforced statically rather than via duck-typing.
 *
 * Use this in new persist-enabled stores; existing call sites can migrate
 * opportunistically.
 */
export interface RehydratableStore {
  persist: {
    rehydrate: () => Promise<void> | void;
  };
}

export function rehydrateWhenMmkvReady(store: RehydratableStore, storeName: string): void {
  whenMmkvReady(() => {
    try {
      const result = store.persist.rehydrate();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        return (result as Promise<void>).catch((err) => {
          console.warn(`[mmkv] ${storeName} async rehydrate failed:`, err);
        });
      }
    } catch (err) {
      console.warn(`[mmkv] ${storeName} sync rehydrate threw:`, err);
    }
  });
}
