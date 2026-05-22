/**
 * Settings key-value store backed by SQLite.
 * For performance-sensitive preferences use the MMKV layer (lib/mmkv.ts).
 * This module handles settings that must co-locate with conversation data
 * (e.g., per-conversation overrides, per-model preferences).
 */

import { getDb } from './db';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?;', [
    key,
  ]);
  return r?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    [key, value],
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM settings WHERE key = ?;', [key]);
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings;',
  );
  return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
}
