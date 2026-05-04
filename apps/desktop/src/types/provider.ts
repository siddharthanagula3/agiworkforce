/**
 * Provider IDs supported by the desktop UI.
 *
 * Logical groups (UI may render these as sections):
 *   - First-party (9): anthropic, openai, google, xai, deepseek, perplexity,
 *                     qwen, moonshot, zhipu
 *   - Local (3):       ollama, lmstudio, managed_cloud (managed_cloud is the
 *                     Hobby-tier proxy — local-or-cloud depending on mode)
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
