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
