/**
 * @agiworkforce/provider-protocol
 *
 * Cross-provider LLM payload normalization helpers.
 *
 * This package encodes painful production knowledge about per-vendor and
 * per-endpoint quirks (compatible proxies rejecting `store`, DeepSeek's
 * reasoning-tag format, Anthropic cache_control
 * on Vertex, etc.). All exports are pure functions: no runtime, no IO, no
 * provider SDK couplings. Use them at the request-build boundary in any
 * provider adapter.
 *
 * Ported from OpenClaw (MIT, Peter Steinberger). See THIRD_PARTY_LICENSES.md
 * at repo root for full attribution.
 *
 * @packageDocumentation
 */

export { streamChunkToAgentEvent, agentEventToStreamChunk } from './agent-event-envelope';

export {
  resolveOpenAIResponsesPayloadPolicy,
  applyOpenAIResponsesPayloadPolicy,
  resolveBundledOpenAIResponsesEndpointClass,
} from './openai-responses-payload-policy';
export type {
  OpenAIResponsesPayloadModel,
  OpenAIResponsesPayloadPolicy,
  OpenAIResponsesPayloadPolicyOptions,
  OpenAIResponsesEndpointClass,
} from './openai-responses-payload-policy';

export {
  normalizeOpenAIReasoningEffort,
  resolveOpenAISupportedReasoningEfforts,
  supportsOpenAIReasoningEffort,
  resolveOpenAIReasoningEffortForModel,
} from './openai-reasoning-effort';
export type { OpenAIReasoningEffort, OpenAIApiReasoningEffort } from './openai-reasoning-effort';

export {
  SYSTEM_PROMPT_CACHE_BOUNDARY,
  stripSystemPromptCacheBoundary,
  splitSystemPromptCacheBoundary,
  prependSystemPromptAdditionAfterCacheBoundary,
} from './system-prompt-cache-boundary';

// Prompt section utilities (re-exported for callers building system prompts)
export {
  normalizeStructuredPromptSection,
  normalizePromptCapabilityIds,
} from './lib/prompt-cache-stability';

export { resolveProviderRequestCapabilities } from './provider-attribution';
export type {
  ProviderRequestCapabilities,
  ProviderRequestCapabilitiesInput,
  ProviderEndpointClass as ProviderAttributionEndpointClass,
  ProviderRequestCapability,
  ProviderRequestTransport,
} from './provider-attribution';

export {
  resolveAnthropicPayloadPolicy,
  applyAnthropicPayloadPolicyToParams,
  applyAnthropicEphemeralCacheControlMarkers,
} from './anthropic-payload-policy';
export type {
  AnthropicPayloadPolicy,
  AnthropicPayloadPolicyInput,
  AnthropicEphemeralCacheControl,
  AnthropicServiceTier,
} from './anthropic-payload-policy';

export {
  resolveOpenAICompletionsCompatDefaults,
  detectOpenAICompletionsCompat,
} from './openai-completions-compat';
export type {
  OpenAICompletionsCompatDefaults,
  OpenAICompletionsCompatDefaultsInput,
  DetectedOpenAICompletionsCompat,
} from './openai-completions-compat';

export {
  normalizeStrictOpenAIJsonSchema,
  normalizeOpenAIStrictToolParameters,
  isStrictOpenAIJsonSchemaCompatible,
  findOpenAIStrictToolSchemaDiagnostics,
  resolveOpenAIStrictToolFlagForInventory,
} from './openai-tool-schema';
export type { OpenAIStrictToolSchemaDiagnostic } from './openai-tool-schema';

export { normalizeToolParameterSchema } from './tool-parameter-schema';
export type { ToolParameterSchemaOptions } from './tool-parameter-schema';

export {
  cleanSchemaForGemini,
  GEMINI_SUPPORTED_SCHEMA_KEYWORDS,
  GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS,
} from './lib/clean-for-gemini';

export {
  createAnthropicToolPayloadCompatibilityWrapper,
  createOpenAIAnthropicToolPayloadCompatibilityWrapper,
} from './anthropic-tool-payload-compat';
export type {
  AnthropicToolPayloadCompatibilityOptions,
  AnthropicToolSchemaMode,
  AnthropicToolChoiceMode,
  GenericStreamFn,
} from './anthropic-tool-payload-compat';

export {
  openAIWireRequestToChatRequest,
  OpenAIWireAssembler,
  assembleOpenAIWireResponse,
} from './openai-wire-compat';

export { toolStatusPhrase } from './tool-status-phrases';

export { toProviderApiModelId } from './provider-model-id';
export type {
  OpenAIWireChatRequest,
  OpenAIWireMessage,
  OpenAIWireToolCall,
  OpenAIWireToolDefinition,
  OpenAIWireToolChoice,
  OpenAIWireAssemblerOptions,
  OpenAIWireUsage,
  OpenAIWireFinishReason,
} from './openai-wire-compat';
