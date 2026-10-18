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
