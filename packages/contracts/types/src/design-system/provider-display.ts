/**
 * Display-tier provider identity used by all 6 surfaces in model pickers and UI surfaces.
 *
 * This is the **UI subset** of the wire-level {@link Provider} union in
 * `packages/contracts/types/src/provider.ts`. It additionally includes pseudo-identifiers
 * (`custom-openai-compatible`, `agi-cloud`) that are not real providers in
 * `models.json` but are needed for the model picker UI.
 *
 * To add a new provider that should show up in pickers:
 *   1. Add the literal here.
 *   2. Add a `PROVIDER_DISPLAY[id]` entry below.
 *   3. If it's a real wire provider, also add it to {@link Provider} in `provider.ts`
 *      and to `models.json` per the instructions there.
 *
 * Not the wire format. Use {@link Provider} for adapter routing and `models.json`
 * provider keys.
 */
export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'perplexity'
  | 'qwen'
  | 'moonshot'
  | 'minimax'
  | 'zhipu'
  | 'ollama'
  | 'lmstudio'
  | 'custom-openai-compatible'
  | 'agi-cloud';

export interface ProviderDisplay {
  id: ProviderId;
  label: string;
  icon: string;
  brandColor: string;
  isLocal: boolean;
  supportsEffort: boolean;
}

export const PROVIDER_DISPLAY: Readonly<Record<ProviderId, ProviderDisplay>> = Object.freeze({
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    icon: 'providers/anthropic.svg',
    brandColor: '#D4A27F',
    isLocal: false,
    supportsEffort: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    icon: 'providers/openai.svg',
    brandColor: '#10A37F',
    isLocal: false,
    supportsEffort: true,
  },
  google: {
    id: 'google',
    label: 'Google',
    icon: 'providers/google.svg',
    brandColor: '#4285F4',
    isLocal: false,
    supportsEffort: true,
  },
  xai: {
    id: 'xai',
    label: 'xAI',
    icon: 'providers/xai.svg',
    brandColor: '#000000',
    isLocal: false,
    supportsEffort: false,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    icon: 'providers/deepseek.svg',
    brandColor: '#4D6BFE',
    isLocal: false,
    supportsEffort: false,
  },
  perplexity: {
    id: 'perplexity',
    label: 'Perplexity',
    icon: 'providers/perplexity.svg',
    brandColor: '#1FB8CD',
    isLocal: false,
    supportsEffort: false,
  },
  qwen: {
    id: 'qwen',
    label: 'Qwen',
    icon: 'providers/qwen.svg',
    brandColor: '#615CED',
    isLocal: false,
    supportsEffort: false,
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot',
    icon: 'providers/moonshot.svg',
    brandColor: '#16A34A',
    isLocal: false,
    supportsEffort: false,
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    icon: 'providers/minimax.svg',
    brandColor: '#E73562',
    isLocal: false,
    supportsEffort: false,
  },
  zhipu: {
    id: 'zhipu',
    label: 'Zhipu',
    icon: 'providers/zhipu.svg',
    brandColor: '#3B82F6',
    isLocal: false,
    supportsEffort: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    icon: 'providers/ollama.svg',
    brandColor: '#000000',
    isLocal: true,
    supportsEffort: false,
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio',
    icon: 'providers/lmstudio.svg',
    brandColor: '#7C3AED',
    isLocal: true,
    supportsEffort: false,
  },
  'custom-openai-compatible': {
    id: 'custom-openai-compatible',
    label: 'Custom (OpenAI-compatible)',
    icon: 'providers/custom.svg',
    brandColor: '#71717A',
    isLocal: false,
    supportsEffort: false,
  },
  'agi-cloud': {
    id: 'agi-cloud',
    label: 'AGI Cloud',
    icon: 'providers/agi.svg',
    brandColor: '#F59E0B',
    isLocal: false,
    supportsEffort: true,
  },
});

export type CapabilityTier = 'fastest' | 'balanced' | 'most-capable';

export const CAPABILITY_LABEL: Readonly<Record<CapabilityTier, string>> = Object.freeze({
  fastest: 'Fastest',
  balanced: 'Balanced',
  'most-capable': 'Most capable',
});
