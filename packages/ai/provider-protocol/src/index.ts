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

export { resolveBundledOpenAIResponsesEndpointClass } from './openai-responses-payload-policy';
export type { OpenAIResponsesEndpointClass } from './openai-responses-payload-policy';

export {
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

export { normalizeStructuredPromptSection } from './lib/prompt-cache-stability';

export { resolveProviderRequestCapabilities } from './provider-attribution';
export type {
  ProviderRequestCapabilities,
  ProviderRequestCapabilitiesInput,
  ProviderEndpointClass as ProviderAttributionEndpointClass,
} from './provider-attribution';

export {
  resolveAnthropicPayloadPolicy,
  applyAnthropicPayloadPolicyToParams,
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
} from './openai-tool-schema';

export { normalizeToolParameterSchema } from './tool-parameter-schema';
export type { ToolParameterSchemaOptions } from './tool-parameter-schema';

export { cleanSchemaForGemini, GEMINI_SUPPORTED_SCHEMA_KEYWORDS } from './lib/clean-for-gemini';

export {
  openAIWireRequestToChatRequest,
  OpenAIWireAssembler,
  assembleOpenAIWireResponse,
  paragraphBreakBetween,
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

export { ThinkingTagSplitter, longestTrailingTagPrefix } from './thinking-tag-splitter';
export type { ThinkingTagPart } from './thinking-tag-splitter';
