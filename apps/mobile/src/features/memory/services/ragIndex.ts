/**
 * sqlite-vec RAG index for on-device doc Q&A (Wave 0 scaffold).
 *
 * Chunking: ~500-token chunks with 50-token overlap. Token counting uses a
 * whitespace approximation (1 word ≈ 1.3 tokens) which is accurate enough for
 * chunk-boundary decisions without a real tokenizer dependency.
 *
 * Embedding model: nomic-embed-text-v1.5 (384-dim).
 * TODO(embedding-model): replace EMBEDDING_MODEL_ID stub once the model-catalog
 * engineer adds an embedding entry to packages/local-llm/src/catalog.ts.
 * Track: model-catalog-engineer task #18.
 */

import { getDb } from '@/storage/db';
import {
  insertDocChunks,
  deleteDocChunks,
  getDocChunksByIds,
  type DocChunk,
} from '@/storage/docChunks';
import type { ParsedDocument, SupportedDocType } from '@/services/docParser';

// TODO(embedding-model): replace with getModelById() from @agiworkforce/types once
// the model catalog has an embedding entry (task #18). EMBEDDING_MODEL_ID is kept
// as a named constant pointing to where the catalog lookup should land.
const EMBEDDING_MODEL_ID = 'nomic-embed-text-v1.5'; // placeholder — see TODO above
const EMBEDDING_DIM = 384;

export interface ChunkingOptions {
  /** Target token count per chunk (default: 500) */
  targetTokens?: number;
  /** Overlap token count between consecutive chunks (default: 50) */
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

// Whitespace-based token count approximation: 1 word ≈ 1.3 tokens.
// Accurate enough for chunk boundary decisions; avoids a tokenizer dependency.
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

  // Convert target/overlap from tokens → words (inverse of the 1.3 factor)
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

async function ensureDocChunkVecTable(db: Awaited<ReturnType<typeof getDb>>): Promise<boolean> {
  try {
    await db.execAsync(`
      CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunk_vectors USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding FLOAT[${EMBEDDING_DIM}]
      );
    `);
    return true;
  } catch {
    // sqlite-vec not available in this build — vector retrieval will fall back
    // to returning all chunks ordered by position.
    return false;
  }
}

/**
 * Character n-gram feature-hashing fallback embedding.
 *
 * Produces a unit-normalised Float32Array(384) from the input text using
 * trigram feature hashing into EMBEDDING_DIM buckets. This is not a neural
 * embedding — it cannot capture semantic similarity — but it:
 *   1. Returns a non-null vector so the sqlite-vec roundtrip works in tests.
 *   2. Gives documents with overlapping character sequences closer cosine
 *      distances than a zero vector would.
 *   3. Is entirely deterministic and requires no model download.
 *
 * TODO(embedding-model): replace this with a real on-device embedding call
 * using EMBEDDING_MODEL_ID once task #18 lands and the model catalog has an
 * embedding entry. The call signature is intentionally async so the real
 * implementation can be dropped in without changing callers.
 */
async function embedText(text: string): Promise<Float32Array | null> {
  void EMBEDDING_MODEL_ID; // referenced so the constant is not an unused-var lint error

  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return null;

  const vec = new Float32Array(EMBEDDING_DIM);

  // Trigram feature hashing: for each 3-char window compute a stable bucket
  // index using a simple polynomial hash and accumulate a count.
  const len = normalized.length;
  for (let i = 0; i < len - 2; i++) {
    // FNV-1a–inspired: combine char codes with multiply-xor so collisions are
    // spread across the bucket range rather than clustered at low indices.
    let h = 2166136261; // FNV offset basis (32-bit)
    h = (h ^ normalized.charCodeAt(i)) * 16777619;
    h = (h ^ normalized.charCodeAt(i + 1)) * 16777619;
    h = (h ^ normalized.charCodeAt(i + 2)) * 16777619;
    // Map to [0, EMBEDDING_DIM) with unsigned right-shift to avoid negatives.
    const bucket = (h >>> 0) % EMBEDDING_DIM;
    vec[bucket] += 1;
  }

  // Also hash unigrams so very short texts (< 3 chars) still get signal.
  for (let i = 0; i < len; i++) {
    const bucket = ((normalized.charCodeAt(i) * 16777619) >>> 0) % EMBEDDING_DIM;
    vec[bucket] += 0.25;
  }

  // L2-normalise to unit length so cosine-distance comparisons are meaningful.
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
      const embedding = await embedText(chunk.text);
      if (embedding) {
        try {
          await db.runAsync(
            'INSERT OR REPLACE INTO doc_chunk_vectors (chunk_id, embedding) VALUES (?, ?);',
            [chunk.id, embedding as unknown as string],
          );
        } catch {
          // Insertion failure is non-fatal — text fallback remains available.
        }
      }
    }
  }
}

export async function retrieve(conversationId: string, query: string, k = 5): Promise<Chunk[]> {
  const db = await getDb();

  const queryEmbedding = await embedText(query);

  if (queryEmbedding) {
    try {
      const rows = await db.getAllAsync<{ chunk_id: string }>(
        `SELECT chunk_id FROM doc_chunk_vectors
         WHERE embedding MATCH ?
           AND chunk_id LIKE ?
         ORDER BY distance LIMIT ?;`,
        [queryEmbedding as unknown as string, `${conversationId}_chunk_%`, k],
      );
      if (rows.length > 0) {
        const ids = rows.map((r: { chunk_id: string }) => r.chunk_id);
        const fullChunks = await getDocChunksByIds(ids);
        return fullChunks;
      }
    } catch {
      // sqlite-vec unavailable or query failed — fall through to text fallback.
    }
  }

  // Text fallback: return the first K chunks in document order.
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
    await db.runAsync(`DELETE FROM doc_chunk_vectors WHERE chunk_id LIKE ?;`, [
      `${conversationId}_chunk_%`,
    ]);
  } catch {
    // sqlite-vec table may not exist.
  }
}
