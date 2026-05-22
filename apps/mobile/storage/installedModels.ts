import type { InstalledModel } from './types';
import { getDb } from './db';

function row2model(row: Record<string, unknown>): InstalledModel {
  return {
    id: row.id as string,
    display_name: row.display_name as string,
    runtime: row.runtime as InstalledModel['runtime'],
    format: row.format as InstalledModel['format'],
    size_bytes: row.size_bytes as number,
    sha256: (row.sha256 as string | null) ?? null,
    local_path: (row.local_path as string | null) ?? null,
    installed_at: row.installed_at as number,
    last_used_at: (row.last_used_at as number | null) ?? null,
    capabilities: (row.capabilities as string | null) ?? null,
  };
}

export async function listInstalledModels(): Promise<InstalledModel[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM installed_models ORDER BY last_used_at DESC, installed_at DESC;',
  );
  return rows.map(row2model);
}

export async function getInstalledModel(id: string): Promise<InstalledModel | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM installed_models WHERE id = ?;',
    [id],
  );
  return row ? row2model(row) : null;
}

export async function recordInstalledModel(model: InstalledModel): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO installed_models
       (id, display_name, runtime, format, size_bytes, sha256, local_path, installed_at, last_used_at, capabilities)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       runtime = excluded.runtime,
       format = excluded.format,
       size_bytes = excluded.size_bytes,
       sha256 = excluded.sha256,
       local_path = excluded.local_path,
       installed_at = excluded.installed_at,
       last_used_at = excluded.last_used_at,
       capabilities = excluded.capabilities;`,
    [
      model.id,
      model.display_name,
      model.runtime,
      model.format,
      model.size_bytes,
      model.sha256 ?? null,
      model.local_path ?? null,
      model.installed_at,
      model.last_used_at ?? null,
      model.capabilities ?? null,
    ],
  );
}

export const insertInstalledModel = recordInstalledModel;

export async function markInstalledModelUsed(id: string, usedAt = Date.now()): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE installed_models SET last_used_at = ? WHERE id = ?;', [usedAt, id]);
}

export async function removeInstalledModel(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM installed_models WHERE id = ?;', [id]);
}

export const deleteInstalledModel = removeInstalledModel;
