
export interface ByokProvider {
  id: string;
  label: string;
  envVar: string;
  iconText: string;
  pendingAdapter?: boolean;
}

export const BYOK_PROVIDERS: ReadonlyArray<ByokProvider> = [
  { id: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', iconText: 'AN' },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY', iconText: 'OA' },
  { id: 'google', label: 'Google', envVar: 'GOOGLE_API_KEY', iconText: 'GG' },
  { id: 'xai', label: 'xAI', envVar: 'XAI_API_KEY', iconText: 'XA' },
  { id: 'deepseek', label: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', iconText: 'DS' },
  { id: 'perplexity', label: 'Perplexity', envVar: 'PERPLEXITY_API_KEY', iconText: 'PP' },
  { id: 'qwen', label: 'Qwen', envVar: 'QWEN_API_KEY', iconText: 'QW' },
  { id: 'moonshot', label: 'Moonshot', envVar: 'MOONSHOT_API_KEY', iconText: 'MS' },
  { id: 'zhipu', label: 'Zhipu', envVar: 'ZHIPU_API_KEY', iconText: 'ZH' },
  { id: 'openrouter', label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', iconText: 'OR' },
];
