import type { LocalModel, LocalModelId, LocalRuntimeTier } from './types.js';

const CATALOG: Record<LocalModelId, LocalModel> = {
  system: {
    id: 'system',
    name: 'System',
    sizeBytes: 0,
    supportedTiers: [1],
    license: 'OS-resident — no redistribution',
  },
  'qwen2.5-1.5b-instruct-q4_k_m': {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen 2.5 1.5B',
    sizeBytes: 1073741824,
    supportedTiers: [2, 3],
    license: 'Qwen License (Apache-2.0 base + usage restrictions — verify checkpoint)',
  },
  'llama-3.2-3b-instruct-q4': {
    id: 'llama-3.2-3b-instruct-q4',
    name: 'Llama 3.2 3B',
    sizeBytes: 1932735283,
    supportedTiers: [2, 3],
    license: 'Llama 3.2 Community License',
  },
  'gemma-3-4b-vision-q4': {
    id: 'gemma-3-4b-vision-q4',
    name: 'Gemma 3 4B Vision',
    sizeBytes: 2684354560,
    supportedTiers: [2, 3],
    license: 'Gemma Terms of Use — verify checkpoint license before redistribute',
  },
  'whisper-base-en': {
    id: 'whisper-base-en',
    name: 'Whisper Base (English)',
    sizeBytes: 146800640,
    supportedTiers: [2, 3],
    license: 'MIT',
  },
  'nomic-embed-text-v1.5-q8': {
    id: 'nomic-embed-text-v1.5-q8',
    name: 'Nomic Embed v1.5',
    sizeBytes: 157286400,
    supportedTiers: [2, 3],
    license: 'Apache-2.0',
  },
};

export function getModelById(id: LocalModelId): LocalModel {
  const model = CATALOG[id];
  if (!model) throw new Error(`Unknown local model id: ${id}`);
  return model;
}

export function getModelsByTier(tier: LocalRuntimeTier): LocalModel[] {
  return Object.values(CATALOG).filter((m) => m.supportedTiers.includes(tier));
}

export function getAllModels(): LocalModel[] {
  return Object.values(CATALOG);
}
