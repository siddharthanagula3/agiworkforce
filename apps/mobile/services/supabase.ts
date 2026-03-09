import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/constants';
import { storage } from '@/lib/mmkv';

// SecureStore has a 2 KB per-value limit. Supabase session JSON can exceed this,
// so large values are split into 1900-byte chunks stored under key__chunk_N.
const CHUNK_SIZE = 1900;
const CHUNK_COUNT_SUFFIX = '__chunk_count';

async function secureGet(key: string): Promise<string | null> {
  try {
    // Try direct read first (values that fit in a single chunk).
    const direct = await SecureStore.getItemAsync(key);
    if (direct !== null) return direct;

    // Check for chunked data.
    const countStr = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX);
    if (!countStr) return null;
    const count = parseInt(countStr, 10);
    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}__chunk_${i}`);
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  } catch {
    // SecureStore unavailable (e.g., simulator without keychain) — fall back to MMKV.
    return storage.getString(key) ?? null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      // Clean up any stale chunked data from a previous larger write.
      await secureRemoveChunks(key);
    } else {
      // Split into chunks.
      const count = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < count; i++) {
        await SecureStore.setItemAsync(
          `${key}__chunk_${i}`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        );
      }
      await SecureStore.setItemAsync(key + CHUNK_COUNT_SUFFIX, String(count));
      // Remove any direct-key value that may have existed previously.
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
  } catch {
    // Fall back to MMKV if SecureStore is unavailable.
    storage.set(key, value);
  }
}

async function secureRemoveChunks(key: string): Promise<void> {
  const countStr = await SecureStore.getItemAsync(key + CHUNK_COUNT_SUFFIX).catch(() => null);
  if (!countStr) return;
  const count = parseInt(countStr, 10);
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(`${key}__chunk_${i}`).catch(() => {});
  }
  await SecureStore.deleteItemAsync(key + CHUNK_COUNT_SUFFIX).catch(() => {});
}

async function secureRemove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
    await secureRemoveChunks(key);
  } catch {
    storage.delete(key);
  }
}

/**
 * SecureStore-backed storage adapter for Supabase auth sessions.
 * Auth tokens (JWTs) are stored in the iOS/Android Keychain via expo-secure-store
 * rather than plain MMKV, providing encryption at rest.
 * Large session values are automatically chunked to respect SecureStore's 2 KB limit.
 * Falls back to MMKV if SecureStore is unavailable (e.g., some simulators).
 * MMKV is retained for non-sensitive UI state (preferences, chat history, etc.).
 */
const supabaseStorage = {
  getItem: (key: string): Promise<string | null> => secureGet(key),
  setItem: (key: string, value: string): Promise<void> => secureSet(key, value),
  removeItem: (key: string): Promise<void> => secureRemove(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: supabaseStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
