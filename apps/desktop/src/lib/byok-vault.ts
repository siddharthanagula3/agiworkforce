
import {
  Client,
  Stronghold,
  // Store uses string keys over get/insert/remove from the stronghold store API.
} from '@tauri-apps/plugin-stronghold';
import { appDataDir, join } from '@tauri-apps/api/path';

let _stronghold: Stronghold | null = null;
let _client: Client | null = null;

const SNAPSHOT_FILE = 'keys.stronghold';
const CLIENT_NAME = 'byok-keys';

async function snapshotPath(): Promise<string> {
  const dataDir = await appDataDir();
  return join(dataDir, SNAPSHOT_FILE);
}

export async function vaultInit(password: string): Promise<void> {
  const path = await snapshotPath();
  _stronghold = await Stronghold.load(path, password);
  try {
    _client = await _stronghold.loadClient(CLIENT_NAME);
  } catch {
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

export async function vaultDelete(provider: string): Promise<void> {
  const client = assertOpen();
  const store = client.getStore();
  await store.remove(provider);
  await vaultSave();
}

export async function vaultSave(): Promise<void> {
  if (_stronghold) {
    await _stronghold.save();
  }
}

export function vaultClose(): void {
  _stronghold = null;
  _client = null;
}
