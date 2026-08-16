/**
 * Provider Adapter Contract
 *
 * The single interface every LLM provider implements. Adapter shape lifted from
 * OpenClaw's `ProviderPlugin` (`packages/plugin-sdk/src/provider-entry.ts`)
 * and adapted to AGI Workforce's flat provider model.
 *
 * ## Layered design
 *
 * - `ChatRequest` is the **provider-shape request** (rich content blocks,
 *   tools, thinking config). The chat UI's `ChatMessage` (string content) is
 *   converted to `ProviderMessage[]` at the API boundary, not earlier.
 * - `StreamChunk` is the **wire-shape stream event**. Adapters convert
 *   vendor-specific SSE/NDJSON into this discriminated union.
 * - The four optional hooks (`buildReplayPolicy`, `normalizeToolSchemas`,
 *   `wrapStreamFn`) carry production-tested cross-vendor knowledge from
 *   `@agiworkforce/provider-protocol`.
 *
 * Implementations: see `packages/ai/providers/<vendor>/`.
 *
 * @module provider-adapter
 * @packageDocumentation
 */

import type { Provider } from './provider';
import type { ModelMetadata, ModelCapabilities, ModelType } from './model-catalog';
import type { Effort } from './design-system/effort';

// ============================================================================
// Auth
// ============================================================================

/** Authentication method a provider supports. Drives the onboarding wizard. */
export type AuthMethod =
  | {
      kind: 'api-key';
      /** Env var name to probe before prompting. */
      envVar?: string;
      required: boolean;
      label?: string;
    }
  | {
      kind: 'oauth';
      authUrl: string;
      tokenUrl: string;
      clientId: string;
      scopes?: string[];
      label?: string;
    }
  | {
      kind: 'oauth-device-code';
      deviceCodeUrl: string;
      tokenUrl: string;
      clientId: string;
      scopes?: string[];
      label?: string;
    }
  | {
      kind: 'aws-signature';
      accessKeyEnvVar?: string;
      secretEnvVar?: string;
      regionEnvVar?: string;
      label?: string;
    }
  | { kind: 'gcp-adc'; label?: string }
  | { kind: 'none'; label?: string };

/** Resolved credentials passed to a provider at request time. */
export interface ProviderCredentials {
  apiKey?: string;
  bearerToken?: string;
  oauthAccessToken?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  /** Free-form headers (e.g., OpenRouter attribution, Anthropic beta flags). */
  customHeaders?: Record<string, string>;
}

// ============================================================================
// Content blocks (provider-shape messages)
// ============================================================================

/** Anthropic-style ephemeral cache control marker. */
export interface EphemeralCacheControl {
  type: 'ephemeral';
  ttl?: '5m' | '1h';
}

export interface TextBlock {
  type: 'text';
  text: string;
  cacheControl?: EphemeralCacheControl;
}

export interface ImageBlock {
  type: 'image';
  source: { type: 'base64'; mediaType: string; data: string } | { type: 'url'; url: string };
}

/**
 * User-provided document/file input. The web boundary hydrates owner-scoped
 * storage references into this base64 form only after authorization, so raw
 * file bytes never need to be persisted in a chat message or trusted from a
 * browser request.
 */
export interface FileBlock {
  type: 'file';
  filename: string;
  source: { type: 'base64'; mediaType: string; data: string };
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  content: string | TextBlock[];
  isError?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  /** Anthropic returns a signature for thinking blocks; needed to round-trip. */
  signature?: string;
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | FileBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock;

/** A message at the provider boundary. Richer than UI-layer ChatMessage. */
export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

// ============================================================================
// Tools
// ============================================================================

/** A tool the model can call. JSON Schema describes the input shape. */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema (Draft 2020-12 compatible). Provider adapters may normalize this. */
  inputSchema: Record<string, unknown>;
  /** OpenAI-style strict mode flag. */
  strict?: boolean;
}

export type ToolChoice = 'auto' | 'none' | 'required' | { type: 'tool'; name: string };

// ============================================================================
// Thinking / reasoning
// ============================================================================

export type ThinkingConfig =
  | {
      type: 'enabled';
      budgetTokens?: number;
      /**
       * Provider discrete thinking level (`generationConfig.thinkingConfig.
       * thinkingLevel` ∈ `minimal|low|medium|high`). This is the current
       * control; the integer `thinkingBudget` form is still accepted as a
       * legacy fallback. When set, the Google adapter emits `thinkingLevel` and
       * omits `thinkingBudget`. See reasoning-effort-capability-matrix-2026-07-10
       * flag 4.
       */
      thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
      /**
       * Whether the provider should stream back a summary of its reasoning
       * (Gemini's `generationConfig.thinkingConfig.includeThoughts`; no
       * effect on Anthropic, which always returns thinking content when
       * `enabled` and has no separate visibility toggle). Defaults to `true`
       * when omitted — every existing caller that never set this field keeps
       * today's behavior unchanged. Added so a caller can request the
       * thinking BUDGET (quality benefit) without opting into the provider
       * also returning the thinking TEXT, when matching a wire that never
       * surfaced it is required (see packages/ai/providers/google/src/
       * translate.ts and apps/web's canonical-request.ts
       * `toCanonicalGoogleThinking`).
       */
      includeThoughts?: boolean;
    }
  | { type: 'disabled' }
  /**
   * Adaptive extended thinking: the model chooses its own thinking depth
   * with no client-specified budget. Anthropic-specific today (newer Claude
   * models where `anthropicUsesAdaptiveThinking()`-style capability checks
   * apply, see apps/web's request-processor.ts `buildThinkingConfig`) —
   * `packages/ai/providers/anthropic/src/translate.ts` maps this straight to
   * Anthropic's `thinking: {type:'adaptive'}` request field. Other adapters
   * that don't support adaptive thinking should treat this the same as
   * `{type:'enabled'}` with no explicit budget (their own default applies).
   */
  | { type: 'adaptive' };

// ============================================================================
// Chat request
// ============================================================================

/** Provider-shape chat completion request. */
export interface ChatRequest {
  /** Canonical or vendor-id model name. Adapters normalize. */
  model: string;
  messages: ProviderMessage[];
  /** System prompt: string or pre-blocked (for Anthropic cache_control). */
  system?: string | TextBlock[];
  tools?: ToolDef[];
  /**
   * Provider-NATIVE built-in tool payloads passed through verbatim, appended
   * after the translated `tools` (e.g. Anthropic `web_search_20260209`,
   * Google `{ google_search: {} }`, OpenAI `{ type: 'web_search_preview' }`).
   * The caller owns matching each entry to the target provider's wire shape;
   * adapters append without validating or translating. Server-side gateways
   * use this for managed built-in tools (restructure Wave 2).
   */
  rawVendorTools?: unknown[];
  toolChoice?: ToolChoice;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinking?: ThinkingConfig;
  /**
   * UI-facing reasoning-effort level, independent of `thinking`. Some
   * providers accept both simultaneously as distinct request fields —
   * Anthropic sends `thinking` (budget/adaptive control) AND a separate
   * `output_config: {effort}` when both are set (see
   * `packages/ai/providers/anthropic/src/translate.ts`); OpenAI derives
   * `reasoning_effort`/`reasoning.effort` directly from this when present,
   * bypassing its budget-derived heuristic (which does not round-trip
   * `Effort` tiers losslessly — see `packages/ai/providers/openai/src/
   * translate-responses.ts`'s `thinkingBudgetToEffort`). Adapters that
   * support only one of `thinking`/`effort` should honor whichever they
   * understand and ignore the other.
   */
  effort?: Effort;
  /** Free-form metadata for tracing / billing tags. */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Stream chunks (wire-shape stream events)
// ============================================================================

export interface StreamChunkText {
  type: 'text-delta';
  delta: string;
  /**
   * Raw per-token logprob data for THIS chunk's delta, verbatim from the
   * vendor (OpenAI's `choices[0].logprobs`), when the adapter has one.
   * Optional, per-chunk (NOT a stream-stable value like `StreamChunkResponseMeta`'s
   * fields -- OpenAI reports different logprobs on every chunk, one per
   * token). Untyped/opaque here deliberately: no cross-vendor consumer
   * interprets its contents, only `packages/ai/provider-protocol`'s
   * `OpenAIWireAssembler` (`wireMode: 'openai-passthrough'`) re-serializes
   * it verbatim onto the wire when present, falling back to `null` when
   * absent (task #34's OpenAI slice).
   */
  logprobs?: unknown;
}

export interface StreamChunkThinking {
  type: 'thinking-delta';
  delta: string;
  signature?: string;
}

export interface StreamChunkToolUseStart {
  type: 'tool-use-start';
  toolUseId: string;
  name: string;
  /**
   * The vendor's own position for this tool call within its content-block
   * sequence (Anthropic: `content_block_start.index`), when the adapter has
   * one. Optional and NOT used to key normal cross-vendor consumers (which
   * should assign their own stable 0-based index by order of appearance,
   * as `packages/ai/provider-protocol`'s `OpenAIWireAssembler` does by default) —
   * it exists only so a byte-stable-wire consumer that needs to reproduce a
   * legacy vendor-index-keyed wire (the web v1 route's `tool_calls[].index`,
   * see `OpenAIWireAssembler`'s `wireMode: 'legacy-web'`) can.
   */
  vendorIndex?: number;
  /** See `StreamChunkText.logprobs` — same per-chunk passthrough contract. */
  logprobs?: unknown;
}

export interface StreamChunkToolUseDelta {
  type: 'tool-use-delta';
  toolUseId: string;
  /** Partial JSON — adapters chunk vendor input deltas. */
  deltaJson: string;
  /** See `StreamChunkText.logprobs` — same per-chunk passthrough contract. */
  logprobs?: unknown;
}

export interface StreamChunkToolUseEnd {
  type: 'tool-use-end';
  toolUseId: string;
}

/**
 * A provider-managed ("server-side") tool invocation started — distinct
 * from `tool-use-start` because the tool executes on the VENDOR's
 * infrastructure (Anthropic web_search/web_fetch/code_execution, Google
 * google_search/code_execution grounding), not via the caller's own
 * tool-execution loop. Emitted once per invocation, when the vendor stream
 * signals the tool call started (input, if the vendor streams it
 * incrementally, is not tracked here — no known consumer needs it; the
 * paired `server-tool-result` carries the outcome).
 *
 * Producer: `packages/ai/providers/anthropic/src/stream.ts` (Anthropic
 * `content_block_start` where `content_block.type === 'server_tool_use'`),
 * `packages/ai/providers/google/src/stream.ts` (Gemini grounding /
 * code-execution function-call parts).
 * Consumer: `packages/ai/provider-protocol/src/openai-wire-compat.ts`'s
 * `OpenAIWireAssembler`, which reconstructs the web v1 route's
 * `x_tool_status` delta from it.
 */
export interface StreamChunkServerToolUse {
  type: 'server-tool-use';
  toolUseId: string;
  name: string;
}

/**
 * The result of a provider-managed tool invocation — arrives as one
 * complete event (vendors resolve server-side tools before streaming the
 * result to the client; there is no incremental delta form to track).
 * `payload` carries the vendor's result object verbatim and untranslated:
 * callers that need to distinguish result kinds (web search vs. code
 * execution) inspect its shape themselves (e.g. Anthropic's
 * `web_search_tool_result`/`code_execution_tool_result` content blocks are
 * passed through byte-for-byte as `payload`) rather than this type
 * normalizing across vendors — there is no shared cross-vendor result
 * schema today.
 *
 * Producer: `packages/ai/providers/anthropic/src/stream.ts` (`content_block_
 * start` where `content_block.type` is `web_search_tool_result` /
 * `code_execution_tool_result`), `packages/ai/providers/google/src/stream.ts`
 * (grounding metadata / code-execution results).
 * Consumer: `OpenAIWireAssembler`, which reconstructs the web v1 route's
 * `x_search_results` / `x_code_result` deltas and the non-streaming
 * `search_results` response field from it.
 */
export interface StreamChunkServerToolResult {
  type: 'server-tool-result';
  toolUseId: string;
  payload: unknown;
  isError?: boolean;
}

/**
 * One citation attached to the text block currently being streamed.
 * `payload` carries the vendor's citation object verbatim (there is no
 * shared cross-vendor citation schema yet — same rationale as
 * `StreamChunkServerToolResult.payload`). `blockIndex` is the vendor's own
 * content-block index (Anthropic: `content_block_delta.index`), needed by
 * consumers that must correlate a citation back to the specific vendor SSE
 * event it came from.
 *
 * Producer: `packages/ai/providers/anthropic/src/stream.ts`
 * (`content_block_delta` where `delta.type === 'citations_delta'`).
 * Consumer: `OpenAIWireAssembler`, which (for the web v1 route only, via
 * its `citationsMode` option) reconstructs the exact raw Anthropic-shaped
 * `content_block_delta`/`citations_delta` event the legacy wire leaked
 * verbatim (captured via golden fixture, not redesigned — see
 * apps/web/app/api/llm/v1/chat/completions/__tests__/stream-transform.
 * golden.test.ts) for streaming, and aggregates into the non-streaming
 * `citations` response field.
 */
export interface StreamChunkCitation {
  type: 'citation-delta';
  blockIndex: number;
  payload: unknown;
}

/**
 * Safety-net passthrough for an upstream stream event a provider adapter
 * does not (yet) have a dedicated translation for. `payload` is the
 * COMPLETE raw vendor event, untouched.
 *
 * Why this exists: the legacy web wire (stream-transform.ts, pre-Wave-2)
 * reshapes only the Anthropic event shapes it explicitly recognizes;
 * anything else falls through its `if/else if` chain unchanged and is
 * serialized straight onto the SSE stream as-is. Byte-stability for the
 * web v1 route means reproducing that default-passthrough behavior for
 * event types this migration didn't explicitly account for — for example
 * Anthropic's `web_fetch_tool_result` content block (unlike
 * `web_search_tool_result`/`code_execution_tool_result`, the legacy code
 * never added a case for it) — rather than silently dropping them, which
 * `packages/ai/providers/anthropic/src/stream.ts`'s translator would
 * otherwise do for any content-block/delta type outside its known set.
 *
 * Producer: any adapter's `stream.ts`, for vendor event types it
 * recognizes as "exists but not (yet) worth a dedicated StreamChunk
 * variant" — currently `packages/ai/providers/anthropic/src/stream.ts` for
 * `content_block_start` block types outside {text, thinking, tool_use,
 * server_tool_use, web_search_tool_result, code_execution_tool_result}.
 * Consumer: `OpenAIWireAssembler` (web v1 route only, matching its
 * `citationsMode`-style opt-in), which re-serializes `payload` verbatim.
 * Surfaces without a legacy raw-passthrough wire to match should ignore
 * this chunk type.
 */
export interface StreamChunkVendorRaw {
  type: 'vendor-raw';
  payload: unknown;
}

/**
 * Stream-level identity/metadata some vendors report on every chunk of a
 * response (OpenAI's real `chat.completion.chunk`: `id`, `created`,
 * `system_fingerprint`, `service_tier` — all stable across the whole
 * stream). Distinct from `StreamChunkVendorRaw`: that type's contract is
 * "re-serialize this payload verbatim onto the wire"; this one is "extract
 * these fields for the consumer's OWN envelope construction" — a consumer
 * that doesn't understand `response-meta` should simply ignore it (no wire
 * output), not attempt to serialize it.
 *
 * Producer: `packages/ai/providers/openai/src/stream.ts`'s `translateOpenAIStream`,
 * emitted once from the first raw upstream chunk (task #34's OpenAI slice —
 * `buildStreamResponse`'s legacy raw-fetch passthrough carries OpenAI's real
 * `id`/`created`/etc. on every chunk; the StreamChunk round-trip has no other
 * way to recover them). Consumer: `OpenAIWireAssembler`'s `wireMode:
 * 'openai-passthrough'`, which uses these values (when present) instead of
 * synthesizing its own `id`/`created`, and includes `system_fingerprint`/
 * `service_tier` on its reconstructed envelope when present. Every field is
 * optional and every consumer treats absence as "fall back to synthesized
 * values" — a compat provider whose SDK/wire doesn't carry these (or a
 * caller in `wireMode: 'default'`/`'legacy-web'`, which never reads this
 * chunk type at all) is unaffected.
 */
export interface StreamChunkResponseMeta {
  type: 'response-meta';
  id?: string;
  created?: number;
  systemFingerprint?: string;
  serviceTier?: string;
}

export interface StreamChunkUsage {
  type: 'usage';
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /**
   * Subset of `cacheWriteTokens` billed at Anthropic's 1-hour cache rate
   * (2x input) instead of the 5-minute rate (1.25x input). Anthropic only
   * reports this breakdown (`usage.cache_creation.ephemeral_1h_input_tokens`)
   * when a request mixes 5m and 1h TTL cache breakpoints; when absent (and
   * `cacheWriteTokens` is set), the entire write is 5m-priced. Mirrors
   * `LLMProviderResponse.cacheCreation1hInputTokens` in
   * `apps/web/lib/llm-providers/base.ts`. Optional/additive — providers
   * without TTL-tiered caching (OpenAI, most OpenAI-compatible vendors)
   * never set this.
   */
  cacheWrite1hTokens?: number;
  reasoningTokens?: number;
}

export interface StreamChunkError {
  type: 'error';
  code?: string;
  message: string;
  /** Whether the error is retryable (rate limit, transient network). */
  retryable?: boolean;
  /**
   * Suggested wait before retry, in seconds. Surfaced from the upstream
   * `Retry-After` HTTP response header on 429 / 503 — adapters parse the
   * header (which can be either an integer-second count or an HTTP-date)
   * into a positive integer here. Callers SHOULD respect this hint.
   */
  retryAfterSeconds?: number;
}

export interface StreamChunkStop {
  type: 'stop';
  /**
   * `'refusal'` is the first-class safety-stop member (mirrors the agent
   * event envelope's `AgentEventStopReason::Refusal`): the provider's safety
   * layer stopped the response. It is the canonical target for BOTH
   * Anthropic's `stop_reason: 'refusal'` and OpenAI's wire
   * `finish_reason: 'content_filter'` — one honest concept, not two
   * vendor-specific ones, and distinct from `'error'` (transport/provider
   * failure) and from normal completion.
   */
  reason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'refusal' | 'error' | 'cancel';
}

export type StreamChunk =
  | StreamChunkText
  | StreamChunkThinking
  | StreamChunkToolUseStart
  | StreamChunkToolUseDelta
  | StreamChunkToolUseEnd
  | StreamChunkServerToolUse
  | StreamChunkServerToolResult
  | StreamChunkCitation
  | StreamChunkVendorRaw
  | StreamChunkResponseMeta
  | StreamChunkUsage
  | StreamChunkError
  | StreamChunkStop;

// ============================================================================
// Catalog / model info
// ============================================================================

/** Lightweight model info returned from `catalog()`. Convertible to ModelMetadata. */
export interface ModelInfo {
  id: string;
  name?: string;
  provider: Provider;
  /**
   * What kind of model this is — `reasoning`, `image`, `video`, `embedding`…
   *
   * Every model in the registry carries one, but the projection in
   * `getProviderModelCatalog` used to drop it, so every `ModelInfo` reported
   * `undefined`. Anything asking "does this provider have a usable text model"
   * silently got the wrong answer rather than a type error, because the field
   * was absent from the interface too.
   */
  modelType?: ModelType;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: Partial<ModelCapabilities>;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
}

// ============================================================================
// Hook contexts
// ============================================================================

export interface ProviderCatalogContext {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export interface ReplayPolicyContext {
  modelId: string;
  baseUrl?: string;
  capabilities?: ModelMetadata['capabilities'];
}

export interface NormalizeToolSchemasContext {
  tools: ToolDef[];
  modelId: string;
  strict?: boolean;
}

export interface WrapStreamFnContext {
  modelId: string;
  baseUrl?: string;
}

// ============================================================================
// Replay policy (transcript history rebuild)
// ============================================================================

/** Per-provider session-history rebuild rules. */
export interface ReplayPolicy {
  /** Strip blocks that don't round-trip (e.g., thinking content for some providers). */
  sanitizeForReplay(messages: ProviderMessage[]): ProviderMessage[];
}

// ============================================================================
// Adapter
// ============================================================================

export interface ProviderAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  credentials?: ProviderCredentials;
  defaultMaxOutputTokens?: number;
  /** Custom fetch (for proxies, retries, instrumentation). */
  fetch?: typeof fetch;
}

/**
 * The interface every provider implements.
 *
 * Four required surfaces (`id`, `label`, `auth`, `stream`) plus four optional
 * hooks (`catalog`, `buildReplayPolicy`, `normalizeToolSchemas`,
 * `wrapStreamFn`). Lift OpenClaw's tier-1 normalization helpers into the
 * optional hooks; anything provider-specific stays inside `stream`.
 */
export interface ProviderAdapter {
  readonly id: Provider;
  readonly label: string;
  readonly auth: readonly AuthMethod[];
  readonly config: ProviderAdapterConfig;

  /** List available models. May hit the network. */
  catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]>;

  /** Optional: build a replay policy for transcript history rebuild. */
  buildReplayPolicy?(ctx: ReplayPolicyContext): ReplayPolicy;

  /** Optional: mutate tool schemas in-place to fit this provider's quirks. */
  normalizeToolSchemas?(ctx: NormalizeToolSchemasContext): void;

  /** Optional: wrap the streaming function for per-provider compat. */
  wrapStreamFn?(
    ctx: WrapStreamFnContext,
  ): (req: ChatRequest, signal: AbortSignal) => AsyncIterable<StreamChunk>;

  /** Stream a chat completion. The actual API call. */
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk>;
}

/** Factory: produce a configured adapter from a config object. */
export type ProviderAdapterFactory = (config: ProviderAdapterConfig) => ProviderAdapter;
