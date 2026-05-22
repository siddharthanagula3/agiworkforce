import { getDb } from './db';
import type { Message, ChatMode, MessageRole } from './types';

function row2msg(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    conversation_id: r.conversation_id as string,
    role: r.role as MessageRole,
    content: r.content as string,
    mode: r.mode as ChatMode,
    provider: (r.provider as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    runtime: (r.runtime as string | null) ?? null,
    tokens_in: (r.tokens_in as number | null) ?? null,
    tokens_out: (r.tokens_out as number | null) ?? null,
    duration_ms: (r.duration_ms as number | null) ?? null,
    attachments: (r.attachments as string | null) ?? null,
    created_at: r.created_at as number,
    parent_message_id: (r.parent_message_id as string | null) ?? null,
  };
}

export async function insertMessage(msg: Message): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO messages
       (id, conversation_id, role, content, mode, provider, model, runtime,
        tokens_in, tokens_out, duration_ms, attachments, created_at, parent_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      msg.id,
      msg.conversation_id,
      msg.role,
      msg.content,
      msg.mode,
      msg.provider ?? null,
      msg.model ?? null,
      msg.runtime ?? null,
      msg.tokens_in ?? null,
      msg.tokens_out ?? null,
      msg.duration_ms ?? null,
      msg.attachments ?? null,
      msg.created_at,
      msg.parent_message_id ?? null,
    ],
  );
}

export async function getMessagesForConversation(
  conversationId: string,
  opts?: { limit?: number; before?: number },
): Promise<Message[]> {
  const db = await getDb();
  const limit = opts?.limit ?? 100;
  if (opts?.before !== undefined) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM messages
       WHERE conversation_id = ? AND created_at < ?
       ORDER BY created_at ASC LIMIT ?;`,
      [conversationId, opts.before, limit],
    );
    return rows.map(row2msg);
  }
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?;',
    [conversationId, limit],
  );
  return rows.map(row2msg);
}

export async function updateMessageContent(
  id: string,
  content: string,
  patch?: Partial<Pick<Message, 'tokens_in' | 'tokens_out' | 'duration_ms'>>,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE messages SET content = ?,
      tokens_in = COALESCE(?, tokens_in),
      tokens_out = COALESCE(?, tokens_out),
      duration_ms = COALESCE(?, duration_ms)
     WHERE id = ?;`,
    [content, patch?.tokens_in ?? null, patch?.tokens_out ?? null, patch?.duration_ms ?? null, id],
  );
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM messages WHERE id = ?;', [id]);
}

export async function countMessages(conversationId: string): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?;',
    [conversationId],
  );
  return r?.n ?? 0;
}
