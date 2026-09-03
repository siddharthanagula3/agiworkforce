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
  | 'groq'
  | 'nvidia_nim'
  | 'open_router'
  | 'vercel_gateway'
  | 'workers_ai'
  | 'bedrock'
  | 'ollama_cloud'
  | 'minimax'
  | 'runway'
  | 'lmstudio';
