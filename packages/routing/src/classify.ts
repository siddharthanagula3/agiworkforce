/**
 * Heuristic classifier for the auto-routing system.
 *
 * Implements §3 (Routing Internals) of `tasks/auto-routing-spec.md`:
 *   1. Priority-ordered regex / length / attachment / Unicode heuristics.
 *   2. Token-budget guard that forces `long_context` past 50K cumulative tokens.
 *   3. 5-turn sticky-pivot logic that boosts confidence on the running mode.
 *
 * Heuristics aim for 75–85% accuracy on their own; the LLM fallback (a
 * Gemini 3.1 Flash-Lite call wired in a higher layer) handles the remainder
 * when `confidence < 0.6`.
 *
 * Vercel React Best Practices applied:
 *   - `js-hoist-regexp` — every regex is module-scoped (compiled once).
 *   - `js-early-exit` — return as soon as a heuristic matches.
 *   - `js-length-check-first` — length comparison runs before the word-split
 *     for the simple-chat heuristic.
 *   - `server-no-shared-module-state` — no mutable module state.
 *   - `bundle-analyzable-paths` — every public symbol uses a named export so
 *     bundlers can tree-shake unused branches of the classifier.
 *
 * @module routing/classify
 * @packageDocumentation
 */

import type { RoutingTaskType } from '@agiworkforce/types';

import type {
  ClassifierResult,
  ConversationContext,
  RoutingAttachment,
  RoutingMessage,
} from './types';

// ============================================================================
// Hoisted regex patterns (compiled once at module load)
// ----------------------------------------------------------------------------
// `js-hoist-regexp`: defining regexes inside `classifyTaskLocally` would
// re-compile them on every call. The auto-router runs on every keystroke
// of the chat composer in some surfaces, so this is hot.
// ============================================================================

/** Slash-prefixed image generation commands (`/image`, `/imagine`, …). */
const RE_IMAGE_SLASH = /^\/(image|imagine|draw|generate)\b/i;

/** Natural-language image generation phrases ("make an image of …"). */
const RE_IMAGE_PHRASE =
  /\b(generate|create|make|draw)\s+(an?\s+)?(image|picture|photo|illustration|logo|mockup|wireframe)/i;

/** Computer-use automation verbs that signal browser / desktop control. */
const RE_COMPUTER_USE = /\b(click|navigate|fill|submit|automate)\b/i;

/** Code fence used to wrap code blocks in markdown. */
const RE_CODE_FENCE = /```/;

/**
 * Coding signals: language keywords, SQL, common runtime errors / stack-trace
 * markers. The expression intentionally stays small — strong signals are
 * enough; the LLM fallback covers ambiguous prose-with-keywords cases.
 */
const RE_CODING =
  /\bfunction\b|\bclass\b|\bSELECT\b|\bdef\b|\bimport\b|stack ?trace|TypeError|undefined|NullPointerException/;

/** Reasoning-mode action verbs (math / proof / formal derivation). */
const RE_REASONING_VERB = /\b(prove|derive|solve|calculate|theorem|integral|differential)\b/i;

/** Inline arithmetic expression (`12 + 7`, `a * b = c`, …). */
const RE_REASONING_MATH = /\b\d+\s*[+\-*/=]\s*\d/;

/** Recency / web-search signals — anything that requires fresh info. */
const RE_RESEARCH = /\b(latest|today|2026|current|recent news|search the web|cite sources)\b/i;

/** Creative-writing imperatives — long-form prose generation. */
const RE_CREATIVE_WRITING =
  /\b(write|draft|compose)\s+(a|an|the)?\s*(story|poem|email|essay|tweet|blog)/i;

/** Whitespace splitter for word counting in the simple-chat heuristic. */
const RE_WHITESPACE = /\s+/;

// ============================================================================
// Tokenizer-inflation multipliers
// ----------------------------------------------------------------------------
// Empirically calibrated against vendor tokenizers (2026-04). Claude Opus 4.7
// in particular trips a 35% inflation under thinking-mode payloads — see
// `tasks/auto-routing-spec.md` §3 and field reports filed in `tasks/lessons.md`.
// Numbers are characters-per-token: smaller divisor → MORE tokens per char.
// ============================================================================

const TOKENS_PER_CHAR_GPT = 1 / 3.8;
const TOKENS_PER_CHAR_CLAUDE = 1 / 3.5;
const TOKENS_PER_CHAR_CLAUDE_OPUS_4_7 = (1 / 3.5) * 1.18;
const TOKENS_PER_CHAR_GEMINI = 1 / 4.0;
const TOKENS_PER_CHAR_DEEPSEEK = 1 / 3.4;
const TOKENS_PER_CHAR_DEFAULT = 1 / 3.5;

/**
 * Estimate token count for `text` under the given `model` family's tokenizer.
 *
 * `model` is matched as a case-insensitive prefix:
 *   - `gpt-4o*`, `gpt-5*` → GPT family.
 *   - `claude-opus-4-7*` → Opus 4.7 (+18% inflation).
 *   - any other `claude-*` → other Claude family.
 *   - `gemini-*` → Gemini family.
 *   - `deepseek-*` → DeepSeek family.
 *   - anything else (or omitted) → default.
 *
 * Used by callers to compute `cumulativeTokens` for `ConversationContext`.
 * Stays a tight inline calculation — no allocations on the hot path.
 */
export function estimateTokens(text: string, model?: string): number {
  // `js-early-exit`: empty input bypasses the model lookup.
  if (text.length === 0) return 0;

  const charCount = text.length;
  const id = model?.toLowerCase() ?? '';

  // Order matters: more specific Opus 4.7 prefix BEFORE the generic
  // `claude` family check.
  if (id.startsWith('claude-opus-4-7') || id.startsWith('claude-opus-4.7')) {
    return Math.ceil(charCount * TOKENS_PER_CHAR_CLAUDE_OPUS_4_7);
  }

  if (id.startsWith('gpt-4o') || id.startsWith('gpt-5')) {
    return Math.ceil(charCount * TOKENS_PER_CHAR_GPT);
  }

  if (id.startsWith('claude')) {
    return Math.ceil(charCount * TOKENS_PER_CHAR_CLAUDE);
  }

  if (id.startsWith('gemini')) {
    return Math.ceil(charCount * TOKENS_PER_CHAR_GEMINI);
  }

  if (id.startsWith('deepseek')) {
    return Math.ceil(charCount * TOKENS_PER_CHAR_DEEPSEEK);
  }

  return Math.ceil(charCount * TOKENS_PER_CHAR_DEFAULT);
}

// ============================================================================
// classifyTaskLocally
// ----------------------------------------------------------------------------
// Priority-ordered. The first heuristic to fire wins; falling through to
// general (the lowest-confidence bucket) signals that the LLM fallback should
// be invoked by the caller when `confidence < 0.6`.
// ============================================================================

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
  // ─── 1. Image generation ────────────────────────────────────────────────
  // Slash command takes precedence over the natural-language phrase form.
  if (RE_IMAGE_SLASH.test(message) || RE_IMAGE_PHRASE.test(message)) {
    return { type: 'image_generation', confidence: 0.95 };
  }

  // ─── 2. Computer use ────────────────────────────────────────────────────
  // Only fires when BOTH a screenshot attachment AND an automation verb
  // are present — bare screenshots without a verb fall through to multimodal.
  const hasScreenshot = attachments?.some((a) => a.type === 'screenshot') ?? false;
  if (hasScreenshot && RE_COMPUTER_USE.test(message)) {
    return { type: 'computer-use', confidence: 0.9 };
  }

  // ─── 3. Multimodal ──────────────────────────────────────────────────────
  // Any image/* or video/* MIME drops the request into multimodal even when
  // the message body is empty (e.g. drag-drop a screenshot with no caption).
  if (attachments?.some((a) => a.mime.startsWith('image/') || a.mime.startsWith('video/'))) {
    return { type: 'multimodal', confidence: 0.85 };
  }

  // ─── 4. Long context ────────────────────────────────────────────────────
  // Cumulative-token guard. We add the outgoing message to the history sum
  // because callers haven't yet committed it to history.
  const cumulativeTokens = sumTokens(message, history);
  if (cumulativeTokens > 50_000) {
    return { type: 'long_context', confidence: 0.9 };
  }

  // ─── 5. Coding ──────────────────────────────────────────────────────────
  // Code fences are a stronger signal than keyword soup; either is enough.
  if (RE_CODE_FENCE.test(message) || RE_CODING.test(message)) {
    return { type: 'coding', confidence: 0.85 };
  }

  // ─── 6. Reasoning ───────────────────────────────────────────────────────
  if (RE_REASONING_VERB.test(message) || RE_REASONING_MATH.test(message)) {
    return { type: 'reasoning', confidence: 0.8 };
  }

  // ─── 7. Research / recency ──────────────────────────────────────────────
  if (RE_RESEARCH.test(message)) {
    return { type: 'research', confidence: 0.85 };
  }

  // ─── 8. Creative writing ────────────────────────────────────────────────
  if (RE_CREATIVE_WRITING.test(message)) {
    return { type: 'creative_writing', confidence: 0.75 };
  }

  // ─── 9. Simple chat ─────────────────────────────────────────────────────
  // `js-length-check-first`: the cheap `length < 80` test runs BEFORE the
  // expensive `split(/\s+/)`, so long messages skip the allocation entirely.
  if (message.length < 80 && message.split(RE_WHITESPACE).length < 15) {
    return { type: 'simple_chat', confidence: 0.7 };
  }

  // ─── 10. General fallback ───────────────────────────────────────────────
  // Confidence stays at 0.5 to trigger the LLM fallback in the caller.
  return { type: 'general', confidence: 0.5 };
}

// ============================================================================
// applyConversationContext
// ----------------------------------------------------------------------------
// 5-turn sticky pivot. Uses the LAST 3 entries of `recentTaskTypes` to compute
// the running mode; matches → +0.1 confidence boost; high-confidence (≥0.85)
// turns are allowed to override the mode for a different task type.
// ============================================================================

/** Minimum confidence required to override the conversation's running mode. */
const PIVOT_OVERRIDE_THRESHOLD = 0.85;

/** Confidence boost applied when the new turn matches the running mode. */
const STICKY_BOOST = 0.1;

/** Maximum confidence value — keeps boosted scores from exceeding 1.0. */
const MAX_CONFIDENCE = 1.0;

/** Number of recent turns inspected by the sticky pivot. */
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
 *     mode without penalty — that's the point of the threshold; it lets a
 *     conversation pivot from `coding` to `image_generation` cleanly.
 *
 * @param local - Result returned by `classifyTaskLocally`.
 * @param ctx - Snapshot of conversation token budget and recent task types.
 */
export function applyConversationContext(
  local: ClassifierResult,
  ctx: ConversationContext,
): ClassifierResult {
  // Long-context guard runs first so it cannot be overridden by sticky pivot.
  if (ctx.cumulativeTokens > 50_000 && local.type !== 'long_context') {
    return { type: 'long_context', confidence: 0.9 };
  }

  // Need at least one prior turn to compute a mode.
  if (ctx.recentTaskTypes.length === 0) {
    return local;
  }

  const window = ctx.recentTaskTypes.slice(-STICKY_WINDOW);
  const runningMode = computeMode(window);

  // No clear mode (e.g. tie) → return unchanged.
  if (runningMode === null) {
    return local;
  }

  // Mode matches new turn → boost confidence and stay on the same task type.
  if (runningMode === local.type) {
    return {
      type: local.type,
      confidence: Math.min(MAX_CONFIDENCE, local.confidence + STICKY_BOOST),
    };
  }

  // Mode differs but new turn has high confidence → allow the pivot.
  if (local.confidence >= PIVOT_OVERRIDE_THRESHOLD) {
    return local;
  }

  // Mode differs and new turn lacks the confidence to flip → snap to mode.
  // Confidence is the new turn's confidence (we are NOT inventing certainty).
  return { type: runningMode, confidence: local.confidence };
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Sum estimated tokens across the outgoing message AND the prior history.
 * Uses the default tokenizer (chars/3.5) — the actual provider is not yet
 * known at classification time.
 */
function sumTokens(message: string, history: ReadonlyArray<RoutingMessage>): number {
  let total = estimateTokens(message);
  // `js-early-exit`: prefer a hot for-loop over a reduce-with-allocation.
  for (let i = 0; i < history.length; i++) {
    total += estimateTokens(history[i]!.content);
  }
  return total;
}

/**
 * Compute the strict mode of a small array of task types. Returns `null` on
 * empty input or on ties — callers treat `null` as "no clear running mode".
 */
function computeMode(values: ReadonlyArray<RoutingTaskType>): RoutingTaskType | null {
  if (values.length === 0) return null;

  // `js-set-map-lookups`: O(1) lookups via Map for the count.
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

  // Strict mode: a tie means "no mode".
  return tie ? null : bestType;
}
