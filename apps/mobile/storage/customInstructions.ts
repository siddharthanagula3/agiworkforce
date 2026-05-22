import { getDb } from './db';
import type { CustomInstruction } from './types';

function row2ci(r: Record<string, unknown>): CustomInstruction {
  return {
    id: r.id as string,
    name: r.name as string,
    content: r.content as string,
    active: !!(r.active as number),
    created_at: r.created_at as number,
  };
}

export async function upsertCustomInstruction(ci: CustomInstruction): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO custom_instructions (id, name, content, active, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content, active = excluded.active;`,
    [ci.id, ci.name, ci.content, ci.active ? 1 : 0, ci.created_at],
  );
}

export async function listCustomInstructions(activeOnly = true): Promise<CustomInstruction[]> {
  const db = await getDb();
  if (activeOnly) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      'SELECT * FROM custom_instructions WHERE active = 1 ORDER BY name ASC;',
    );
    return rows.map(row2ci);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM custom_instructions ORDER BY name ASC;',
  );
  return rows.map(row2ci);
}

export async function getActiveDefaultInstruction(): Promise<CustomInstruction | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM custom_instructions WHERE name = 'default' AND active = 1 LIMIT 1;",
  );
  return r ? row2ci(r) : null;
}

export async function deleteCustomInstruction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM custom_instructions WHERE id = ?;', [id]);
}
