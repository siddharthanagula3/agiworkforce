import 'server-only';

import type { StreamChunk } from '@agiworkforce/types';

export interface UsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  providerReportedCostUsd?: number;
}

export function createUsageAccumulator(): UsageAccumulator {
  return { inputTokens: 0, outputTokens: 0 };
}

export function ingestUsageChunk(acc: UsageAccumulator, chunk: StreamChunk): void {
  if (chunk.type !== 'usage') return;
  if (chunk.inputTokens !== undefined) {
    acc.inputTokens = Math.max(acc.inputTokens, chunk.inputTokens);
  }
  if (chunk.outputTokens !== undefined) {
    acc.outputTokens = Math.max(acc.outputTokens, chunk.outputTokens);
  }
  if (chunk.cacheReadTokens !== undefined) {
    acc.cacheReadInputTokens = chunk.cacheReadTokens;
  }
  if (chunk.cacheWriteTokens !== undefined) {
    acc.cacheCreationInputTokens = chunk.cacheWriteTokens;
  }
  if (chunk.cacheWrite1hTokens !== undefined) {
    acc.cacheCreation1hInputTokens = chunk.cacheWrite1hTokens;
  }
  if (chunk.reasoningTokens !== undefined) {
    acc.reasoningOutputTokens = chunk.reasoningTokens;
  }
  const reportedCost = chunk.providerReportedCostUsd ?? chunk.costUsd;
  if (reportedCost !== undefined) {
    acc.providerReportedCostUsd = reportedCost;
  }
}
