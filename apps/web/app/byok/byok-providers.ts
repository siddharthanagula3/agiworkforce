import { modelsCatalogJson } from '@agiworkforce/types';

export const BYOK_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
  'qwen',
  'moonshot',
  'perplexity',
  'zhipu',
  'open_router',
  'nvidia_nim',
] as const;

const catalogProviders = modelsCatalogJson.providers as Record<string, { label?: string }>;

export function byokProviderLabels(): string[] {
  return BYOK_PROVIDER_IDS.map((id) => catalogProviders[id]?.label).filter(
    (label): label is string => typeof label === 'string' && label.length > 0,
  );
}
