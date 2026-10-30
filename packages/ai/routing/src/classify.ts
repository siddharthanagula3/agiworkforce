/**
 * Heuristic classifier for the auto-routing system.
 *
 * Implements the task taxonomy consumed by the registry-backed Auto policy:
 *   1. Priority-ordered regex / length / attachment / Unicode heuristics.
 *   2. Token-budget guard that forces `long_context` past 50K cumulative tokens.
 *   3. 5-turn sticky-pivot logic that boosts confidence on the running mode.
 *
 * There is no model fallback: the returned confidence is advisory and every
 * caller routes on `type` alone. Measured on held-out inputs the heuristics are
 * far weaker than their old 75 to 85 percent claim (see docs/specs/semantic-decisions).
 *
 * Vercel React Best Practices applied:
 *   - `js-hoist-regexp`, every regex is module-scoped (compiled once).
 *   - `js-early-exit`, return as soon as a heuristic matches.
 *   - `js-length-check-first`, length comparison runs before the word-split
 *     for the simple-chat heuristic.
 *   - `server-no-shared-module-state`, no mutable module state.
 *   - `bundle-analyzable-paths`, every public symbol uses a named export so
 *     bundlers can tree-shake unused branches of the classifier.
 *
 * @module routing/classify
 * @packageDocumentation
 */

import { getModelMetadataById, type RoutingTaskType } from '@agiworkforce/types';

import { tokenizerDriftFactor } from './pricing';
import {
  classifyResponseOutputIntent,
  isSelfContainedResponseRequest,
  requestsSeparateImageResources,
} from './output-intent';

import type {
  ClassifierResult,
  ConversationContext,
  RoutingAttachment,
  RoutingMessage,
} from './types';

const RE_COMPUTER_REQUEST_PREFIX =
  /^\s*(?:(?:please\s+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?|please\s+)?/i;

const BROWSER_CURRENT_PAGE_QUALIFIER = String.raw`(?:this|the\s+(?:current|active))\s+(?:[\w-]+\s+){0,2}(?:page|tab)`;

const RE_BROWSER_ACTION_WRAPPER = new RegExp(
  String.raw`^(?:use\s+(?:(?:the|this)\s+)?(?:(?:current|active)\s+)?browser(?:\s+(?:on|in)\s+${BROWSER_CURRENT_PAGE_QUALIFIER})?\s+to\s+|in\s+(?:(?:the|this)\s+)?(?:(?:current|active)\s+)?browser\s*[:,]?\s+|on\s+${BROWSER_CURRENT_PAGE_QUALIFIER}\s*[:,]?\s+)`,
  'i',
);

const RE_BROWSER_WRAPPED_ACTION =
  /^(click|double[ -]click|right[ -]click|tap|press|hover|drag|swipe|fill(?!\s+me\s+in\b)|type|enter|select|choose|check|uncheck|submit|navigate|open|visit|go|scroll|reload|refresh|upload|download)\b/i;

const RE_BROWSER_TAB_WINDOW_ACTION =
  /^(?:(?:list|show|read)\s+(?:only\s+)?(?:(?:the|this)\s+)?(?:(?:task[- ]owned|task|browser)\s+)?tabs\b|(?:switch\s+to|close)\s+(?:(?:the|this)\s+)?(?:(?:original|current|previous|task[- ]owned|task[- ]created|task|browser)\s+)?tab\b|resize\s+(?:(?:the|this|current)\s+)?(?:browser\s+)?window\b)/i;

const RE_COMPUTER_USE = /^(click|navigate|fill(?!\s+me\s+in\b)|submit|automate)\b/i;

const RE_BROWSER_PERFORM_ACTION =
  /^perform\s+(?:an?\s+)?(?:(?:horizontal|vertical)\s+)?(click|double[ -]click|right[ -]click|tap|hover|drag|swipe|scroll)\b/i;

const RE_BROWSER_UI_ACTION =
  /^(click|double[ -]click|right[ -]click|tap|press|fill(?:\s+in)?|type|enter|select|choose|check|uncheck|submit)\s+(?:\S[^\n]*)?\b(button|link|menu|tab|field|input|textbox|text area|form|checkbox|check box|radio button|dropdown|drop-down|option|toggle|control)\b/i;

const RE_BROWSER_NAVIGATION =
  /^(navigate|open|visit|go)\s+(?:\S[^\n]*)?(https?:\/\/\S+|\b(this|current|active)\s+(browser\s+)?(tab|page)\b)/i;

const RE_BROWSER_PAGE_ACTION = /^(scroll|reload|refresh)\s+(?:\S[^\n]*)?\b(tab|page|browser)\b/i;

const RE_BROWSER_CURRENT_PAGE_CONTEXT = new RegExp(
  String.raw`^[^.!?\n]*\b(?:on|in)\s+${BROWSER_CURRENT_PAGE_QUALIFIER}\b`,
  'i',
);

const RE_BROWSER_ACTION_TOPIC =
  /^(?:click|double[ -]click|right[ -]click|tap)\s+(?:handlers?|listeners?|events?|is|are|was|were|means|refers)\b/i;

const RE_CODE_FENCE = /```/;

const RE_CODING = /\bfunction\b|\bSELECT\b|\bdef\b|stack ?trace|TypeError|NullPointerException/;

const RE_CODING_WEAK = /\bclass\b|\bimport\b|undefined/;

const WEAK_SIGNAL_CONFIDENCE = 0.6;

const RE_REASONING_VERB = /\b(prove|derive|solve|calculate|theorem|integral|differential)\b/i;

const RE_REASONING_MATH = /\b\d+\s*[+\-*/=]\s*\d/;

const RE_AGENTIC =
  /\b(tool discovery|discover (the )?(best |available )?tools?|multi-agent|parallel agents?|autonomous agents?|subagents?)\b|\b(use|run|coordinate|orchestrate|delegate to|spawn)\s+(multiple\s+|parallel\s+|autonomous\s+)?(agents?|subagents?|tools?)\b/i;

const RE_RESEARCH = /\b(latest|today|2026|current|recent news|search the web|cite sources)\b/i;

const RE_CREATIVE_WRITING =
  /\b(write|draft|compose)[ \t]{1,32}(a|an|the)?[ \t]{0,32}(story|poem|email|essay|tweet|blog)/i;

const RE_WHITESPACE = /\s+/;

const TOKENS_PER_CHAR_DEFAULT = 1 / 3.5;

const TOKENS_PER_CHAR_BY_PROVIDER: Readonly<Record<string, number>> = {
  openai: 1 / 3.8,
  anthropic: 1 / 3.5,
  google: 1 / 4.0,
  deepseek: 1 / 3.4,
};

export function estimateTokens(text: string, model?: string): number {
  if (text.length === 0) return 0;

  const metadata = getModelMetadataById(model?.toLowerCase());
  if (!metadata) {
    return Math.ceil(text.length * TOKENS_PER_CHAR_DEFAULT);
  }

  const providerBaseline =
    TOKENS_PER_CHAR_BY_PROVIDER[metadata.provider] ?? TOKENS_PER_CHAR_DEFAULT;
  const drift = tokenizerDriftFactor(metadata.id);

  return Math.ceil(text.length * providerBaseline * drift);
}

/**
 * Run the priority-ordered heuristic classifier against the outgoing user
 * message, conversation history, and any attached files.
 *
 * @param message - Outgoing user message text.
 * @param history - Prior conversation turns (used only for token budget).
 * @param attachments - Files attached to the outgoing message.
 * @returns Selected task type and a confidence in [0, 1].
 */
export function classifyTaskLocally(
  message: string,
  history: ReadonlyArray<RoutingMessage>,
  attachments?: ReadonlyArray<RoutingAttachment>,
): ClassifierResult {
  if (requestsSeparateImageResources(message)) return { type: 'agentic', confidence: 0.95 };
  if (classifyResponseOutputIntent(message) === 'image') {
    return { type: 'image_generation', confidence: 0.95 };
  }

  const hasScreenshot = attachments?.some((a) => a.type === 'screenshot') ?? false;
  const requestedAction = message.replace(RE_COMPUTER_REQUEST_PREFIX, '');
  const hasBrowserWrapper = RE_BROWSER_ACTION_WRAPPER.test(requestedAction);
  let computerRequest = requestedAction
    .replace(RE_BROWSER_ACTION_WRAPPER, '')
    .replace(RE_COMPUTER_REQUEST_PREFIX, '');
  if (hasBrowserWrapper) computerRequest = computerRequest.replace(RE_BROWSER_PERFORM_ACTION, '$1');
  const describesBrowserAction = RE_BROWSER_ACTION_TOPIC.test(computerRequest);
  if (
    hasScreenshot &&
    RE_COMPUTER_USE.test(computerRequest) &&
    !describesBrowserAction &&
    !RE_CODE_FENCE.test(message)
  ) {
    return { type: 'computer-use', confidence: 0.9 };
  }

  if (attachments?.some((a) => a.mime.startsWith('image/') || a.mime.startsWith('video/'))) {
    return { type: 'multimodal', confidence: 0.85 };
  }

  const cumulativeTokens = sumTokens(message, history);
  if (cumulativeTokens > 50_000) {
    return { type: 'long_context', confidence: 0.9 };
  }

  if (
    !RE_CODE_FENCE.test(message) &&
    !describesBrowserAction &&
    ((hasBrowserWrapper &&
      (RE_BROWSER_WRAPPED_ACTION.test(computerRequest) ||
        RE_BROWSER_TAB_WINDOW_ACTION.test(computerRequest))) ||
      (RE_BROWSER_WRAPPED_ACTION.test(computerRequest) &&
        RE_BROWSER_CURRENT_PAGE_CONTEXT.test(computerRequest)) ||
      RE_BROWSER_UI_ACTION.test(computerRequest) ||
      RE_BROWSER_NAVIGATION.test(computerRequest) ||
      RE_BROWSER_PAGE_ACTION.test(computerRequest))
  ) {
    return { type: 'computer-use', confidence: 0.9 };
  }

  if (RE_CODE_FENCE.test(message) || RE_CODING.test(message)) {
    return { type: 'coding', confidence: 0.85 };
  }

  if (RE_REASONING_VERB.test(message) || RE_REASONING_MATH.test(message)) {
    return { type: 'reasoning', confidence: 0.8 };
  }

  if (RE_AGENTIC.test(message)) {
    return { type: 'agentic', confidence: 0.85 };
  }

  if (RE_RESEARCH.test(message) && !isSelfContainedResponseRequest(message)) {
    return { type: 'research', confidence: 0.85 };
  }

  if (RE_CREATIVE_WRITING.test(message)) {
    return { type: 'creative_writing', confidence: 0.75 };
  }

  if (RE_CODING_WEAK.test(message)) {
    return { type: 'coding', confidence: WEAK_SIGNAL_CONFIDENCE };
  }

  if (message.length < 80 && message.split(RE_WHITESPACE).length < 15) {
    return { type: 'simple_chat', confidence: 0.7 };
  }

  return { type: 'general', confidence: 0.5 };
}

const PIVOT_OVERRIDE_THRESHOLD = 0.85;

const STICKY_BOOST = 0.1;

const MAX_CONFIDENCE = 1.0;

const STICKY_WINDOW = 3;

/**
 * Apply 5-turn sticky-pivot logic and the long-context guard to a local
 * heuristic result.
 *
 * Rules (from spec §3):
 *   - If `cumulativeTokens > 50K` and the local result is NOT already
 *     `long_context`, override to `long_context @ 0.9`.
 *   - Compute the mode of the LAST 3 task types in `recentTaskTypes`. If the
 *     mode matches `local.type`, boost confidence by `+0.1` (clamped to 1.0).
 *   - High-confidence (≥0.85) results are allowed to override the running
 *     mode without penalty, that's the point of the threshold; it lets a
 *     conversation pivot from `coding` to `image_generation` cleanly.
 *
 * @param local - Result returned by `classifyTaskLocally`.
 * @param ctx - Snapshot of conversation token budget and recent task types.
 */
export function applyConversationContext(
  local: ClassifierResult,
  ctx: ConversationContext,
): ClassifierResult {
  if (ctx.cumulativeTokens > 50_000 && local.type !== 'long_context') {
    return { type: 'long_context', confidence: 0.9 };
  }

  if (ctx.recentTaskTypes.length === 0) {
    return local;
  }

  const window = ctx.recentTaskTypes.slice(-STICKY_WINDOW);
  const runningMode = computeMode(window);

  if (runningMode === null) {
    return local;
  }

  if (runningMode === local.type) {
    return {
      type: local.type,
      confidence: Math.min(MAX_CONFIDENCE, local.confidence + STICKY_BOOST),
    };
  }

  if (local.confidence >= PIVOT_OVERRIDE_THRESHOLD) {
    return local;
  }

  return { type: runningMode, confidence: local.confidence };
}

function sumTokens(message: string, history: ReadonlyArray<RoutingMessage>): number {
  let total = estimateTokens(message);
  for (let i = 0; i < history.length; i++) {
    total += estimateTokens(history[i]!.content);
  }
  return total;
}

function computeMode(values: ReadonlyArray<RoutingTaskType>): RoutingTaskType | null {
  if (values.length === 0) return null;

  const counts = new Map<RoutingTaskType, number>();
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  let bestType: RoutingTaskType | null = null;
  let bestCount = 0;
  let tie = false;

  for (const [type, count] of counts) {
    if (count > bestCount) {
      bestType = type;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }

  return tie ? null : bestType;
}
