
import 'server-only';

import { estimateTokens } from '@agiworkforce/routing';
import { getModelMetadataById } from '@agiworkforce/types';
import { logger } from '@/lib/logger';

type TrimmableMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  multimodal_content?: unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
};

const CONTEXT_RESERVE_TOKENS = 2_048;

const MULTIMODAL_PART_TOKENS = 800;

const DROPPED_HISTORY_MARKER =
  '[Earlier messages in this conversation were omitted to fit the model context window.]';

const TRUNCATED_MESSAGE_MARKER = '\n\n[...truncated to fit the model context window]';

function messageTokens(message: TrimmableMessage, model: string): number {
  const parts = Array.isArray(message.multimodal_content) ? message.multimodal_content.length : 0;
  const toolCallJson = message.tool_calls ? JSON.stringify(message.tool_calls) : '';
  return (
    estimateTokens(typeof message.content === 'string' ? message.content : '', model) +
    estimateTokens(toolCallJson, model) +
    parts * MULTIMODAL_PART_TOKENS +
    4
  );
}

function totalTokens(messages: TrimmableMessage[], model: string): number {
  let total = 0;
  for (const message of messages) total += messageTokens(message, model);
  return total;
}

export interface ContextTrimResult {
  droppedMessages: number;
  truncatedMessages: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  budgetTokens: number;
}

export function trimMessagesToContextWindow(
  messages: TrimmableMessage[],
  model: string,
  maxOutputTokens: number,
): ContextTrimResult | null {
  const contextWindow = getModelMetadataById(model)?.contextWindow;
  if (!contextWindow || contextWindow <= 0) return null;

  const budget = Math.max(
    1_024,
    contextWindow - Math.max(0, maxOutputTokens) - CONTEXT_RESERVE_TOKENS,
  );
  const before = totalTokens(messages, model);
  if (before <= budget) return null;

  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  const protectedFrom = lastUserIndex >= 0 ? lastUserIndex : messages.length;

  const groups: number[][] = [];
  for (let i = 0; i < protectedFrom; i++) {
    const message = messages[i];
    if (!message || message.role === 'system') continue;
    if (message.role === 'tool') {
      const last = groups[groups.length - 1];
      if (last && last[last.length - 1] === i - 1) last.push(i);
      else groups.push([i]);
      continue;
    }
    groups.push([i]);
  }

  const dropped = new Set<number>();
  let running = before;
  for (const group of groups) {
    if (running <= budget) break;
    for (const index of group) {
      const message = messages[index];
      if (!message) continue;
      running -= messageTokens(message, model);
      dropped.add(index);
    }
  }

  const next = messages.filter((_, index) => !dropped.has(index));
  if (dropped.size > 0) {
    let insertAt = 0;
    while (insertAt < next.length && next[insertAt]?.role === 'system') insertAt++;
    next.splice(insertAt, 0, { role: 'system', content: DROPPED_HISTORY_MARKER });
    running = totalTokens(next, model);
  }

  let truncatedMessages = 0;
  if (running > budget) {
    for (let i = next.length - 1; i >= 0 && running > budget; i--) {
      const message = next[i];
      if (!message || typeof message.content !== 'string') continue;
      const currentTokens = messageTokens(message, model);
      const overflow = running - budget;
      if (currentTokens <= 16) continue;
      const keepRatio = Math.max(0.1, 1 - overflow / currentTokens);
      const keepChars = Math.max(64, Math.floor(message.content.length * keepRatio));
      if (keepChars >= message.content.length) continue;
      message.content = message.content.slice(0, keepChars) + TRUNCATED_MESSAGE_MARKER;
      truncatedMessages++;
      running = totalTokens(next, model);
    }
  }

  messages.length = 0;
  messages.push(...next);

  const result: ContextTrimResult = {
    droppedMessages: dropped.size,
    truncatedMessages,
    estimatedTokensBefore: before,
    estimatedTokensAfter: running,
    budgetTokens: budget,
  };
  logger.info(
    { model, ...result },
    '[context-window] trimmed conversation history to fit the resolved model context window',
  );
  return result;
}
