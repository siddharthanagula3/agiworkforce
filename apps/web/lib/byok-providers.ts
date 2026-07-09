/**
 * Canonical list of BYOK-capable providers and their env-var keys.
 *
 * Used by:
 *  - /api/byok/env-key-status  (server-side presence check)
 *  - /settings/byok            (Settings page)
 *  - /byok                     (marketing/waitlist page)
 *
 * Web is a cloud-only surface (see docs/current/source-of-truth.md's
 * per-surface trust matrix -- Local+BYOK+Cloud is Desktop/CLI/VSCode only);
 * this list and `env-key-status` only ever check whether AGI's OWN server
 * has a given provider's key configured (`process.env[envVar]`), never a
 * per-user BYOK key. There is no user-supplied-key provider construction
 * path in apps/web to keep separate from the server-key path.
 *
 * `pendingAdapter` no longer applies to any entry: Mistral/Groq/OpenRouter
 * adapters (`packages/providers/{mistral,groq,openrouter}`) all shipped and
 * are wired into every server-key adapter table (v1 chat-completions route's
 * `ADAPTER_PROVIDERS`, `apps/web/lib/services/provider-adapter-service.ts`).
 * Field kept on the type in case a future provider genuinely lands here
 * before its adapter package does.
 */

export interface ByokProvider {
  /** Canonical ID matching the provider adapter's key (or future key) */
  id: string;
  /** Display name shown in UI */
  label: string;
  /** Environment variable the server reads */
  envVar: string;
  /** 2-3 char abbreviation for icon fallback */
  iconText: string;
  /** True when this provider is listed before its adapter package exists. */
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
  { id: 'mistral', label: 'Mistral', envVar: 'MISTRAL_API_KEY', iconText: 'MI' },
  { id: 'groq', label: 'Groq', envVar: 'GROQ_API_KEY', iconText: 'GR' },
  { id: 'openrouter', label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', iconText: 'OR' },
];
