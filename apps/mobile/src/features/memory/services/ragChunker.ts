/**
 * RAG chunker — dynamic sliding-window chunking sized to the model's context window.
 *
 * Strategy per model tier:
 *   - chunk size  = 25% of contextWindow (so 4 chunks fit per query budget)
 *   - overlap     = 10% of chunk size
 *   - max chunks retrieved per query: 4 for small context (≤8K), 16 for large (>8K)
 *
 * This file coordinates with ragIndex.ts (doc-qa-engineer, task #23) by exporting
 * ChunkingOptions-compatible values. ragIndex.indexDocument() accepts these options
 * directly. ragChunker owns the sizing math; ragIndex owns persistence.
 *
 * Token estimation: whitespace approximation (1 word ≈ 1.3 tokens), matching
 * ragIndex.ts to stay consistent without adding a tokenizer dependency.
 */

import { getModelById, MODEL_LIST } from '@/lib/models';
import type { ModelDef } from '@/lib/models';

export interface RagChunkingConfig {
  /** Target tokens per chunk */
  targetTokens: number;
  /** Overlap tokens between consecutive chunks */
  overlapTokens: number;
  /** Maximum number of chunks to retrieve per query */
  maxChunksPerQuery: number;
}

const SMALL_CONTEXT_THRESHOLD = 8_000; // tokens — Apple FM 4K falls below this

function getContextWindow(modelId: string): number {
  const model = getModelById(modelId);
  if (model?.contextWindow) return model.contextWindow;
  const fallback = MODEL_LIST[0] as ModelDef | undefined;
  return fallback?.contextWindow ?? 4096;
}

/**
 * Compute chunking configuration for the given model.
 *
 * For Apple FM (4K context):
 *   targetTokens = 1024, overlapTokens = 102, maxChunksPerQuery = 4
 *
 * For Qwen3-4B (262K context):
 *   targetTokens = 65536, overlapTokens = 6553, maxChunksPerQuery = 16
 */
export function getRagChunkingConfig(modelId: string): RagChunkingConfig {
  const contextWindow = getContextWindow(modelId);
  const targetTokens = Math.floor(contextWindow * 0.25);
  const overlapTokens = Math.floor(targetTokens * 0.1);
  const maxChunksPerQuery = contextWindow <= SMALL_CONTEXT_THRESHOLD ? 4 : 16;

  return { targetTokens, overlapTokens, maxChunksPerQuery };
}

/** 1 word ≈ 1.3 tokens — matches ragIndex.ts estimateTokens for consistency. */
function estimateTokens(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  return Math.ceil(words * 1.3);
}

/** Convert token counts to approximate word counts (inverse of 1.3 factor). */
function tokensToWords(tokens: number): number {
  return Math.floor(tokens / 1.3);
}

/**
 * Chunk text using sliding window sized for the given model's context window.
 *
 * Returns an array of text chunks with associated metadata.
 */
export function chunkForModel(
  text: string,
  modelId: string,
): Array<{ text: string; tokenCount: number; chunkIndex: number }> {
  const config = getRagChunkingConfig(modelId);
  return chunkWithConfig(text, config);
}

/**
 * Chunk text with explicit config. Useful when callers have already computed
 * config via getRagChunkingConfig() and want to reuse it across documents.
 */
export function chunkWithConfig(
  text: string,
  config: RagChunkingConfig,
): Array<{ text: string; tokenCount: number; chunkIndex: number }> {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const targetWords = tokensToWords(config.targetTokens);
  const overlapWords = tokensToWords(config.overlapTokens);

  if (words.length <= targetWords) {
    return [{ text: text.trim(), tokenCount: estimateTokens(text), chunkIndex: 0 }];
  }

  const chunks: Array<{ text: string; tokenCount: number; chunkIndex: number }> = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < words.length) {
    const end = Math.min(start + targetWords, words.length);
    const chunkText = words.slice(start, end).join(' ');
    chunks.push({
      text: chunkText,
      tokenCount: estimateTokens(chunkText),
      chunkIndex,
    });
    chunkIndex++;
    if (end === words.length) break;
    start = end - overlapWords;
  }

  return chunks;
}

/**
 * Given a model ID, return how many chunks a single query should retrieve.
 * Small-context models (Apple FM 4K) cap at 4; large-context cap at 16.
 */
export function getMaxChunksForModel(modelId: string): number {
  return getRagChunkingConfig(modelId).maxChunksPerQuery;
}
