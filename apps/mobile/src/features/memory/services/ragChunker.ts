
import { getModelById, MODEL_LIST } from '@/lib/models';
import type { ModelDef } from '@/lib/models';

export interface RagChunkingConfig {
  targetTokens: number;
  overlapTokens: number;
  maxChunksPerQuery: number;
}

const SMALL_CONTEXT_THRESHOLD = 8_000;

function getContextWindow(modelId: string): number {
  const model = getModelById(modelId);
  if (model?.contextWindow) return model.contextWindow;
  const fallback = MODEL_LIST[0] as ModelDef | undefined;
  return fallback?.contextWindow ?? 4096;
}

export function getRagChunkingConfig(modelId: string): RagChunkingConfig {
  const contextWindow = getContextWindow(modelId);
  const targetTokens = Math.floor(contextWindow * 0.25);
  const overlapTokens = Math.floor(targetTokens * 0.1);
  const maxChunksPerQuery = contextWindow <= SMALL_CONTEXT_THRESHOLD ? 4 : 16;

  return { targetTokens, overlapTokens, maxChunksPerQuery };
}

function estimateTokens(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  return Math.ceil(words * 1.3);
}

function tokensToWords(tokens: number): number {
  return Math.floor(tokens / 1.3);
}

export function chunkForModel(
  text: string,
  modelId: string,
): Array<{ text: string; tokenCount: number; chunkIndex: number }> {
  const config = getRagChunkingConfig(modelId);
  return chunkWithConfig(text, config);
}

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

export function getMaxChunksForModel(modelId: string): number {
  return getRagChunkingConfig(modelId).maxChunksPerQuery;
}
