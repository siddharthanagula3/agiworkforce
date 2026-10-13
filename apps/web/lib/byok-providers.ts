export interface ProviderKey {
  readonly id: string;
  readonly label: string;
  readonly envVar: string;
}

export interface CliKeyProvider extends ProviderKey {
  readonly catalogId: string | null;
}

export const CLI_KEY_PROVIDERS: ReadonlyArray<CliKeyProvider> = [
  { id: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', catalogId: 'anthropic' },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY', catalogId: 'openai' },
  { id: 'google', label: 'Google', envVar: 'GOOGLE_API_KEY', catalogId: 'google' },
  { id: 'xai', label: 'xAI', envVar: 'XAI_API_KEY', catalogId: 'xai' },
  { id: 'deepseek', label: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', catalogId: 'deepseek' },
  { id: 'minimax', label: 'MiniMax', envVar: 'MINIMAX_API_KEY', catalogId: 'minimax' },
  { id: 'perplexity', label: 'Perplexity', envVar: 'PERPLEXITY_API_KEY', catalogId: 'perplexity' },
  { id: 'qwen', label: 'Qwen / DashScope', envVar: 'QWEN_API_KEY', catalogId: 'qwen' },
  { id: 'moonshot', label: 'Moonshot / Kimi', envVar: 'MOONSHOT_API_KEY', catalogId: 'moonshot' },
  { id: 'zhipu', label: 'Zhipu / GLM', envVar: 'ZHIPU_API_KEY', catalogId: 'zhipu' },
  { id: 'ollama-cloud', label: 'Ollama Cloud', envVar: 'OLLAMA_API_KEY', catalogId: null },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    catalogId: 'open_router',
  },
  { id: 'nvidia', label: 'NVIDIA NIM', envVar: 'NVIDIA_API_KEY', catalogId: 'nvidia_nim' },
];

export const CLI_SEARCH_KEYS: ReadonlyArray<ProviderKey> = [
  { id: 'brave', label: 'Brave Search', envVar: 'BRAVE_SEARCH_API_KEY' },
  { id: 'tavily', label: 'Tavily', envVar: 'TAVILY_API_KEY' },
];

export const CLI_CATALOG_PROVIDER_IDS: ReadonlyArray<string> = CLI_KEY_PROVIDERS.flatMap(
  (provider) => (provider.catalogId === null ? [] : [provider.catalogId]),
);

export const CLI_KEY_PROVIDERS_OUTSIDE_CATALOG: ReadonlyArray<CliKeyProvider> =
  CLI_KEY_PROVIDERS.filter((provider) => provider.catalogId === null);

export const CLI_KEYS_OUTSIDE_CATALOG_NOTE =
  CLI_KEY_PROVIDERS_OUTSIDE_CATALOG.length > 0
    ? `It also takes a key for ${new Intl.ListFormat('en', { type: 'conjunction' }).format(
        CLI_KEY_PROVIDERS_OUTSIDE_CATALOG.map((provider) => provider.label),
      )}, which the catalogue does not list.`
    : '';

export const SELF_HOSTED_KEY_PROVIDERS: ReadonlyArray<ProviderKey> = [
  { id: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { id: 'google', label: 'Google', envVar: 'GOOGLE_API_KEY' },
  { id: 'xai', label: 'xAI', envVar: 'XAI_API_KEY' },
  { id: 'deepseek', label: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY' },
  { id: 'minimax', label: 'MiniMax', envVar: 'MINIMAX_API_KEY' },
  { id: 'perplexity', label: 'Perplexity', envVar: 'PERPLEXITY_API_KEY' },
  { id: 'qwen', label: 'Qwen', envVar: 'QWEN_API_KEY' },
  { id: 'moonshot', label: 'Moonshot', envVar: 'MOONSHOT_API_KEY' },
  { id: 'zhipu', label: 'Zhipu', envVar: 'ZHIPU_API_KEY' },
  { id: 'openrouter', label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY' },
  { id: 'groq', label: 'Groq', envVar: 'GROQ_API_KEY' },
  { id: 'nvidia_nim', label: 'NVIDIA NIM', envVar: 'NVIDIA_NIM_API_KEY' },
  { id: 'workers_ai', label: 'Cloudflare Workers AI', envVar: 'WORKERS_AI_API_KEY' },
  { id: 'vercel_gateway', label: 'Vercel AI Gateway', envVar: 'VERCEL_GATEWAY_API_KEY' },
];
