import {
  detectProviderFromModelId,
  getProviderSurface,
  isAutoModeModelId,
  providerSurfaceToProviderMode,
  type ProviderMode,
} from '@agiworkforce/types';
import { getModelMetadata, normalizeModelId } from '@shared/config/llm';

const LOCAL_MODEL_PREFIXES = ['ollama/', 'ollama:', 'lmstudio/', 'lm-studio/', 'lmstudio:'];
const BYOK_MODEL_PREFIXES = ['open_router/', 'openrouter/', 'nvidia_nim/', 'nvidia/'];

export function normalizeProviderKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

export function inferProviderFromModelId(modelId: string | null | undefined): string | null {
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
  if (!canonicalModelId) return null;

  const metadata = getModelMetadata(canonicalModelId);
  if (metadata?.provider) return metadata.provider;

  const detected = detectProviderFromModelId(canonicalModelId);
  if (detected) return detected;

  const lower = canonicalModelId.toLowerCase();
  if (isAutoModeModelId(lower)) return 'managed_cloud';
  if (LOCAL_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return lower.startsWith('lm') ? 'lmstudio' : 'ollama';
  }
  if (BYOK_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return lower.startsWith('nvidia') ? 'nvidia_nim' : 'open_router';
  }

  return null;
}

function providerModeFromProvider(provider: string | null): ProviderMode | null {
  if (!provider) return null;
  const normalizedProvider = normalizeProviderKey(provider);
  if (!normalizedProvider) return null;

  const surface = getProviderSurface(normalizedProvider);
  return providerSurfaceToProviderMode(surface);
}

export function getProviderModeForModel(modelId: string | null | undefined): ProviderMode | null {
  return providerModeFromProvider(inferProviderFromModelId(modelId));
}
