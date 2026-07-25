/**
 * @file Context-window fitting for the outgoing provider request (finding SYS-16).
 *
 * WHAT WAS BROKEN: nothing on this route trimmed the conversation to the
 * RESOLVED model's context window. The tool loop bounded accumulated tool
 * RESULTS (`trimToolResultHistory`), and the free-trial path bounded the token
 * BUDGET, but an ordinary long chat was shipped verbatim. Past the window the
 * provider rejects the whole request, and (before the taxonomy fix in
 * `response-builder.ts`) that surfaced as an opaque 500 carrying the upstream
 * provider's own message. Long chats must DEGRADE — drop the oldest turns —
 * not die.
 *
 * HONEST LIMITS OF THIS TRIM:
 *   - Token counts are ESTIMATES (`estimateTokens`, a per-provider chars-per-
 *     token heuristic). There is no server-side tokenizer for 12 providers, so
 *     the reserve below is deliberately generous rather than exact.
 *   - Attachment/multimodal parts are charged a flat per-part allowance; real
 *     image cost varies by resolution and provider.
 *   - It fits the REQUEST, not the response. A provider can still refuse for
 *     its own reasons; that path now maps to a distinct `context_length_exceeded`
 *     client code instead of a 500.
 */

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

/**
 * Head-room withheld from the window on top of `max_tokens`: covers tool
 * definitions, provider-side prompt scaffolding, and the estimator's own drift.
 */
const CONTEXT_RESERVE_TOKENS = 2_048;

/** Flat estimate charged per multimodal part (image/document block). */
const MULTIMODAL_PART_TOKENS = 800;

/** Replaces a dropped stretch of conversation so the model knows it happened. */
const DROPPED_HISTORY_MARKER =
  '[Earlier messages in this conversation were omitted to fit the model context window.]';

/** Replaces the tail of a single message that alone exceeds the budget. */
const TRUNCATED_MESSAGE_MARKER = '\n\n[...truncated to fit the model context window]';

function messageTokens(message: TrimmableMessage, model: string): number {
  const parts = Array.isArray(message.multimodal_content) ? message.multimodal_content.length : 0;
  const toolCallJson = message.tool_calls ? JSON.stringify(message.tool_calls) : '';
  return (
    estimateTokens(typeof message.content === 'string' ? message.content : '', model) +
    estimateTokens(toolCallJson, model) +
    parts * MULTIMODAL_PART_TOKENS +
    // Per-message envelope (role, delimiters) — small but non-zero, and it
    // matters on threads with hundreds of short turns.
    4
  );
}

function totalTokens(messages: TrimmableMessage[], model: string): number {
  let total = 0;
  for (const message of messages) total += messageTokens(message, model);
  return total;
}

export interface ContextTrimResult {
  /** Messages removed from the thread. */
  droppedMessages: number;
  /** Messages whose content was cut down in place. */
  truncatedMessages: number;
  /** Estimated tokens before trimming. */
  estimatedTokensBefore: number;
  /** Estimated tokens after trimming. */
  estimatedTokensAfter: number;
  /** Fitting budget derived from the model's window. */
  budgetTokens: number;
}

/**
 * Fit `messages` (mutated in place) into the resolved model's context window.
 *
 * PRESERVED UNCONDITIONALLY:
 *   - every `system` message (the capability preamble, project context, memory,
 *     mode prompts — dropping them changes what the assistant IS);
 *   - the trailing block from the last `user` message onwards (the actual
 *     question, plus any tool traffic that already answered it).
 *
 * DROPPED OLDEST-FIRST, IN WHOLE GROUPS: an assistant turn carrying
 * `tool_calls` is removed together with the `tool` result messages that answer
 * it. Splitting that pair produces a request every provider rejects, which
 * would replace a context error with a 400.
 *
 * Returns null when the model's window is unknown (no metadata) — no guessing.
 */
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

  // The trailing block: from the last user message to the end.
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  const protectedFrom = lastUserIndex >= 0 ? lastUserIndex : messages.length;

  // Group droppable indices: an assistant tool_call turn owns the tool results
  // that follow it, so the pair is removed atomically.
  const groups: number[][] = [];
  for (let i = 0; i < protectedFrom; i++) {
    const message = messages[i];
    if (!message || message.role === 'system') continue;
    if (message.role === 'tool') {
      // Attach to the group being built; a leading orphan tool result (only
      // possible on a malformed thread) becomes its own group.
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
    // Insert the marker after the leading system messages so the model is told
    // history was cut rather than silently seeing a conversation that jumps.
    let insertAt = 0;
    while (insertAt < next.length && next[insertAt]?.role === 'system') insertAt++;
    next.splice(insertAt, 0, { role: 'system', content: DROPPED_HISTORY_MARKER });
    running = totalTokens(next, model);
  }

  // Still over budget: the protected tail (or the system prompts) alone exceeds
  // the window. Cut message CONTENT down, newest-protected-message last, so the
  // request degrades instead of being rejected outright.
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
