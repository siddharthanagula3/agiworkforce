/**
 * Canonical list of BYOK-capable providers and their env-var keys.
 *
 * Used by:
 *  - /api/byok/env-key-status  (server-side presence check)
 *  - /settings/byok            (Settings page)
 *  - /byok                     (marketing page)
 *
 * Providers marked `pendingAdapter: true` are expected from R23 lane D
 * (Mistral, Groq, OpenRouter adapters). The env-key-status route does not
 * require adapter code to exist — it only reads process.env — so listing
 * them here is safe before lane D merges.
 */

export interface ByokProvider {
  /** Canonical ID matching factory.ts provider key (or future key) */
  id: string;
  /** Display name shown in UI */
  label: string;
  /** Environment variable the factory reads */
  envVar: string;
  /** 2-3 char abbreviation for icon fallback */
  iconText: string;
  /** True when the factory adapter is not yet merged (pending lane D) */
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
  // Lane D adapters: files exist in lib/llm-providers/ but switch wiring in factory.ts
  // is not yet merged. Env-key detection works regardless of adapter state.
  {
    id: 'mistral',
    label: 'Mistral',
    envVar: 'MISTRAL_API_KEY',
    iconText: 'MI',
    pendingAdapter: true,
  },
  { id: 'groq', label: 'Groq', envVar: 'GROQ_API_KEY', iconText: 'GR', pendingAdapter: true },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    iconText: 'OR',
    pendingAdapter: true,
  },
];
