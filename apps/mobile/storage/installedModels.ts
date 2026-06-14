import type { InstalledModel } from './types';
import { getDb } from './db';

const MODEL_RUNTIMES = new Set<InstalledModel['runtime']>(['local', 'cloud']);
const MODEL_FORMATS = new Set<InstalledModel['format']>([
  'gguf',
  'safetensors',
  'mlx',
  'onnx',
  'pte',
]);

function requireString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`Invalid installed_models row: ${key} must be a non-empty string.`);
}

function requireNumber(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Invalid installed_models row: ${key} must be a finite number.`);
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value === 'string') return value;
  throw new Error(`Invalid installed_models row: ${key} must be a string or null.`);
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`Invalid installed_models row: ${key} must be a finite number or null.`);
}

function row2model(row: Record<string, unknown>): InstalledModel {
  const runtime = requireString(row, 'runtime') as InstalledModel['runtime'];
  const format = requireString(row, 'format') as InstalledModel['format'];
  if (!MODEL_RUNTIMES.has(runtime)) {
    throw new Error(`Invalid installed_models row: unsupported runtime "${runtime}".`);
  }
  if (!MODEL_FORMATS.has(format)) {
    throw new Error(`Invalid installed_models row: unsupported format "${format}".`);
  }

  return {
    id: requireString(row, 'id'),
    display_name: requireString(row, 'display_name'),
    runtime,
    format,
    size_bytes: requireNumber(row, 'size_bytes'),
    sha256: nullableString(row, 'sha256'),
    local_path: nullableString(row, 'local_path'),
    installed_at: requireNumber(row, 'installed_at'),
    last_used_at: nullableNumber(row, 'last_used_at'),
    capabilities: nullableString(row, 'capabilities'),
  };
}

function safeRow2Model(row: Record<string, unknown>): InstalledModel | null {
  try {
    return row2model(row);
  } catch (error) {
    console.warn('[installedModels] Ignoring malformed installed model row:', error);
    return null;
  }
}

export async function listInstalledModels(): Promise<InstalledModel[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM installed_models ORDER BY last_used_at DESC, installed_at DESC;',
  );
  return rows.map(safeRow2Model).filter((model): model is InstalledModel => model !== null);
}

export async function getInstalledModel(id: string): Promise<InstalledModel | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM installed_models WHERE id = ?;',
    [id],
  );
  return row ? safeRow2Model(row) : null;
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
