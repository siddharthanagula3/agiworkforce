/**
 * byok-vault.ts — BYOK encrypted key vault helpers for Desktop.
 *
 * Wraps tauri-plugin-stronghold v2.3.1 (MIT/Apache-2.0) store commands
 * with a fixed snapshot path ($APPDATA/keys.stronghold) and a single
 * "byok-keys" client so callers need no knowledge of stronghold internals.
 *
 * Trust boundary: BYOK only.  These helpers never route keys to cloud.
 * The snapshot is Argon2id-encrypted and stored locally only.
 *
 * Usage:
 *   await vaultInit("user-chosen-password");     // unlock/create vault
 *   await vaultSet("openai", "<key>");           // store a provider key
 *   const k = await vaultGet("openai");          // retrieve; null if absent
 *   await vaultDelete("openai");                 // remove
 *   await vaultSave();                           // flush to disk
 */

import {
  Client,
  Stronghold,
  // Store uses string keys over get/insert/remove from the stronghold store API.
} from '@tauri-apps/plugin-stronghold';
import { appDataDir, join } from '@tauri-apps/api/path';

// Singleton handles — re-used across calls within a session.
let _stronghold: Stronghold | null = null;
let _client: Client | null = null;

const SNAPSHOT_FILE = 'keys.stronghold';
const CLIENT_NAME = 'byok-keys';

/** Resolve the platform-appropriate snapshot path once. */
async function snapshotPath(): Promise<string> {
  const dataDir = await appDataDir();
  return join(dataDir, SNAPSHOT_FILE);
}

/**
 * Open (or create) the encrypted vault with the given password.
 * Must be called once per session before vaultSet/vaultGet/vaultDelete.
 * Throws on bad password or I/O failure (fail-closed).
 */
export async function vaultInit(password: string): Promise<void> {
  const path = await snapshotPath();
  _stronghold = await Stronghold.load(path, password);
  try {
    _client = await _stronghold.loadClient(CLIENT_NAME);
  } catch {
    // Client does not exist yet in a fresh vault — create it.
    _client = await _stronghold.createClient(CLIENT_NAME);
  }
}

function assertOpen(): Client {
  if (!_client) {
    throw new Error('BYOK vault is not open. Call vaultInit(password) first.');
  }
  return _client;
}

/**
 * Store a BYOK provider API key.
 * @param provider  Provider identifier, e.g. "openai" | "anthropic"
 * @param apiKey    The raw API key string (stored encrypted in stronghold)
 */
export async function vaultSet(provider: string, apiKey: string): Promise<void> {
  const client = assertOpen();
  const store = client.getStore();
  await store.insert(provider, Array.from(new TextEncoder().encode(apiKey)));
  await vaultSave();
}

/**
 * Retrieve a stored BYOK provider API key.
 * @returns The key string, or null if not stored.
 */
export async function vaultGet(provider: string): Promise<string | null> {
  const client = assertOpen();
  const store = client.getStore();
  const raw = await store.get(provider);
  if (raw === null || raw === undefined) return null;
  return new TextDecoder().decode(new Uint8Array(raw));
}

/**
 * Delete a stored BYOK provider API key.
 */
export async function vaultDelete(provider: string): Promise<void> {
  const client = assertOpen();
  const store = client.getStore();
  await store.remove(provider);
  await vaultSave();
}

/**
 * Flush the in-memory stronghold state to the encrypted snapshot on disk.
 * Called automatically by vaultSet/vaultDelete; call explicitly if needed.
 */
export async function vaultSave(): Promise<void> {
  if (_stronghold) {
    await _stronghold.save();
  }
}

/**
 * Close the vault, clearing the in-memory handles.
 * The on-disk snapshot remains encrypted.
 */
export function vaultClose(): void {
  _stronghold = null;
  _client = null;
}
