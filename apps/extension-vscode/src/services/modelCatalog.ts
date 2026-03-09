/**
 * Remote model catalog — fetches from /api/models and caches in VS Code globalState.
 * Falls back to a hardcoded list if fetch fails or cache is stale.
 */

import * as vscode from 'vscode';

const CACHE_KEY = 'agiWorkforce.modelCatalog';
const CACHE_TTL_KEY = 'agiWorkforce.modelCatalogTtl';
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

/** Compact model representation for the QuickPick. */
export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  category: string;
  description: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  perplexity: 'Perplexity',
  moonshot: 'Moonshot',
  qwen: 'Qwen',
  zhipu: 'ZhipuAI',
};

function tierLabel(quality: string | null): string {
  switch (quality) {
    case 'high':
    case 'very-high':
      return 'Max tier';
    case 'medium':
      return 'Pro tier';
    default:
      return 'Economy';
  }
}

function toCatalogModel(entry: ApiModelEntry): CatalogModel {
  const providerName = PROVIDER_LABELS[entry.provider] ?? entry.provider;
  const tier = tierLabel(entry.quality);
  const bestFor = entry.bestFor.length > 0 ? entry.bestFor.join(', ') : entry.category;
  return {
    id: entry.id,
    name: entry.name,
    provider: entry.provider,
    category: entry.category,
    description: `${providerName} — ${tier} · ${bestFor}`,
  };
}

/** Auto-routing modes (always present regardless of fetch) */
const AUTO_MODES: CatalogModel[] = [
  {
    id: 'auto-balanced',
    name: 'Auto Balanced',
    provider: 'auto',
    category: 'auto',
    description: 'Smart routing — best model per task (Recommended)',
  },
  {
    id: 'auto-economy',
    name: 'Auto Economy',
    provider: 'auto',
    category: 'auto',
    description: 'Smart routing — fastest & cheapest',
  },
  {
    id: 'auto-premium',
    name: 'Auto Premium',
    provider: 'auto',
    category: 'auto',
    description: 'Smart routing — highest quality',
  },
];

/**
 * Derive the web app base URL from the configured API endpoint.
 * E.g. `https://agiworkforce.com/api/llm/v1` → `https://agiworkforce.com`
 */
function getBaseUrl(): string {
  const config = vscode.workspace.getConfiguration('agiWorkforce');
  const endpoint = config.get<string>('apiEndpoint') ?? 'https://agiworkforce.com/api/llm/v1';
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'https://agiworkforce.com';
  }
}

/**
 * Fetch the model catalog from the remote API.
 * Returns cached data if still fresh, otherwise fetches from the network.
 * Falls back to the hardcoded list on any failure.
 */
export async function fetchModelCatalog(context: vscode.ExtensionContext): Promise<CatalogModel[]> {
  // Check cache TTL
  const ttl = context.globalState.get<number>(CACHE_TTL_KEY);
  if (ttl && Date.now() < ttl) {
    const cached = context.globalState.get<CatalogModel[]>(CACHE_KEY);
    if (cached && cached.length > 0) {
      return [...AUTO_MODES, ...cached];
    }
  }

  try {
    const baseUrl = getBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(`${baseUrl}/api/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as ApiModelsResponse;

    // Filter to chat/code/reasoning models for the IDE context
    const models = data.models
      .filter((m) => ['chat', 'code', 'reasoning', 'other'].includes(m.category))
      .map(toCatalogModel);

    if (models.length > 0) {
      await context.globalState.update(CACHE_KEY, models);
      await context.globalState.update(CACHE_TTL_KEY, Date.now() + TTL_MS);
      return [...AUTO_MODES, ...models];
    }
  } catch {
    // Fetch failed — try returning stale cache
    const stale = context.globalState.get<CatalogModel[]>(CACHE_KEY);
    if (stale && stale.length > 0) {
      return [...AUTO_MODES, ...stale];
    }
  }

  // Final fallback: return auto modes + empty (hardcoded list will be used by caller)
  return AUTO_MODES;
}
