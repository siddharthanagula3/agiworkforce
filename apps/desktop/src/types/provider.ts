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

export const LOCAL_PROVIDER_IDS = ['ollama', 'lmstudio', 'llamacpp', 'vllm', 'local'] as const;

const LOCAL_PROVIDER_SET: ReadonlySet<string> = new Set<string>(LOCAL_PROVIDER_IDS);

export function isLocalProvider(provider: string | null | undefined): boolean {
  if (!provider) return false;
  return LOCAL_PROVIDER_SET.has(provider.toLowerCase());
}
