import 'server-only';

import { estimateTokens } from '@agiworkforce/routing';
import { getModelMetadataById } from '@agiworkforce/types';
import { logger } from '@/lib/logger';

export type TrimmableMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  multimodal_content?: unknown[];
  tool_calls?: unknown[];
  tool_call_id?: string;
};

const CONTEXT_RESERVE_TOKENS = 2_048;

const MULTIMODAL_PART_TOKENS = 800;

export const DROPPED_HISTORY_MARKER =
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

function totalTokens(messages: readonly TrimmableMessage[], model: string): number {
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

export interface ContextTrimPlan {
  budgetTokens: number;
  estimatedTokensBefore: number;
  /** Indices into the source array, oldest first, of the messages a trim would drop. */
  droppedIndices: number[];
}

/**
 * Decides WHAT a trim would drop without mutating anything or deciding HOW the
 * gap is filled. `trimMessagesToContextWindow` and the context-compaction
 * module both start here so the drop selection (oldest-first, whole groups, a
 * tool result never separated from the assistant turn ahead of it, the last
 * user turn always protected) is defined exactly once.
 */
export function planContextTrim(
  messages: readonly TrimmableMessage[],
  model: string,
  maxOutputTokens: number,
): ContextTrimPlan | null {
  const contextWindow = getModelMetadataById(model)?.contextWindow;
  if (!contextWindow || contextWindow <= 0) return null;

  const budgetTokens = Math.max(
    1_024,
    contextWindow - Math.max(0, maxOutputTokens) - CONTEXT_RESERVE_TOKENS,
  );
  const estimatedTokensBefore = totalTokens(messages, model);
  if (estimatedTokensBefore <= budgetTokens) return null;

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

  const droppedIndices: number[] = [];
  let running = estimatedTokensBefore;
  for (const group of groups) {
    if (running <= budgetTokens) break;
    for (const index of group) {
      const message = messages[index];
      if (!message) continue;
      running -= messageTokens(message, model);
      droppedIndices.push(index);
    }
  }

  return { budgetTokens, estimatedTokensBefore, droppedIndices };
}

/**
 * Applies a plan from {@link planContextTrim}: removes the dropped messages,
 * and, when anything was dropped, inserts `replacementText` as a system
 * message where the drop happened (after any leading system messages):
 * `DROPPED_HISTORY_MARKER` for the mechanical trim, an LLM-produced summary
 * for compaction. A null `replacementText` drops the span silently, which
 * only ever makes sense when the caller already knows nothing was dropped.
 *
 * Mutates `messages` in place (matching the pre-refactor `trimMessagesToContextWindow`
 * contract every existing caller relies on) and returns the same
 * `ContextTrimResult` shape either path produces.
 */
export function applyDroppedSpanReplacement(
  messages: TrimmableMessage[],
  plan: ContextTrimPlan,
  replacementText: string | null,
  model: string,
): ContextTrimResult {
  const dropped = new Set(plan.droppedIndices);
  const next = messages.filter((_, index) => !dropped.has(index));

  let running = plan.estimatedTokensBefore;
  if (dropped.size > 0) {
    if (replacementText) {
      let insertAt = 0;
      while (insertAt < next.length && next[insertAt]?.role === 'system') insertAt++;
      next.splice(insertAt, 0, { role: 'system', content: replacementText });
    }
    running = totalTokens(next, model);
  }

  const truncated = new Set<number>();
  if (running > plan.budgetTokens) {
    // One sweep only approximates the budget, because the keep-ratio is derived
    // from an estimator and every message carries fixed overhead. Sweeping until
    // no message shrinks any further is what makes "fits the window" true rather
    // than nearly true.
    let shrankSomething = true;
    while (running > plan.budgetTokens && shrankSomething) {
      shrankSomething = false;
      for (let i = next.length - 1; i >= 0 && running > plan.budgetTokens; i--) {
        const message = next[i];
        if (!message || typeof message.content !== 'string') continue;
        const currentTokens = messageTokens(message, model);
        if (currentTokens <= 16) continue;
        const body = message.content.endsWith(TRUNCATED_MESSAGE_MARKER)
          ? message.content.slice(0, -TRUNCATED_MESSAGE_MARKER.length)
          : message.content;
        const overflow = running - plan.budgetTokens;
        const keepRatio = Math.max(0.1, 1 - overflow / currentTokens);
        const keepChars = Math.min(
          body.length - 1,
          Math.max(1, Math.floor(body.length * keepRatio)),
        );
        if (keepChars < 1) continue;
        message.content = body.slice(0, keepChars) + TRUNCATED_MESSAGE_MARKER;
        truncated.add(i);
        shrankSomething = true;
        running = totalTokens(next, model);
      }
    }
  }

  messages.length = 0;
  messages.push(...next);

  return {
    droppedMessages: dropped.size,
    truncatedMessages: truncated.size,
    estimatedTokensBefore: plan.estimatedTokensBefore,
    estimatedTokensAfter: running,
    budgetTokens: plan.budgetTokens,
  };
}

export function trimMessagesToContextWindow(
  messages: TrimmableMessage[],
  model: string,
  maxOutputTokens: number,
): ContextTrimResult | null {
  const plan = planContextTrim(messages, model, maxOutputTokens);
  if (!plan) return null;

  const result = applyDroppedSpanReplacement(
    messages,
    plan,
    plan.droppedIndices.length > 0 ? DROPPED_HISTORY_MARKER : null,
    model,
  );
  logger.info(
    { model, ...result },
    '[context-window] trimmed conversation history to fit the resolved model context window',
  );
  return result;
}

export function compactionUsageFields(trim: ContextTrimResult | null | undefined): {
  compactionSavedTokens?: number;
} {
  if (!trim) return {};
  const saved = trim.estimatedTokensBefore - trim.estimatedTokensAfter;
  return saved > 0 ? { compactionSavedTokens: saved } : {};
}
