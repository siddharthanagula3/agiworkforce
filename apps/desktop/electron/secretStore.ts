/**
 * OS-encrypted secret storage for the cloud shell's first-party tokens.
 *
 * Plays the role the OS keyring plays for the Tauri shell
 * (`account_store_access_token` & co in `src-tauri/src/sys/account/mod.rs`):
 * values are encrypted with Electron `safeStorage` (Keychain-backed on macOS)
 * and written to a file in `userData`. Secrets never transit the renderer
 * except as the return value of an allowlisted bridge command.
 */
import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SECRET_KEYS = ['api_base_url', 'access_token', 'refresh_token'] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

export function isSecretKey(key: string): key is SecretKey {
  return (SECRET_KEYS as readonly string[]).includes(key);
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'cloud-account.json');
}

type StoreShape = Partial<Record<SecretKey, string>>;

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as StoreShape;
  } catch {
    return {};
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  await fs.writeFile(storePath(), JSON.stringify(store), { mode: 0o600 });
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level encryption is not available; refusing to store the credential.');
  }
  const store = await readStore();
  store[key] = safeStorage.encryptString(value).toString('base64');
  await writeStore(store);
}

export async function getSecret(key: SecretKey): Promise<string | null> {
  const store = await readStore();
  const encrypted = store[key];
  if (!encrypted) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    // Encryption key changed (OS reinstall, keychain reset) — treat as signed out.
    return null;
  }
}

export async function clearSecrets(keys: readonly SecretKey[]): Promise<void> {
  const store = await readStore();
  for (const key of keys) {
    delete store[key];
  }
  await writeStore(store);
}
