/**
 * Provider Type
 *
 * Canonical union type for all LLM provider identifiers supported by the
 * AGI Workforce platform. This is the single source of truth consumed by
 * all surfaces: desktop, web, mobile, extension, CLI, and services.
 *
 * ## Adding a new provider
 *
 * 1. Add the string literal to the `Provider` union below.
 * 2. Add a corresponding entry to `packages/types/src/models.json` under
 *    `providers` with at minimum a `label` field.
 * 3. Update the Rust mirror in
 *    `apps/desktop/src-tauri/src/core/llm/models_config.rs` (Provider enum).
 * 4. Update `apps/desktop/src/types/provider.ts` to re-export from here
 *    (tracked separately — see Phase 2E migration).
 *
 * ## Rust equivalent
 *
 * ```rust
 * pub enum Provider {
 *     OpenAi,
 *     Anthropic,
 *     Google,
 *     Ollama,
 *     Xai,
 *     Deepseek,
 *     Qwen,
 *     Moonshot,
 *     Perplexity,
 *     Zhipu,
 *     ManagedCloud,
 *     Mistral,
 *     Groq,
 *     Together,
 *     Fireworks,
 *     Cerebras,
 *     DeepInfra,
 *     NvidiaNim,
 *     OpenRouter,
 *     Cohere,
 *     Ai21,
 *     Sambanova,
 *     Azure,
 *     Bedrock,
 * }
 * ```
 *
 * Rust serialization uses `snake_case` (serde rename_all), so wire values
 * match the TypeScript literals exactly.
 *
 * @module provider
 * @packageDocumentation
 */

/**
 * All LLM provider identifiers supported by the AGI Workforce platform.
 *
 * Values are stable `snake_case` strings that match:
 *   - Rust `Provider` enum serialized values (`serde(rename_all = "snake_case")`)
 *   - The keys in `models.json` `providers` map
 *   - The `provider` field on `ModelMetadata`
 *
 * @example
 * ```typescript
 * import type { Provider } from '@agiworkforce/types';
 *
 * function isCloudProvider(p: Provider): boolean {
 *   return p !== 'ollama';
 * }
 * ```
 */
export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'perplexity'
  | 'zhipu'
  | 'managed_cloud'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'deepinfra'
  | 'nvidia_nim'
  | 'open_router'
  | 'cohere'
  | 'ai21'
  | 'sambanova'
  | 'azure'
  | 'bedrock'
  | 'ollama_cloud';
