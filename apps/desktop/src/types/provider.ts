/**
 * Provider IDs supported by the desktop UI.
 *
 * Logical groups (UI may render these as sections):
 *   - First-party (9): anthropic, openai, google, xai, deepseek, perplexity,
 *                     qwen, moonshot, zhipu
 *   - Local (5):       ollama, lmstudio, llamacpp, vllm, managed_cloud
 *                     (managed_cloud is the Basic-tier proxy — local-or-cloud
 *                     depending on mode)
 *   - Custom OpenAI-compatible: mistral, groq, together, fireworks, cerebras,
 *                     deepinfra, nvidia_nim, open_router, cohere, ai21,
 *                     sambanova, azure, bedrock
 */
export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'lmstudio'
  | 'llamacpp'
  | 'vllm'
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
  | 'bedrock';

/**
 * Provider IDs whose inference runs entirely on the user's device.
 *
 * Adding a local runtime here is the ONLY place the desktop UI should learn
 * about it. Callers must not re-derive the set with `provider === 'ollama'`
 * style comparisons: the tier gate exempts local models precisely because they
 * cost the user nothing and never leave the machine, and a runtime missing from
 * that exemption gets its selection replaced with a `managed_cloud` model —
 * a silent Local-to-Managed-Cloud boundary cross.
 *
 * `'local'` is not a member of `Provider`. It is the generic id the Rust
 * discovery layer emits for an on-device runtime it could not attribute to a
 * named product, so it is accepted here as an alias.
 */
export const LOCAL_PROVIDER_IDS = ['ollama', 'lmstudio', 'llamacpp', 'vllm', 'local'] as const;

const LOCAL_PROVIDER_SET: ReadonlySet<string> = new Set<string>(LOCAL_PROVIDER_IDS);

/**
 * True when `provider` names an on-device runtime. Case-insensitive; `null`,
 * `undefined` and the empty string are not local.
 */
export function isLocalProvider(provider: string | null | undefined): boolean {
  if (!provider) return false;
  return LOCAL_PROVIDER_SET.has(provider.toLowerCase());
}
