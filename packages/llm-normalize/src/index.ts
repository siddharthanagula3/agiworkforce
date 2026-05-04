/**
 * @agiworkforce/llm-normalize
 *
 * Cross-provider LLM payload normalization helpers.
 *
 * This package encodes painful production knowledge about per-vendor and
 * per-endpoint quirks (Azure OpenAI dropping `service_tier`, Cerebras
 * rejecting `store`, DeepSeek's reasoning-tag format, Anthropic cache_control
 * on Vertex, etc.). All exports are pure functions: no runtime, no IO, no
 * provider SDK couplings. Use them at the request-build boundary in any
 * provider adapter.
 *
 * Ported from OpenClaw (MIT, Peter Steinberger). See THIRD_PARTY_LICENSES.md
 * at repo root for full attribution.
 *
 * @packageDocumentation
 */

// OpenAI Responses API payload policy
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

// OpenAI reasoning effort resolution
export {
  isOpenAIGpt54MiniModel,
  normalizeOpenAIReasoningEffort,
  resolveOpenAISupportedReasoningEfforts,
  supportsOpenAIReasoningEffort,
  resolveOpenAIReasoningEffortForModel,
} from './openai-reasoning-effort';
export type { OpenAIReasoningEffort, OpenAIApiReasoningEffort } from './openai-reasoning-effort';

// System prompt cache boundary
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

// Provider request capability resolution (pure, no plugin manifests)
export { resolveProviderRequestCapabilities } from './provider-attribution';
export type {
  ProviderRequestCapabilities,
  ProviderRequestCapabilitiesInput,
  ProviderEndpointClass as ProviderAttributionEndpointClass,
  ProviderRequestCapability,
  ProviderRequestTransport,
} from './provider-attribution';

// Anthropic payload policy (cache_control + service_tier)
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

// OpenAI Chat Completions API compat defaults
export {
  resolveOpenAICompletionsCompatDefaults,
  detectOpenAICompletionsCompat,
} from './openai-completions-compat';
export type {
  OpenAICompletionsCompatDefaults,
  OpenAICompletionsCompatDefaultsInput,
  DetectedOpenAICompletionsCompat,
} from './openai-completions-compat';

// OpenAI strict-mode tool schema normalization
export {
  normalizeStrictOpenAIJsonSchema,
  normalizeOpenAIStrictToolParameters,
  isStrictOpenAIJsonSchemaCompatible,
  findOpenAIStrictToolSchemaDiagnostics,
  resolveOpenAIStrictToolFlagForInventory,
} from './openai-tool-schema';
export type { OpenAIStrictToolSchemaDiagnostic } from './openai-tool-schema';

// Generic tool parameter schema normalization (Gemini, OpenAI, Anthropic, xAI)
export { normalizeToolParameterSchema } from './tool-parameter-schema';
export type { ToolParameterSchemaOptions } from './tool-parameter-schema';

// Gemini schema cleanup (exposed for direct use by Google adapter when added)
export { cleanSchemaForGemini, GEMINI_UNSUPPORTED_SCHEMA_KEYWORDS } from './lib/clean-for-gemini';

// Anthropic-family tool payload compat (OpenAI-shape tools through Anthropic API)
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
