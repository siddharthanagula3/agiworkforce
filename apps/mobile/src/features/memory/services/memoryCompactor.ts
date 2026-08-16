
import {
  compactContext,
  deterministicContextSummary,
  estimateTextTokens,
  type AgentContextMessage,
  type ContextSummarizer,
} from '@agiworkforce/agent-core';
import { getModelById, MODEL_LIST } from '@/lib/models';
import type { ChatMessage } from '@/types/chat';

export interface CompactionResult {
  messages: ChatMessage[];
  droppedTurns: number;
  compacted: boolean;
}

function contextWindow(modelId: string): number {
  const model = getModelById(modelId);
  if (model?.contextWindow) return model.contextWindow;
  return MODEL_LIST[0]?.contextWindow ?? 4096;
}

function toContextMessage(message: ChatMessage): AgentContextMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    kind: message.type === 'image' ? 'image' : 'text',
  };
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
export async function compact(
  modelId: string,
  messages: ChatMessage[],
  systemPromptTokens = 0,
  summarize?: ContextSummarizer,
): Promise<CompactionResult> {
  const preserveRecentMessages = Math.max(1, Math.floor(messages.length / 2));
  const result = await compactContext({
    contextWindowTokens: contextWindow(modelId),
    reservedOutputTokens: 0,
    messages: messages.map(toContextMessage),
    warningFraction: 0.7,
    compactionFraction: 0.8,
    targetFraction: 0.65,
    preserveRecentMessages,
    summarize,
  });
  if (!result.compacted) return { messages, droppedTurns: 0, compacted: false };

  const originals = new Map(messages.map((message) => [message.id, message]));
  const firstDropped = messages.find((message) => result.droppedMessageIds.includes(message.id));
  return {
    messages: result.messages.map((message) => {
      const original = originals.get(message.id);
      if (original) return original;
      return {
        id: message.id,
        conversationId: firstDropped?.conversationId ?? '',
        role: message.role === 'tool' ? 'assistant' : message.role,
        content: message.content,
        createdAt: firstDropped?.createdAt ?? new Date(0).toISOString(),
      };
    }),
    droppedTurns: result.droppedMessageIds.length,
    compacted: true,
  };
}

export function estimateSummaryTokens(messages: ChatMessage[]): number {
  if (messages.length === 0) return 0;
  const dropCount = messages.length - Math.max(1, Math.floor(messages.length / 2));
  const dropped = messages.slice(0, dropCount).map(toContextMessage);
  return estimateTextTokens(deterministicContextSummary(dropped));
}
