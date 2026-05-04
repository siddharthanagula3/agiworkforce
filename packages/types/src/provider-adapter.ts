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
 *   `@agiworkforce/llm-normalize`.
 *
 * Implementations: see `packages/providers/<vendor>/`.
 *
 * @module provider-adapter
 * @packageDocumentation
 */

import type { Provider } from './provider';
import type { ModelMetadata, ModelCapabilities } from './model-catalog';

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

export type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

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

export type ThinkingConfig = { type: 'enabled'; budgetTokens?: number } | { type: 'disabled' };

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
  toolChoice?: ToolChoice;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinking?: ThinkingConfig;
  /** Free-form metadata for tracing / billing tags. */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Stream chunks (wire-shape stream events)
// ============================================================================

export interface StreamChunkText {
  type: 'text-delta';
  delta: string;
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
}

export interface StreamChunkToolUseDelta {
  type: 'tool-use-delta';
  toolUseId: string;
  /** Partial JSON — adapters chunk vendor input deltas. */
  deltaJson: string;
}

export interface StreamChunkToolUseEnd {
  type: 'tool-use-end';
  toolUseId: string;
}

export interface StreamChunkUsage {
  type: 'usage';
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export interface StreamChunkError {
  type: 'error';
  code?: string;
  message: string;
  /** Whether the error is retryable (rate limit, transient network). */
  retryable?: boolean;
}

export interface StreamChunkStop {
  type: 'stop';
  reason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error' | 'cancel';
}

export type StreamChunk =
  | StreamChunkText
  | StreamChunkThinking
  | StreamChunkToolUseStart
  | StreamChunkToolUseDelta
  | StreamChunkToolUseEnd
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
