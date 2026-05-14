/**
 * Remote model catalog — fetches from /api/models and caches in MMKV.
 * Falls back to the embedded MODEL_LIST if the fetch fails or cache is fresh.
 */

import { storage } from '@/lib/mmkv';
import { API_URL } from '@/lib/constants';
import { MODEL_LIST, type ModelDef, type ModelTier } from '@/lib/models';
import { secureFetch } from './secureFetch';

const CACHE_KEY = 'model_catalog_cache';
const CACHE_TTL_KEY = 'model_catalog_ttl';
const TTL_MS = 60 * 60 * 1000; // 1 hour

/** Shape returned by GET /api/models */
interface ApiModelEntry {
  id: string;
  name: string;
  provider: string;
  category: string;
  contextWindow: number;
  maxOutputTokens: number | null;
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

interface ApiModelsResponse {
  models: ApiModelEntry[];
  version: string;
  lastUpdated: string;
}

function qualityToTier(quality: string | null): ModelTier {
  switch (quality) {
    case 'excellent':
      return 'premium';
    case 'good':
      return 'balanced';
    default:
      return 'economy';
  }
}

function toModelDef(entry: ApiModelEntry): ModelDef {
  return {
    id: entry.id,
    name: entry.name,
    provider: entry.provider,
    contextWindow: entry.contextWindow,
    maxOutput: entry.maxOutputTokens ?? 8192,
    supportsVision: entry.capabilities.vision,
    supportsThinking: entry.capabilities.thinking,
    tier: qualityToTier(entry.quality),
  };
}

/**
 * Fetch the model catalog from the web API.
 * Returns cached data if still fresh, otherwise fetches from the network.
 * Falls back to the embedded MODEL_LIST on any failure.
 */
export async function fetchModelCatalog(): Promise<ModelDef[]> {
  // Check cache first
  const ttl = storage.getNumber(CACHE_TTL_KEY);
  if (ttl && Date.now() < ttl) {
    const cached = storage.getString(CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as ModelDef[];
      } catch {
        // Invalid cache — proceed to fetch
      }
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await secureFetch(`${API_URL}/api/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as ApiModelsResponse;

    if (!data || !Array.isArray(data.models)) {
      throw new Error('Invalid models response');
    }

    // Filter to chat/code/reasoning models (skip image/video-only)
    const models = data.models
      .filter((m) => ['chat', 'code', 'reasoning', 'other'].includes(m.category))
      .map(toModelDef);

    if (models.length > 0) {
      storage.set(CACHE_KEY, JSON.stringify(models));
      storage.set(CACHE_TTL_KEY, Date.now() + TTL_MS);
      return models;
    }
  } catch {
    // Fetch failed — fall through to embedded list
  }

  return MODEL_LIST;
}
