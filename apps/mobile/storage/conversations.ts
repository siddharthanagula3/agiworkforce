import { getDb } from './db';
import type { Conversation, ChatMode } from './types';

function row2conv(r: Record<string, unknown>): Conversation {
  return {
    id: r.id as string,
    title: r.title as string,
    default_mode: r.default_mode as ChatMode,
    default_provider: (r.default_provider as string | null) ?? null,
    default_model: (r.default_model as string | null) ?? null,
    created_at: r.created_at as number,
    updated_at: r.updated_at as number,
    archived_at: (r.archived_at as number | null) ?? null,
    pinned: !!(r.pinned as number),
  };
}

export async function insertConversation(
  conv: Omit<Conversation, 'pinned'> & { pinned?: boolean },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO conversations
       (id, title, default_mode, default_provider, default_model, created_at, updated_at, archived_at, pinned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      conv.id,
      conv.title,
      conv.default_mode,
      conv.default_provider ?? null,
      conv.default_model ?? null,
      conv.created_at,
      conv.updated_at,
      conv.archived_at ?? null,
      conv.pinned ? 1 : 0,
    ],
  );
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM conversations WHERE id = ?;',
    [id],
  );
  return r ? row2conv(r) : null;
}

export async function listConversations(opts?: {
  archived?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Conversation[]> {
  const db = await getDb();
  const archived = opts?.archived ?? false;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM conversations
     WHERE (archived_at IS ${archived ? 'NOT NULL' : 'NULL'})
     ORDER BY pinned DESC, updated_at DESC
     LIMIT ? OFFSET ?;`,
    [limit, offset],
  );
  return rows.map(row2conv);
}

export async function updateConversation(
  id: string,
  patch: Partial<
    Pick<
      Conversation,
      'title' | 'default_mode' | 'default_provider' | 'default_model' | 'archived_at' | 'pinned'
    >
  >,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (patch.title !== undefined) {
    sets.push('title = ?');
    vals.push(patch.title);
  }
  if (patch.default_mode !== undefined) {
    sets.push('default_mode = ?');
    vals.push(patch.default_mode);
  }
  if (patch.default_provider !== undefined) {
    sets.push('default_provider = ?');
    vals.push(patch.default_provider);
  }
  if (patch.default_model !== undefined) {
    sets.push('default_model = ?');
    vals.push(patch.default_model);
  }
  if (patch.archived_at !== undefined) {
    sets.push('archived_at = ?');
    vals.push(patch.archived_at);
  }
  if (patch.pinned !== undefined) {
    sets.push('pinned = ?');
    vals.push(patch.pinned ? 1 : 0);
  }

  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(id);

  await db.runAsync(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?;`, vals);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE memory_facts SET source_conversation_id = NULL WHERE source_conversation_id = ?;',
      [id],
    );
    await db.runAsync('DELETE FROM conversations WHERE id = ?;', [id]);
  });
}
