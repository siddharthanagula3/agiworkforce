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
