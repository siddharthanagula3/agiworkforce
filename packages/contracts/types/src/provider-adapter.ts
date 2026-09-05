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

export type AuthMethod =
  | {
      kind: 'api-key';
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

export interface ProviderCredentials {
  apiKey?: string;
  bearerToken?: string;
  oauthAccessToken?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  customHeaders?: Record<string, string>;
}

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
  signature?: string;
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | FileBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock;

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  strict?: boolean;
}

export type ToolChoice = 'auto' | 'none' | 'required' | { type: 'tool'; name: string };

export type ThinkingConfig =
  | {
      type: 'enabled';
      budgetTokens?: number;
      thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
      includeThoughts?: boolean;
    }
  | { type: 'disabled' }
  /**
   * Adaptive extended thinking: the model chooses its own thinking depth
   * with no client-specified budget. Anthropic-specific today (newer Claude
   * models where `anthropicUsesAdaptiveThinking()`-style capability checks
   * apply, see apps/web's request-processor.ts `buildThinkingConfig`).
   * `packages/ai/providers/anthropic/src/translate.ts` maps this straight to
   * Anthropic's `thinking: {type:'adaptive'}` request field. Other adapters
   * that don't support adaptive thinking should treat this the same as
   * `{type:'enabled'}` with no explicit budget (their own default applies).
   */
  | { type: 'adaptive' };

export interface ChatRequest {
  model: string;
  messages: ProviderMessage[];
  system?: string | TextBlock[];
  tools?: ToolDef[];
  rawVendorTools?: unknown[];
  toolChoice?: ToolChoice;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinking?: ThinkingConfig;
  effort?: Effort;
  /**
   * The caller's zero-retention requirement, the same signal Auto routing's
   * admission reads. An adapter whose provider honours it per request must
   * apply it here; admission only offers such a route to a requirement it has
   * declared it can meet.
   */
  zeroDataRetentionOnly?: boolean;
  metadata?: Record<string, unknown>;
}

export interface StreamChunkText {
  type: 'text-delta';
  delta: string;
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
  vendorIndex?: number;
  logprobs?: unknown;
}

export interface StreamChunkToolUseDelta {
  type: 'tool-use-delta';
  toolUseId: string;
  deltaJson: string;
  logprobs?: unknown;
}

export interface StreamChunkToolUseEnd {
  type: 'tool-use-end';
  toolUseId: string;
}

export interface StreamChunkServerToolUse {
  type: 'server-tool-use';
  toolUseId: string;
  name: string;
}

export interface StreamChunkServerToolResult {
  type: 'server-tool-result';
  toolUseId: string;
  payload: unknown;
  isError?: boolean;
}

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
 * event types this migration didn't explicitly account for, rather than
 * silently dropping them, which
 * `packages/ai/providers/anthropic/src/stream.ts`'s translator would
 * otherwise do for any content-block/delta type outside its known set.
 *
 * Producer: any adapter's `stream.ts`, for vendor event types it
 * recognizes as "exists but not (yet) worth a dedicated StreamChunk
 * variant", currently `packages/ai/providers/anthropic/src/stream.ts` for
 * `content_block_start` block types outside {text, thinking, tool_use,
 * server_tool_use, web_search_tool_result, code_execution_tool_result,
 * web_fetch_tool_result}.
 * Consumer: `OpenAIWireAssembler` (web v1 route only, matching its
 * `citationsMode`-style opt-in), which re-serializes `payload` verbatim.
 * Surfaces without a legacy raw-passthrough wire to match should ignore
 * this chunk type.
 */
export interface StreamChunkVendorRaw {
  type: 'vendor-raw';
  payload: unknown;
}

export interface StreamChunkResponseMeta {
  type: 'response-meta';
  id?: string;
  created?: number;
  systemFingerprint?: string;
  serviceTier?: string;
  provider?: string;
}

export interface StreamChunkUsage {
  type: 'usage';
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cacheWrite1hTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  cacheDiscountUsd?: number;
  providerReportedCostUsd?: number;
}

export interface StreamChunkError {
  type: 'error';
  code?: string;
  message: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
}

export interface StreamChunkStop {
  type: 'stop';
  /**
   * `'refusal'` is the first-class safety-stop member (mirrors the agent
   * event envelope's `AgentEventStopReason::Refusal`): the provider's safety
   * layer stopped the response. It is the canonical target for BOTH
   * Anthropic's `stop_reason: 'refusal'` and OpenAI's wire
   * `finish_reason: 'content_filter'`, one honest concept, not two
   * vendor-specific ones, and distinct from `'error'` (transport/provider
   * failure) and from normal completion.
   *
   * `'pause_turn'` is NOT a completion: the provider suspended a still-running
   * turn (Anthropic's `stop_reason: 'pause_turn'`, emitted for long-running
   * server tools) and the turn is resumable by sending the response back.
   * Callers must not report it as a finished answer.
   */
  reason:
    | 'end_turn'
    | 'max_tokens'
    | 'tool_use'
    | 'stop_sequence'
    | 'refusal'
    | 'pause_turn'
    | 'error'
    | 'cancel';
  /**
   * The vendor's own terminal signal verbatim (Gemini `finishReason` or
   * `promptFeedback.blockReason`, e.g. `'SAFETY'`, `'MAX_TOKENS'`, `'OTHER'`).
   * `reason` above is the canonical 8-way vocabulary every adapter maps onto;
   * this field preserves the untranslated vendor string for a consumer that
   * needs finer granularity than that vocabulary carries (SAFETY vs
   * RECITATION vs BLOCKLIST all collapse to `reason: 'refusal'`). Omitted
   * when the adapter has no such signal to report.
   */
  providerFinishReason?: string;
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

export interface ModelInfo {
  id: string;
  name?: string;
  provider: Provider;
  modelType?: ModelType;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: Partial<ModelCapabilities>;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
}

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

export interface ReplayPolicy {
  sanitizeForReplay(messages: ProviderMessage[]): ProviderMessage[];
}

export interface ProviderAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  credentials?: ProviderCredentials;
  defaultMaxOutputTokens?: number;
  fetch?: typeof fetch;
}

export interface ProviderAdapter {
  readonly id: Provider;
  readonly label: string;
  readonly auth: readonly AuthMethod[];
  readonly config: ProviderAdapterConfig;

  catalog(ctx?: ProviderCatalogContext): Promise<ModelInfo[]>;

  buildReplayPolicy?(ctx: ReplayPolicyContext): ReplayPolicy;

  normalizeToolSchemas?(ctx: NormalizeToolSchemasContext): void;

  wrapStreamFn?(
    ctx: WrapStreamFnContext,
  ): (req: ChatRequest, signal: AbortSignal) => AsyncIterable<StreamChunk>;

  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<StreamChunk>;
}

export type ProviderAdapterFactory = (config: ProviderAdapterConfig) => ProviderAdapter;
