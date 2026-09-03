import { getModelMetadataById, type RoutingTaskType } from '@agiworkforce/types';

import { tokenizerDriftFactor } from './pricing';

import type {
  ClassifierResult,
  ConversationContext,
  RoutingAttachment,
  RoutingMessage,
} from './types';

const RE_IMAGE_SLASH = /^\/(image|imagine|draw|generate)\b/i;

const RE_IMAGE_PHRASE =
  /\b(generate|create|make|draw)\s+(me\s+)?(an?\s+|some\s+)?(\w+\s+){0,2}(image|picture|photo|photograph|illustration|logo|mockup|wireframe|artwork|drawing|painting|sketch|portrait|poster|banner|avatar|thumbnail|wallpaper)\b/i;

const RE_COMPUTER_USE = /\b(click|navigate|fill|submit|automate)\b/i;

const RE_CODE_FENCE = /```/;

const RE_CODING =
  /\bfunction\b|\bclass\b|\bSELECT\b|\bdef\b|\bimport\b|stack ?trace|TypeError|undefined|NullPointerException/;

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
  if (RE_IMAGE_SLASH.test(message) || RE_IMAGE_PHRASE.test(message)) {
    return { type: 'image_generation', confidence: 0.95 };
  }

  const hasScreenshot = attachments?.some((a) => a.type === 'screenshot') ?? false;
  if (hasScreenshot && RE_COMPUTER_USE.test(message)) {
    return { type: 'computer-use', confidence: 0.9 };
  }

  if (attachments?.some((a) => a.mime.startsWith('image/') || a.mime.startsWith('video/'))) {
    return { type: 'multimodal', confidence: 0.85 };
  }

  const cumulativeTokens = sumTokens(message, history);
  if (cumulativeTokens > 50_000) {
    return { type: 'long_context', confidence: 0.9 };
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

  if (RE_RESEARCH.test(message)) {
    return { type: 'research', confidence: 0.85 };
  }

  if (RE_CREATIVE_WRITING.test(message)) {
    return { type: 'creative_writing', confidence: 0.75 };
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
