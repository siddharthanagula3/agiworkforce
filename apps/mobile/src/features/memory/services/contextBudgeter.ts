/**
 * Context budget calculator for per-turn token estimation.
 *
 * Uses 4-chars-per-token approximation — no tokenizer shipped in v1 since
 * each model family has its own tokenizer. All thresholds are derived from
 * the model's contextWindow via getModelById(), never hardcoded.
 *
 * Thresholds:
 *   70% full → warn user (ContextWarningChip)
 *   80% full → trigger auto-compaction (memoryCompactor)
 */

import {
  computeContextBudget as computeSharedContextBudget,
  estimateTextTokens,
  type AgentContextMessage,
} from '@agiworkforce/agent-core';
import { getModelById, MODEL_LIST } from '@/lib/models';
import type { ModelDef } from '@/lib/models';
import type { ChatMessage } from '@/types/chat';

export type BudgetStatus = 'ok' | 'warn' | 'compact';

export interface ContextBudget {
  /** Hard cap at 80% of model.contextWindow */
  hardCapTokens: number;
  /** Warn threshold at 70% of model.contextWindow */
  warnThresholdTokens: number;
  /** Estimated tokens used by current conversation history */
  usedTokens: number;
  /** Fraction of hardCapTokens used (0-1) */
  usedFraction: number;
  /** 'ok' | 'warn' | 'compact' */
  status: BudgetStatus;
}

/** Estimate token count using 4-chars-per-token approximation. */
export function estimateTokens(text: string): number {
  return estimateTextTokens(text);
}

function toContextMessage(msg: ChatMessage): AgentContextMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    kind: msg.type === 'image' ? 'image' : 'text',
  };
}

function getContextWindow(modelId: string): number {
  const model = getModelById(modelId);
  if (model?.contextWindow) return model.contextWindow;
  // Fallback: use the first model in MODEL_LIST as a sensible default
  const fallback = MODEL_LIST[0] as ModelDef | undefined;
  return fallback?.contextWindow ?? 4096;
}

/**
 * Compute the context budget for the given model and message history.
 *
 * @param modelId  - The model being used (looked up via getModelById)
 * @param messages - Current conversation messages
 * @param systemPromptTokens - Estimated tokens for any system prompt (default 0)
 */
export function computeContextBudget(
  modelId: string,
  messages: ChatMessage[],
  systemPromptTokens = 0,
): ContextBudget {
  const contextWindow = getContextWindow(modelId);
  const shared = computeSharedContextBudget({
    contextWindowTokens: contextWindow,
    reservedOutputTokens: 0,
    messages: messages.map(toContextMessage),
    warningFraction: 0.7,
    compactionFraction: 0.8,
    targetFraction: 0.65,
  });
  const hardCapTokens = shared.compactionTokens;
  const warnThresholdTokens = shared.warningTokens;
  const usedTokens = systemPromptTokens + shared.usedTokens;
  const usedFraction = hardCapTokens > 0 ? usedTokens / hardCapTokens : 0;

  let status: BudgetStatus = 'ok';
  if (usedTokens >= hardCapTokens) {
    status = 'compact';
  } else if (usedTokens >= warnThresholdTokens) {
    status = 'warn';
  }

  return { hardCapTokens, warnThresholdTokens, usedTokens, usedFraction, status };
}

/**
 * Returns true when the conversation must be compacted before the next inference call.
 * Caller should invoke memoryCompactor.compact() when this returns true.
 */
export function needsCompaction(
  modelId: string,
  messages: ChatMessage[],
  systemPromptTokens = 0,
): boolean {
  return computeContextBudget(modelId, messages, systemPromptTokens).status === 'compact';
}
