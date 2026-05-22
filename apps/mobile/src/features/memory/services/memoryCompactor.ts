/**
 * Memory compactor — when context budget hits 80%, summarizes older 50% of
 * turns into a single synthetic "summary" message and drops the original turns,
 * preserving the most recent 50% verbatim.
 *
 * Compaction is intentionally model-agnostic: the summary message is plain text
 * prefixed with a marker so callers can detect previously-compacted history.
 * No LLM call is made for summarization in v1 — we concatenate role+content
 * pairs into a structured block which the model can follow as prior context.
 */

import { estimateTokens, computeContextBudget } from './contextBudgeter';
import type { ChatMessage } from '@/types/chat';

export interface CompactionResult {
  messages: ChatMessage[];
  /** Number of original turns dropped */
  droppedTurns: number;
  /** Whether any compaction occurred */
  compacted: boolean;
}

function buildSummaryText(droppedMessages: ChatMessage[]): string {
  const lines: string[] = ['[Earlier conversation summary]'];
  for (const msg of droppedMessages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    const text = msg.content;
    // Truncate individual entries to keep summary manageable
    const truncated = text.length > 800 ? text.slice(0, 800) + '…' : text;
    lines.push(`${role}: ${truncated}`);
  }
  lines.push('[End of summary]');
  return lines.join('\n');
}

/**
 * Compact conversation history when context is at or above 80% of the model's
 * context window. Retains the most recent half of turns verbatim and collapses
 * the older half into a single summary message.
 *
 * @param modelId  - Used to look up context window via getModelById()
 * @param messages - Full message history (oldest → newest)
 * @param systemPromptTokens - Tokens reserved for system prompt
 */
export function compact(
  modelId: string,
  messages: ChatMessage[],
  systemPromptTokens = 0,
): CompactionResult {
  const budget = computeContextBudget(modelId, messages, systemPromptTokens);

  if (budget.status !== 'compact' || messages.length < 2) {
    return { messages, droppedTurns: 0, compacted: false };
  }

  // Preserve the most recent 50% of turns verbatim, drop the rest
  const keepCount = Math.max(1, Math.floor(messages.length / 2));
  const dropCount = messages.length - keepCount;
  const droppedMessages = messages.slice(0, dropCount);
  const keptMessages = messages.slice(dropCount);

  const summaryText = buildSummaryText(droppedMessages);
  const summaryMessage: ChatMessage = {
    id: `compacted_${Date.now()}`,
    conversationId: droppedMessages[0]?.conversationId ?? '',
    role: 'assistant',
    content: summaryText,
    createdAt: droppedMessages[0]?.createdAt ?? new Date().toISOString(),
  };

  // Verify compaction actually helped — if the kept + summary still exceeds
  // the hard cap, drop more turns iteratively (rare edge case for tiny windows)
  let result = [summaryMessage, ...keptMessages];
  const afterBudget = computeContextBudget(modelId, result, systemPromptTokens);
  if (afterBudget.status === 'compact' && keptMessages.length > 1) {
    const emergencyKeep = Math.max(1, Math.floor(keptMessages.length / 2));
    const emergencyDropped = [
      ...droppedMessages,
      ...keptMessages.slice(0, keptMessages.length - emergencyKeep),
    ];
    const emergencyKept = keptMessages.slice(keptMessages.length - emergencyKeep);
    const emergencySummaryText = buildSummaryText(emergencyDropped);
    const emergencySummary: ChatMessage = {
      id: `compacted_${Date.now()}_emergency`,
      conversationId: emergencyDropped[0]?.conversationId ?? '',
      role: 'assistant',
      content: emergencySummaryText,
      createdAt: emergencyDropped[0]?.createdAt ?? new Date().toISOString(),
    };
    result = [emergencySummary, ...emergencyKept];
  }

  return {
    messages: result,
    droppedTurns: dropCount,
    compacted: true,
  };
}

/**
 * Estimate how many tokens the compacted summary will consume.
 * Useful for pre-flight checks without actually compacting.
 */
export function estimateSummaryTokens(messages: ChatMessage[]): number {
  if (messages.length === 0) return 0;
  const dropCount = messages.length - Math.max(1, Math.floor(messages.length / 2));
  const dropped = messages.slice(0, dropCount);
  const summaryText = buildSummaryText(dropped);
  return estimateTokens(summaryText);
}
