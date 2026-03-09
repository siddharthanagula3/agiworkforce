/**
 * Model Catalog Service
 *
 * Fetches the canonical model catalog from the web app's /api/models endpoint.
 * Caches results in localStorage with a 1-hour TTL. Falls back to the embedded
 * models.json when the fetch fails (offline mode).
 */

import { API_BASE_URL } from '../api/client';
import { getAllModels, type ModelMetadata } from '../constants/llm';

const CACHE_KEY = 'agiworkforce-model-catalog';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Shape returned by GET /api/models */
interface ModelCatalogResponse {
  models: RemoteModelEntry[];
  version: string;
  lastUpdated: string;
}

/** Single model entry from the /api/models response */
export interface RemoteModelEntry {
  id: string;
  name: string;
  provider: string;
  category: 'chat' | 'code' | 'reasoning' | 'image' | 'video' | 'other';
  contextWindow: number;
  maxOutputTokens: number | null;
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
  capabilities: {
    vision: boolean;
    tools: boolean;
    streaming: boolean;
    thinking: boolean;
    imageGen: boolean;
    videoGen: boolean;
    codeExecution: boolean;
    search: boolean;
  };
  speed: string | null;
  quality: string | null;
  bestFor: string[];
  released: string | null;
}

interface CachedCatalog {
  fetchedAt: number;
  version: string;
  models: RemoteModelEntry[];
}

function readCache(): CachedCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedCatalog;
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function writeCache(catalog: CachedCatalog): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

/**
 * Fetch the model catalog from the remote /api/models endpoint.
 * Returns cached data if still fresh. Falls back to embedded models on failure.
 */
export async function fetchModelCatalog(): Promise<{
  models: RemoteModelEntry[];
  source: 'remote' | 'cache' | 'embedded';
}> {
  // 1. Check localStorage cache
  const cached = readCache();
  if (cached) {
    return { models: cached.models, source: 'cache' };
  }

  // 2. Attempt remote fetch
  try {
    const response = await fetch(`${API_BASE_URL}/api/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as ModelCatalogResponse;

    if (!Array.isArray(data.models) || data.models.length === 0) {
      throw new Error('Empty model catalog response');
    }

    const catalog: CachedCatalog = {
      fetchedAt: Date.now(),
      version: data.version ?? '0',
      models: data.models,
    };
    writeCache(catalog);

    return { models: data.models, source: 'remote' };
  } catch (err) {
    console.warn('[ModelCatalog] Remote fetch failed, using embedded catalog:', err);
    return { models: embeddedModelsAsRemoteEntries(), source: 'embedded' };
  }
}

/**
 * Convert embedded ModelMetadata[] from constants/llm.ts into RemoteModelEntry[]
 * so consumers can use a single shape regardless of source.
 */
function embeddedModelsAsRemoteEntries(): RemoteModelEntry[] {
  return getAllModels().map((m: ModelMetadata) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    category: mapModelType(m.modelType),
    contextWindow: m.contextWindow,
    maxOutputTokens: null,
    pricing: {
      inputPerMillion: m.inputCost,
      outputPerMillion: m.outputCost,
    },
    capabilities: {
      vision: m.capabilities.vision,
      tools: m.capabilities.tools,
      streaming: m.capabilities.streaming,
      thinking: m.capabilities.thinking,
      imageGen: m.capabilities.imageGen,
      videoGen: m.capabilities.videoGen,
      codeExecution: m.capabilities.codeExecution,
      search: m.capabilities.search,
    },
    speed: m.speed,
    quality: m.quality,
    bestFor: m.bestFor,
    released: m.released ?? null,
  }));
}

function mapModelType(
  modelType: string,
): 'chat' | 'code' | 'reasoning' | 'image' | 'video' | 'other' {
  switch (modelType) {
    case 'chat':
      return 'chat';
    case 'code':
      return 'code';
    case 'reasoning':
      return 'reasoning';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    default:
      return 'other';
  }
}

/** Invalidate the cached catalog (e.g. on settings change or manual refresh). */
export function invalidateModelCatalogCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // noop
  }
}
