import { getDb } from './db';
import type { SupportedDocType } from '../services/docParser';

export interface DocChunk {
  id: string;
  conversation_id: string;
  chunk_index: number;
  text: string;
  token_count: number;
  doc_type: SupportedDocType;
  source_uri: string | null;
  created_at: number;
}

function row2chunk(r: Record<string, unknown>): DocChunk {
  return {
    id: r.id as string,
    conversation_id: r.conversation_id as string,
    chunk_index: r.chunk_index as number,
    text: r.text as string,
    token_count: r.token_count as number,
    doc_type: r.doc_type as SupportedDocType,
    source_uri: (r.source_uri as string | null) ?? null,
    created_at: r.created_at as number,
  };
}

export async function insertDocChunks(chunks: DocChunk[]): Promise<void> {
  if (chunks.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const chunk of chunks) {
      await db.runAsync(
        `INSERT OR REPLACE INTO doc_chunks
           (id, conversation_id, chunk_index, text, token_count, doc_type, source_uri, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          chunk.id,
          chunk.conversation_id,
          chunk.chunk_index,
          chunk.text,
          chunk.token_count,
          chunk.doc_type,
          chunk.source_uri ?? null,
          chunk.created_at,
        ],
      );
    }
  });
}

export async function getDocChunks(conversationId: string): Promise<DocChunk[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM doc_chunks WHERE conversation_id = ? ORDER BY chunk_index ASC;',
    [conversationId],
  );
  return rows.map(row2chunk);
}

export async function deleteDocChunks(conversationId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM doc_chunks WHERE conversation_id = ?;', [conversationId]);
}

export async function getDocChunksByIds(ids: string[]): Promise<DocChunk[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM doc_chunks WHERE id IN (${placeholders});`,
    ids,
  );
  const chunks = rows.map(row2chunk);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is DocChunk => c != null);
}
