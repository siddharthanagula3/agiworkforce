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
  contextWindowTokens: number;
  hardCapTokens: number;
  warnThresholdTokens: number;
  usedTokens: number;
  usedFraction: number;
  status: BudgetStatus;
}

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
export interface ContextBreakdownRow {
  key: 'user' | 'assistant' | 'attachments';
  label: string;
  count: number;
  tokens: number;
}

export function summarizeContext(messages: ChatMessage[]): ContextBreakdownRow[] {
  const rows: Record<ContextBreakdownRow['key'], ContextBreakdownRow> = {
    user: { key: 'user', label: 'Your messages', count: 0, tokens: 0 },
    assistant: { key: 'assistant', label: 'Replies', count: 0, tokens: 0 },
    attachments: { key: 'attachments', label: 'Attachments', count: 0, tokens: 0 },
  };
  for (const message of messages) {
    const row =
      message.role === 'user' ? rows.user : message.role === 'assistant' ? rows.assistant : null;
    if (row) {
      row.count += 1;
      row.tokens += estimateTokens(message.content ?? '');
    }
    rows.attachments.count += message.attachments?.length ?? 0;
  }
  return [rows.user, rows.assistant, rows.attachments];
}

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

  return {
    contextWindowTokens: contextWindow,
    hardCapTokens,
    warnThresholdTokens,
    usedTokens,
    usedFraction,
    status,
  };
}

export function needsCompaction(
  modelId: string,
  messages: ChatMessage[],
  systemPromptTokens = 0,
): boolean {
  return computeContextBudget(modelId, messages, systemPromptTokens).status === 'compact';
}
