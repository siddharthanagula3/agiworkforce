import 'server-only';

import {
  openAIWireRequestToChatRequest,
  supportsOpenAIReasoningEffort,
  type OpenAIWireChatRequest,
  type OpenAIWireMessage,
  type OpenAIWireToolCall,
  type OpenAIWireToolChoice,
  type OpenAIWireToolDefinition,
} from '@agiworkforce/llm-normalize';
import { getModelMetadataById, normalizeModelId } from '@agiworkforce/types';
import type { ChatRequest, Effort, ThinkingConfig } from '@agiworkforce/types';
import type { ProcessedRequest } from './request-processor';

/**
 * Bridges `request-processor.ts`'s already-policy-resolved `llmRequest`
 * (routing/billing/quota decisions applied) onto the canonical `ChatRequest`
 * consumed by `packages/providers/*` adapters (restructure Wave 2 step 5).
 *
 * NOT WIRED INTO THE ROUTE YET. route.ts / tool-loop.ts still dispatch
 * through `LLMProviderFactory`. Anthropic's server-managed-tool events,
 * `adaptive` thinking, and `output_config.effort` now have canonical
 * representations (StreamChunk + ThinkingConfig extended, Option A, see
 * task #34) and this file uses them below. Still open: OpenAI's canonical
 * reasoning-effort re-derivation from budgetTokens disagrees with the
 * existing OPENAI_REASONING_EFFORT table on 3 of 4 tiers -- escalated to
 * team-lead, blocks routing OpenAI thinking through this path only.
 */

/**
 * Reproduces `LLMProviderFactory.mapModelIdToApiId` (apps/web/lib/llm-
 * providers/factory.ts:310-321) exactly: `llmRequest.model` is the internal/
 * canonical model id (e.g. dot-form `claude-opus-4.8`) picked by request-
 * processor.ts's auto-model-resolution + quota-override logic -- it is NEVER
 * apiModelId-mapped upstream. The legacy factory only rewrote the model on a
 * local copy immediately before the provider HTTP call, so the mapped id
 * never round-tripped back into the response's `model` field (stream-
 * transform.ts / response-builder.ts both read the unmapped
 * `requestedModel` / `chatRequest.model` off `ProcessedRequest`, never the
 * provider-bound id -- callers building the response MUST keep doing that,
 * not read `ChatRequest.model` back off the object this function returns).
 * `toCanonicalChatRequest` sits at that same "immediately before the
 * provider call" point, so it must apply the same mapping here -- skipping
 * it would send e.g. `claude-opus-4.8` verbatim to Anthropic (translate.ts
 * uses `req.model` with zero normalization), silently wrong for every one of
 * the 22 catalog entries whose apiModelId differs from the catalog id.
 */
function toApiModelId(modelId: string): string {
  const metadata = getModelMetadataById(modelId);
  const normalized = normalizeModelId(modelId);
  return metadata?.apiModelId ?? normalized ?? modelId;
}

type InternalMessage = ProcessedRequest['llmRequest']['messages'][number];

/** A client-defined function tool (`ToolDefinitionSchema` wire shape). Every
 *  entry in `ChatCompletionRequestSchema.tools` matches this shape exactly.
 *  Server-injected native tools (Anthropic `web_search_20260209`, Google
 *  `{google_search:{}}`, OpenAI `{type:'web_search_preview'}`, Anthropic
 *  `code_execution_*`) never have a `.function` key, so this check cleanly
 *  partitions request-processor.ts's merged `tools` array without needing to
 *  know every native tool shape by name. E2B execution tools also match here
 *  (they're `{type:'function', function:{...}}` per route.ts's isExecutionTool
 *  comment) — correct, since they run through the same model-calls-a-function
 *  protocol as MCP tools, not provider-side execution. */
function isFunctionToolDef(tool: unknown): tool is OpenAIWireToolDefinition {
  return (
    !!tool &&
    typeof tool === 'object' &&
    (tool as { type?: unknown }).type === 'function' &&
    typeof (tool as { function?: unknown }).function === 'object' &&
    (tool as { function: unknown }).function !== null
  );
}

function toWireMessage(msg: InternalMessage): OpenAIWireMessage {
  const wire: OpenAIWireMessage = {
    role: msg.role,
    // multimodal_content, when present, IS an OpenAIWireMessage['content'] array
    // (request-processor.ts copies chatRequest.messages[i].content verbatim into
    // it when the client sent an array) -- no reshaping needed.
    content: (msg.multimodal_content as OpenAIWireMessage['content'] | undefined) ?? msg.content,
  };
  if (msg.tool_call_id !== undefined) wire.tool_call_id = msg.tool_call_id;
  if (msg.tool_calls !== undefined) wire.tool_calls = msg.tool_calls as OpenAIWireToolCall[];
  // Forward the tool-loop's internal signed-thinking side-channel so
  // openAIWireRequestToChatRequest can reconstruct real ThinkingBlocks before
  // the tool_use blocks (known-flaw TOOLLOOP-ANTHROPIC-THINKING-CONTINUITY-01).
  // Absent on every client-supplied message, so non-tool-loop callers are
  // unaffected.
  if (msg.__canonicalThinking !== undefined) wire.__canonicalThinking = msg.__canonicalThinking;
  return wire;
}

/** Split request-processor.ts's merged `tools` array into client function
 *  tools (translated via the proven openai-wire-compat path) and provider-
 *  native payloads (passed through verbatim via `ChatRequest.rawVendorTools`,
 *  exactly the field it exists for -- see provider-adapter.ts:163-171). */
function splitTools(tools: unknown[] | undefined): {
  functionTools: OpenAIWireToolDefinition[];
  rawVendorTools: unknown[];
} {
  const functionTools: OpenAIWireToolDefinition[] = [];
  const rawVendorTools: unknown[] = [];
  for (const tool of tools ?? []) {
    if (isFunctionToolDef(tool)) functionTools.push(tool);
    else rawVendorTools.push(tool);
  }
  return { functionTools, rawVendorTools };
}

/**
 * Convert a `ProcessedRequest` into the canonical `ChatRequest`.
 *
 * Reuses `openAIWireRequestToChatRequest` for message/tool-call/image
 * conversion -- the same function services/api-gateway's llm.ts relies on,
 * so this stays consistent with the one already-shipped consumer of this
 * conversion path.
 *
 * Does NOT set `thinking`/`effort` -- request-processor.ts computes
 * `thinking_mode`/`thinking`/`effort` per-provider (see buildThinkingConfig)
 * and callers must resolve those separately via `toCanonicalThinking` (and,
 * for Anthropic's independent `output_config.effort`, `llmRequest.effort`
 * directly) since they aren't part of `ProcessedRequest['llmRequest']` in a
 * form this function's message/tool conversion touches.
 *
 * Sets `model` to the apiModelId-mapped id, NOT `llmRequest.model` verbatim
 * -- see `toApiModelId` above. Callers building the OpenAI-wire response
 * must keep sourcing the response `model` field from `ProcessedRequest`
 * (`requestedModel` / `chatRequest.model`), never from the returned
 * `ChatRequest.model`.
 */
export function toCanonicalChatRequest(processed: ProcessedRequest): ChatRequest {
  const { llmRequest } = processed;
  const { functionTools, rawVendorTools } = splitTools(llmRequest.tools);

  const wireRequest: OpenAIWireChatRequest = {
    model: toApiModelId(llmRequest.model),
    messages: llmRequest.messages.map(toWireMessage),
    ...(llmRequest.stream !== undefined ? { stream: llmRequest.stream } : {}),
    ...(llmRequest.temperature !== undefined ? { temperature: llmRequest.temperature } : {}),
    ...(llmRequest.max_tokens !== undefined ? { max_tokens: llmRequest.max_tokens } : {}),
    ...(functionTools.length > 0 ? { tools: functionTools } : {}),
    ...(llmRequest.tool_choice !== undefined
      ? { tool_choice: llmRequest.tool_choice as OpenAIWireToolChoice }
      : {}),
  };

  const chatRequest = openAIWireRequestToChatRequest(wireRequest);
  if (rawVendorTools.length > 0) chatRequest.rawVendorTools = rawVendorTools;
  return chatRequest;
}

/**
 * Map the enabled/disabled/adaptive thinking shape request-processor.ts
 * builds for Anthropic models onto the canonical `ThinkingConfig`.
 *
 * `{type:'adaptive'}` (anthropicUsesAdaptiveThinking models) maps straight
 * through -- `ThinkingConfig` gained an `'adaptive'` variant and
 * packages/providers/anthropic/src/translate.ts translates it back to
 * `{type:'adaptive'}` on the wire (Option A, addendum item 2, see task #34).
 * This used to throw before that extension landed; keep it mapping, not
 * throwing, now that the canonical layer supports it.
 *
 * Returns undefined for OpenAI on purpose, even when request-processor.ts
 * resolved an effort: the canonical OpenAI translate.ts re-derives
 * `reasoning_effort` from `budgetTokens` via thresholds that disagree with
 * the existing OPENAI_REASONING_EFFORT table on 3 of 4 tiers (escalated gap,
 * still open -- needs packages/providers/openai, not yet granted). Sending
 * no reasoning_effort (model default) is a smaller behavior delta than
 * sending the wrong tier.
 */
export function toCanonicalThinking(
  provider: string,
  thinking: ProcessedRequest['llmRequest']['thinking'],
): ThinkingConfig | undefined {
  if (provider !== 'anthropic') return undefined;
  if (!thinking) return undefined;
  if (thinking.type === 'adaptive') {
    return { type: 'adaptive' };
  }
  if (thinking.type === 'enabled') {
    return { type: 'enabled', budgetTokens: thinking.budget_tokens };
  }
  return { type: 'disabled' };
}

/**
 * Map `llmRequest.effort` onto the canonical `ChatRequest.effort`, gated to
 * Anthropic only (mirrors `toCanonicalThinking`'s provider gate).
 *
 * `llmRequest.effort` is `Effort | undefined` for every provider except
 * OpenAI, where request-processor.ts pre-remaps it through
 * `OPENAI_REASONING_EFFORT` (a same-valued lookup for low/medium/high/xhigh,
 * `undefined` for 'max' -- OpenAI has no Max tier). That remap is specific
 * to the still-open OpenAI reasoning-effort gap (see `toCanonicalThinking`'s
 * docstring) and isn't reused here: returning undefined for non-Anthropic
 * providers means this function never has to reason about it.
 *
 * Anthropic sends `thinking` and `output_config.effort` independently (old
 * anthropic.ts:245,425 -- addendum item 3); `ChatRequest.effort` exists
 * specifically so `packages/providers/anthropic/src/translate.ts` can
 * reproduce that independence (see effort-thinking.test.ts). Callers set
 * both `chatRequest.thinking` (via `toCanonicalThinking`) and
 * `chatRequest.effort` (via this function) from the same `llmRequest` --
 * they are not mutually exclusive.
 */
export function toCanonicalEffort(
  provider: string,
  effort: ProcessedRequest['llmRequest']['effort'],
): Effort | undefined {
  if (provider !== 'anthropic') return undefined;
  return effort as Effort | undefined;
}

/**
 * Reproduces `apps/web/lib/llm-providers/google.ts`'s `GOOGLE_THINKING_
 * BUDGET`/`getGoogleThinkingBudget` exactly: `low`/`medium`/`high` -> a fixed
 * token budget; any other tier ('xhigh', 'max', or unset) -> no thinking
 * config at all (Google's legacy provider never sent `thinkingConfig` for
 * those tiers -- a pre-existing gap in the LEGACY code, not something this
 * migration introduces or should silently "fix" by inventing a budget for
 * tiers Google's own logic never mapped).
 *
 * FOUND while wiring Google into route.ts (task #34's Google slice, response-
 * side byte-diff can't see this -- it's request-direction): `llmRequest.
 * effort` IS populated for Google by request-processor.ts (`modelSupports
 * Effort` explicitly includes 'google'; `llmRequest.effort` is the raw tier
 * string for every provider except OpenAI's special-cased remap). But
 * `packages/providers/google/src/translate.ts`'s `translateChatRequest` only
 * reads `ChatRequest.thinking` (Gemini's `generationConfig.thinkingConfig`)
 * -- it does not read `ChatRequest.effort` at all, unlike Anthropic's
 * independent thinking/effort pair. And `toCanonicalThinking` above is
 * Anthropic-gated (it reads `llmRequest.thinking`, which request-processor.ts
 * NEVER populates for Google -- `buildThinkingConfig` returns undefined for
 * every non-Anthropic provider). Without this function, a Google request
 * with extended thinking enabled would silently lose it when routed through
 * the adapter -- not a wire-shape difference, a dropped capability.
 *
 * FOUND AND FIXED IN THE SAME PASS (request-direction, not caught by the
 * response-side byte-diff): `translateChatRequest` sets
 * `thinkingConfig.includeThoughts: true` unconditionally whenever
 * `req.thinking?.type === 'enabled'` (translate.ts). Legacy `google.ts`
 * (lines 395, 589) only ever sent `{thinkingConfig:{thinkingBudget}}` --
 * budget only, no `includeThoughts`. Before this function existed,
 * `chatRequest.thinking` was always undefined for Google, so that branch
 * never fired and the gap was moot; restoring the budget alone would have
 * tripped it, making Gemini return `part.thought` content (which
 * `translateGeminiStream` turns into `thinking-delta` chunks, which the
 * legacy-web wire assembler renders as `<thinking>...</thinking>`) for any
 * Google request with `effort` set -- new response content the legacy
 * Google wire never produced, on the one contract (byte-stability) this
 * migration exists to hold. `ThinkingConfig` gained an optional
 * `includeThoughts` field (defaults to `true`, so every OTHER caller of
 * `translateChatRequest` -- e.g. services/api-gateway's `/api/v1/providers/
 * :providerId/stream`, which takes a caller-supplied `ChatRequest.thinking`
 * directly and is not part of this byte-stability contract -- keeps today's
 * behavior with zero change) specifically so this function can opt OUT
 * for the web v1 route without touching any other consumer. Whether Gemini
 * reasoning visibility should ship as a product improvement is a real
 * question, but it's team-lead's call, not one to bake into a "keep the
 * wire byte-stable" migration -- see canonical-request.test.ts's
 * 'buildGoogleChatRequest -> translateChatRequest wire' test, which pins
 * the outgoing Gemini body has NO `includeThoughts` key at all, exactly
 * matching legacy.
 */
export function toCanonicalGoogleThinking(
  provider: string,
  effort: ProcessedRequest['llmRequest']['effort'],
): ThinkingConfig | undefined {
  if (provider !== 'google') return undefined;
  const budgetTokens = GOOGLE_THINKING_BUDGET[effort as 'low' | 'medium' | 'high'];
  if (budgetTokens === undefined) return undefined;
  return { type: 'enabled', budgetTokens, includeThoughts: false };
}

const GOOGLE_THINKING_BUDGET: Readonly<Record<'low' | 'medium' | 'high', number>> = {
  low: 1024,
  medium: 8192,
  high: 24576,
};

/**
 * Compose the canonical `ChatRequest` for an Anthropic dispatch, folding in
 * `thinking`/`effort` on top of `toCanonicalChatRequest`'s base conversion.
 *
 * Shared by route.ts's standard-path Anthropic branch and tool-loop.ts's
 * per-step Anthropic dispatch (task #34) -- both need the exact same
 * composition, and tool-loop.ts calls this once per agentic step with a
 * step-scoped `ProcessedRequest` (same `processed` spread with `llmRequest`
 * replaced by that step's request, so `computeAnthropicCacheConfig`-style
 * tools-presence checks and message history reflect the current step, not
 * just the turn's original request).
 */
export function buildAnthropicChatRequest(processed: ProcessedRequest): ChatRequest {
  const chatRequest = toCanonicalChatRequest(processed);
  const thinking = toCanonicalThinking(processed.provider, processed.llmRequest.thinking);
  if (thinking !== undefined) chatRequest.thinking = thinking;
  const effort = toCanonicalEffort(processed.provider, processed.llmRequest.effort);
  if (effort !== undefined) chatRequest.effort = effort;
  return chatRequest;
}

/**
 * Compose the canonical `ChatRequest` for a Google dispatch. Google's
 * sibling of `buildAnthropicChatRequest` -- same `toCanonicalChatRequest`
 * base, but folds in `toCanonicalGoogleThinking` (effort-tier -> budget)
 * instead of `toCanonicalThinking`/`toCanonicalEffort` (which are Anthropic-
 * gated and would both return undefined here).
 */
export function buildGoogleChatRequest(processed: ProcessedRequest): ChatRequest {
  const chatRequest = toCanonicalChatRequest(processed);
  const thinking = toCanonicalGoogleThinking(processed.provider, processed.llmRequest.effort);
  if (thinking !== undefined) chatRequest.thinking = thinking;
  return chatRequest;
}

/**
 * Reproduces `apps/web/lib/llm-providers/openai.ts`'s `normalizeReasoningEffort` exactly:
 * `low`/`medium`/`high` pass through UNCONDITIONALLY (legacy never model-gates these three
 * tiers at all); `xhigh` requires the model to support it (`supportsOpenAIReasoningEffort`)
 * or is DROPPED to `undefined` -- never downgraded. `effort` here is `llmRequest.effort`,
 * which request-processor.ts already pre-remapped through `OPENAI_REASONING_EFFORT` (a
 * same-valued lookup for low/medium/high/xhigh, `undefined` for 'max' -- OpenAI has no Max
 * tier), so this only ever sees one of those four tiers or undefined.
 *
 * FOUND while wiring OpenAI (task #34's OpenAI slice): `packages/providers/openai/src/
 * translate.ts`'s `resolveOpenAIReasoningEffortForModel` (used generally, including by this
 * function's own caller further down) has a DIFFERENT, richer fallback ladder than legacy --
 * on a model that doesn't support `xhigh`, it DOWNGRADES to `high` instead of dropping the
 * field entirely (see packages/providers/openai/src/__tests__/translate-responses.test.ts's
 * "downgrades xhigh budgets to high" test, which intentionally locks that richer behavior
 * for translateChatRequest's OTHER callers). That's a real, response-affecting divergence
 * for the web v1 route specifically (a different reasoning_effort value is a materially
 * different request to OpenAI, not just a wire-shape nuance) -- NOT reproduced here or
 * changed in the shared function; this dedicated resolver exists so the web v1 route gets
 * legacy's exact tier-or-nothing behavior without altering `resolveOpenAIReasoningEffortForModel`
 * for api-gateway/CLI/desktop, who may genuinely want the graceful-degrade behavior.
 *
 * Uses `processed.llmRequest.model` (the ORIGINAL, pre-apiModelId-mapped id) rather than
 * `toApiModelId`'s output, matching legacy exactly -- `openai.ts`'s `normalizeReasoningEffort`
 * was always called with `request.model`, the un-mapped id `LLMProviderFactory` only rewrites
 * on a local copy immediately before the HTTP call (see `toApiModelId`'s docstring above).
 */
export function resolveWebOpenAIReasoningEffort(
  provider: string,
  effort: ProcessedRequest['llmRequest']['effort'],
  model: string,
): 'low' | 'medium' | 'high' | 'xhigh' | undefined {
  if (provider !== 'openai') return undefined;
  const normalized = typeof effort === 'string' ? effort.toLowerCase() : undefined;
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  if (normalized === 'xhigh') {
    const supportsXhigh = supportsOpenAIReasoningEffort(
      { provider: 'openai', id: normalizeModelId(model) ?? model },
      'xhigh',
    );
    return supportsXhigh ? 'xhigh' : undefined;
  }
  return undefined;
}

/**
 * Compose the canonical `ChatRequest` for an OpenAI dispatch. OpenAI's sibling of
 * `buildAnthropicChatRequest`/`buildGoogleChatRequest` -- same `toCanonicalChatRequest`
 * base, but sets `chatRequest.effort` (not `thinking`: legacy `openai.ts` only ever sent a
 * categorical `reasoning_effort` string, never a budget/thinking object) from
 * `resolveWebOpenAIReasoningEffort`. `packages/providers/openai/src/translate.ts`'s
 * `translateChatRequest` reads `ChatRequest.effort` directly when present, bypassing its
 * own `thinking.budgetTokens`-derived heuristic (task #34's OpenAI slice) -- since
 * `resolveWebOpenAIReasoningEffort` already applied legacy's exact model-gating, the value
 * set here is passed straight through by `resolveOpenAIReasoningEffortForModel`'s "already
 * supported" fast path with no further remapping.
 */
export function buildOpenAIChatRequest(processed: ProcessedRequest): ChatRequest {
  const chatRequest = toCanonicalChatRequest(processed);
  const effort = resolveWebOpenAIReasoningEffort(
    processed.provider,
    processed.llmRequest.effort,
    processed.llmRequest.model,
  );
  if (effort !== undefined) chatRequest.effort = effort;
  return chatRequest;
}

export type AnthropicCacheConfig = {
  enableCacheControl: boolean;
  cacheRetention: 'short' | 'long' | 'none';
};

/**
 * Per-request Anthropic cache_control configuration, computed the same way
 * `apps/web/lib/llm-providers/anthropic.ts` does today (NOT reused directly
 * -- that file is slated for deletion in step 6, and this logic is small
 * enough to keep self-contained here rather than leave a step-5 dependency
 * on the doomed directory).
 *
 * Old behavior, verified against the current source (not re-derived from
 * scratch): `request.cacheRetention` on `LLMProviderRequest` is never
 * populated by request-processor.ts, so `resolveCacheRetention`'s explicit-
 * override branch is dead code on this path -- for the direct 'anthropic'
 * provider it always resolves to 'short'. That makes `highReusePrefix`
 * (anthropic.ts:215-217) unconditionally true whenever caching is on AND
 * tools are present, which is what `hasTools` below reproduces.
 *
 * `!!anthropicTools` in the old code is a truthiness check (an explicit
 * empty `tools: []` from the client would still count as "has tools"), not
 * a length check. `hasTools` matches that exactly for parity, not because
 * the truthiness quirk is desirable.
 *
 * KNOWN GAP (disclosed, not blocking): the canonical Anthropic payload
 * policy (`applyAnthropicPayloadPolicyToParams`) only tags `system` and the
 * last message -- it has no equivalent of the old code's tools-array cache
 * breakpoint (`applyToolsCacheControl`). Retention choice (short vs 1h) is
 * still correct; the tools block itself won't be cached until the canonical
 * policy adds that. Cost impact only (more cache writes than before on
 * tool-heavy sessions) -- does not affect wire bytes.
 */
export function computeAnthropicCacheConfig(processed: ProcessedRequest): AnthropicCacheConfig {
  const { llmRequest } = processed;
  if (!llmRequest.usePromptCache) {
    return { enableCacheControl: false, cacheRetention: 'none' };
  }
  const hasTools = llmRequest.tools !== undefined;
  return { enableCacheControl: true, cacheRetention: hasTools ? 'long' : 'short' };
}
