
import { getDb } from '@/storage/db';
import {
  insertDocChunks,
  deleteDocChunks,
  getDocChunksByIds,
  type DocChunk,
} from '@/storage/docChunks';
import type { ParsedDocument, SupportedDocType } from '@/services/docParser';

const EMBEDDING_DIM = 384;

export interface ChunkingOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

export interface Chunk {
  id: string;
  conversation_id: string;
  chunk_index: number;
  text: string;
  token_count: number;
  doc_type: SupportedDocType;
  source_uri: string | null;
}

function estimateTokens(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  return Math.ceil(words * 1.3);
}

function chunkText(text: string, targetTokens: number, overlapTokens: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const targetWords = Math.floor(targetTokens / 1.3);
  const overlapWords = Math.floor(overlapTokens / 1.3);

  if (words.length <= targetWords) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + targetWords, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start = end - overlapWords;
  }
  return chunks;
}

function generateChunkId(conversationId: string, index: number): string {
  return `${conversationId}_chunk_${index}`;
}

function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function chunkIdLikePattern(conversationId: string): string {
  return `${escapeLikeLiteral(conversationId)}\\_chunk\\_%`;
}

async function ensureDocChunkVecTable(db: Awaited<ReturnType<typeof getDb>>): Promise<boolean> {
  try {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunk_vectors USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding FLOAT[${EMBEDDING_DIM}]
      );
    `);
    return true;
  } catch (error) {
    console.warn('[ragIndex] sqlite-vec table unavailable; using text fallback:', error);
    return false;
  }
}

async function vectorizeText(text: string): Promise<Float32Array | null> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return null;

  const vec = new Float32Array(EMBEDDING_DIM);

  const len = normalized.length;
  for (let i = 0; i < len - 2; i++) {
    let h = 2166136261;
    h = (h ^ normalized.charCodeAt(i)) * 16777619;
    h = (h ^ normalized.charCodeAt(i + 1)) * 16777619;
    h = (h ^ normalized.charCodeAt(i + 2)) * 16777619;
    const bucket = (h >>> 0) % EMBEDDING_DIM;
    vec[bucket] += 1;
  }

  for (let i = 0; i < len; i++) {
    const bucket = ((normalized.charCodeAt(i) * 16777619) >>> 0) % EMBEDDING_DIM;
    vec[bucket] += 0.25;
  }

  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

export async function indexDocument(
  conversationId: string,
  parsed: ParsedDocument,
  opts: ChunkingOptions = {},
  sourceUri?: string,
): Promise<void> {
  const targetTokens = opts.targetTokens ?? 500;
  const overlapTokens = opts.overlapTokens ?? 50;

  const rawChunks = chunkText(parsed.text, targetTokens, overlapTokens);
  if (rawChunks.length === 0) return;

  const db = await getDb();
  const vecAvailable = await ensureDocChunkVecTable(db);

  const chunks: DocChunk[] = rawChunks.map((text, index) => ({
    id: generateChunkId(conversationId, index),
    conversation_id: conversationId,
    chunk_index: index,
    text,
    token_count: estimateTokens(text),
    doc_type: parsed.metadata.docType,
    source_uri: sourceUri ?? null,
    created_at: Date.now(),
  }));

  await insertDocChunks(chunks);

  if (vecAvailable) {
    for (const chunk of chunks) {
      const embedding = await vectorizeText(chunk.text);
      if (embedding) {
        try {
          await db.runAsync(
            'INSERT OR REPLACE INTO doc_chunk_vectors (chunk_id, embedding) VALUES (?, ?);',
            [chunk.id, embedding as unknown as string],
          );
        } catch (error) {
          console.warn('[ragIndex] Failed to persist chunk vector; using text fallback:', error);
        }
      }
    }
  }
}

export async function retrieve(conversationId: string, query: string, k = 5): Promise<Chunk[]> {
  const db = await getDb();

  const queryEmbedding = await vectorizeText(query);

  if (queryEmbedding) {
    try {
      const rows = await db.getAllAsync<{ chunk_id: string }>(
        `SELECT chunk_id FROM doc_chunk_vectors
         WHERE embedding MATCH ?
           AND chunk_id LIKE ? ESCAPE '\\'
         ORDER BY distance LIMIT ?;`,
        [queryEmbedding as unknown as string, chunkIdLikePattern(conversationId), k],
      );
      if (rows.length > 0) {
        const ids = rows.map((r: { chunk_id: string }) => r.chunk_id);
        const fullChunks = await getDocChunksByIds(ids);
        return fullChunks;
      }
    } catch (error) {
      console.warn('[ragIndex] Vector retrieval failed; using text fallback:', error);
    }
  }

  const allChunks = await db.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM doc_chunks WHERE conversation_id = ? ORDER BY chunk_index ASC LIMIT ?;',
    [conversationId, k],
  );
  return allChunks.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    conversation_id: r.conversation_id as string,
    chunk_index: r.chunk_index as number,
    text: r.text as string,
    token_count: r.token_count as number,
    doc_type: r.doc_type as SupportedDocType,
    source_uri: (r.source_uri as string | null) ?? null,
  }));
}

export async function deleteDocument(conversationId: string): Promise<void> {
  const db = await getDb();
  await deleteDocChunks(conversationId);
  try {
    await db.runAsync(`DELETE FROM doc_chunk_vectors WHERE chunk_id LIKE ? ESCAPE '\\';`, [
      chunkIdLikePattern(conversationId),
    ]);
  } catch (error) {
    console.warn('[ragIndex] Vector cleanup skipped:', error);
  }
}
