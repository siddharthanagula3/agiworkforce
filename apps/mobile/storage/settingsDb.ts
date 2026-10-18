import { getDb } from './db';

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings;',
  );
  return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
}
