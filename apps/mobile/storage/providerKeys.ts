/**
 * Provider key metadata repository.
 * Actual API key bytes are stored ONLY in iOS Keychain / Android Keystore
 * (expo-secure-store). This table holds only non-secret metadata + the
 * keychain_ref pointer used to retrieve the real key at runtime.
 */

import { getDb } from './db';
import type { ProviderKeyRecord } from './types';

function row2key(r: Record<string, unknown>): ProviderKeyRecord {
  return {
    id: r.id as string,
    provider: r.provider as string,
    prefix: (r.prefix as string | null) ?? null,
    display_name: (r.display_name as string | null) ?? null,
    keychain_ref: r.keychain_ref as string,
    scopes: (r.scopes as string | null) ?? null,
    created_at: r.created_at as number,
    last_used_at: (r.last_used_at as number | null) ?? null,
    revoked_at: (r.revoked_at as number | null) ?? null,
  };
}

export async function insertProviderKey(record: ProviderKeyRecord): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO provider_keys
       (id, provider, prefix, display_name, keychain_ref, scopes, created_at, last_used_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      record.id,
      record.provider,
      record.prefix ?? null,
      record.display_name ?? null,
      record.keychain_ref,
      record.scopes ?? null,
      record.created_at,
      record.last_used_at ?? null,
      record.revoked_at ?? null,
    ],
  );
}

export async function listProviderKeys(provider?: string): Promise<ProviderKeyRecord[]> {
  const db = await getDb();
  if (provider) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM provider_keys WHERE provider = ? AND revoked_at IS NULL ORDER BY created_at DESC;',
      [provider],
    );
    return rows.map(row2key);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM provider_keys WHERE revoked_at IS NULL ORDER BY provider ASC, created_at DESC;',
  );
  return rows.map(row2key);
}

export async function getProviderKey(id: string): Promise<ProviderKeyRecord | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM provider_keys WHERE id = ?;',
    [id],
  );
  return r ? row2key(r) : null;
}

export async function touchProviderKey(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE provider_keys SET last_used_at = ? WHERE id = ?;', [Date.now(), id]);
}

export async function revokeProviderKey(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE provider_keys SET revoked_at = ? WHERE id = ?;', [Date.now(), id]);
}

export async function deleteProviderKey(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM provider_keys WHERE id = ?;', [id]);
}
