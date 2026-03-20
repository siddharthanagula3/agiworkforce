/**
 * Mobile model catalog — ported from desktop `apps/desktop/src/constants/llm.ts`.
 * Excludes Ollama (no local inference on mobile v1).
 * Excludes image/video/audio-only models (not relevant for chat).
 *
 * Last synced: February 2026
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelTier = 'economy' | 'balanced' | 'premium';

export interface ModelDef {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  tier: ModelTier;
}

export interface ProviderDef {
  id: string;
  name: string;
  /** Lucide icon name rendered in the UI */
  icon: string;
  color: string;
}

export interface AutoModeDef {
  id: string;
  name: string;
  description: string;
  /** Lucide icon name */
  icon: string;
  tier: ModelTier;
}

// ---------------------------------------------------------------------------
// Auto modes
// ---------------------------------------------------------------------------

export const AUTO_MODES: AutoModeDef[] = [
  {
    id: 'auto-economy',
    name: 'Economy',
    description: 'Fastest, cheapest',
    icon: 'Zap',
    tier: 'economy',
  },
  {
    id: 'auto-balanced',
    name: 'Balanced',
    description: 'Best all-around',
    icon: 'Scale',
    tier: 'balanced',
  },
  {
    id: 'auto-premium',
    name: 'Premium',
    description: 'Most capable',
    icon: 'Crown',
    tier: 'premium',
  },
];

// ---------------------------------------------------------------------------
// Providers (display order)
// ---------------------------------------------------------------------------

export const PROVIDERS: ProviderDef[] = [
  { id: 'openai', name: 'OpenAI', icon: 'Sparkles', color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', icon: 'Brain', color: '#d4a27f' },
  { id: 'google', name: 'Google', icon: 'Globe', color: '#4285f4' },
  { id: 'xai', name: 'xAI', icon: 'Atom', color: '#1da1f2' },
  { id: 'deepseek', name: 'DeepSeek', icon: 'Search', color: '#536dfe' },
  { id: 'moonshot', name: 'Moonshot', icon: 'Moon', color: '#f5c542' },
  { id: 'qwen', name: 'Qwen', icon: 'Cloud', color: '#6c5ce7' },
  { id: 'zhipu', name: 'ZhipuAI', icon: 'Cpu', color: '#00bfa5' },
  { id: 'perplexity', name: 'Perplexity', icon: 'Compass', color: '#20b2aa' },
];

// ---------------------------------------------------------------------------
// Model list
// ---------------------------------------------------------------------------

export const MODEL_LIST: ModelDef[] = [
  // ---- OpenAI ----
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: true,
    tier: 'premium',
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: true,
    tier: 'economy',
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: false,
    tier: 'economy',
  },
  {
    id: 'gpt-5.4-pro',
    name: 'GPT-5.4 Pro',
    provider: 'openai',
    contextWindow: 512_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: true,
    tier: 'premium',
  },
  {
    id: 'o3',
    name: 'OpenAI o3',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutput: 100_000,
    supportsVision: true,
    supportsThinking: true,
    tier: 'premium',
  },

  // ---- Anthropic ----
  {
    id: 'claude-opus-4.6',
    name: 'Claude 4.6 Opus',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 32_000,
    supportsVision: true,
    supportsThinking: true,
    tier: 'premium',
  },
  {
    id: 'claude-sonnet-4.6',
    name: 'Claude 4.6 Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: true,
    tier: 'balanced',
  },
  {
    id: 'claude-sonnet-4.5',
    name: 'Claude 4.5 Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 16_384,
    supportsVision: true,
    supportsThinking: true,
    tier: 'balanced',
  },
  {
    id: 'claude-haiku-4.5',
    name: 'Claude 4.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: false,
    tier: 'economy',
  },

  // ---- Google ----
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'google',
    contextWindow: 2_000_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: true,
    tier: 'balanced',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: false,
    tier: 'economy',
  },

  // ---- xAI ----
  {
    id: 'grok-4',
    name: 'Grok 4',
    provider: 'xai',
    contextWindow: 256_000,
    maxOutput: 16_384,
    supportsVision: false,
    supportsThinking: true,
    tier: 'premium',
  },
  {
    id: 'grok-4-fast-reasoning',
    name: 'Grok 4 Fast Reasoning',
    provider: 'xai',
    contextWindow: 2_000_000,
    maxOutput: 16_384,
    supportsVision: false,
    supportsThinking: true,
    tier: 'economy',
  },
  {
    id: 'grok-4-fast-non-reasoning',
    name: 'Grok 4 Fast (Non-Reasoning)',
    provider: 'xai',
    contextWindow: 2_000_000,
    maxOutput: 16_384,
    supportsVision: false,
    supportsThinking: false,
    tier: 'economy',
  },

  // ---- DeepSeek ----
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat (V3)',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsThinking: true,
    tier: 'economy',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsThinking: true,
    tier: 'premium',
  },

  // ---- Moonshot ----
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'moonshot',
    contextWindow: 256_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: true,
    tier: 'balanced',
  },
  {
    id: 'kimi-k2.5-thinking',
    name: 'Kimi K2.5 Thinking',
    provider: 'moonshot',
    contextWindow: 256_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: true,
    tier: 'premium',
  },

  // ---- Qwen ----
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    provider: 'qwen',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsThinking: true,
    tier: 'balanced',
  },
  {
    id: 'qwen-flash',
    name: 'Qwen Flash',
    provider: 'qwen',
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsThinking: false,
    tier: 'economy',
  },

  // ---- ZhipuAI ----
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'zhipu',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: false,
    supportsThinking: true,
    tier: 'economy',
  },
  {
    id: 'glm-4.6v',
    name: 'GLM-4.6V (Vision)',
    provider: 'zhipu',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: true,
    tier: 'economy',
  },
  {
    id: 'glm-4.6v-flash',
    name: 'GLM-4.6V Flash (FREE)',
    provider: 'zhipu',
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsVision: true,
    supportsThinking: false,
    tier: 'economy',
  },

  // ---- Perplexity ----
  {
    id: 'sonar',
    name: 'Sonar',
    provider: 'perplexity',
    contextWindow: 128_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsThinking: false,
    tier: 'economy',
  },
  {
    id: 'sonar-reasoning',
    name: 'Sonar Reasoning',
    provider: 'perplexity',
    contextWindow: 128_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsThinking: true,
    tier: 'balanced',
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    contextWindow: 200_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsThinking: false,
    tier: 'balanced',
  },
  {
    id: 'sonar-deep-research',
    name: 'Sonar Deep Research',
    provider: 'perplexity',
    contextWindow: 128_000,
    maxOutput: 4_096,
    supportsVision: false,
    supportsThinking: true,
    tier: 'premium',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const modelMap = new Map<string, ModelDef>(MODEL_LIST.map((m) => [m.id, m]));

/** Get a single model by id. Returns undefined if not found. */
export function getModelById(id: string): ModelDef | undefined {
  return modelMap.get(id);
}

/** Get all models belonging to a given provider id. */
export function getModelsByProvider(providerId: string): ModelDef[] {
  return MODEL_LIST.filter((m) => m.provider === providerId);
}

/** Get a provider definition by id. */
export function getProviderById(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Check if a model id is an auto mode. */
export function isAutoMode(id: string): boolean {
  return AUTO_MODES.some((a) => a.id === id);
}

/**
 * Format a context window number for display.
 * e.g. 200_000 -> "200K", 2_000_000 -> "2M"
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  const k = tokens / 1_000;
  return `${k % 1 === 0 ? k : k.toFixed(0)}K`;
}

/** Human-friendly label for a model or auto mode. */
export function getDisplayName(id: string): string {
  const auto = AUTO_MODES.find((a) => a.id === id);
  if (auto) return `Auto (${auto.name})`;

  const model = getModelById(id);
  return model?.name ?? id;
}
