/**
 * @file Model Catalog API Routes
 * @security
 * - Rate limiting: 100 req/min per user for all endpoints
 * - Input validation: Model IDs are validated against the catalog
 * - No user input is reflected in error responses
 *
 * Provides a canonical model catalog API that all surfaces (desktop, web,
 * mobile, CLI, extensions) can consume. Includes provider health status
 * alongside model metadata.
 *
 * Routes:
 *   GET /api/models              — Full catalog with provider health
 *   GET /api/models/recommended  — Top recommended models per use case
 *   GET /api/models/:modelId     — Single model with provider health
 */

import { Router, type Request, type Response } from 'express';
import { createRateLimiter } from '../middleware/rateLimit';
import { checkAllProviders } from '../services/providerHealth';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Provider identifier — mirrors Provider from @agiworkforce/types/model-catalog */
type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'deepseek'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'perplexity'
  | 'moonshot'
  | 'qwen'
  | 'zhipu'
  | 'cohere';

type ModelSpeed = 'very-fast' | 'fast' | 'medium' | 'slow';
type ModelQuality = 'excellent' | 'good' | 'fair';
type ModelQualityTier = 'fast' | 'balanced' | 'best';

interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  json: boolean;
  thinking: boolean;
  computerUse: boolean;
  agentic: boolean;
  imageGen: boolean;
  videoGen: boolean;
  search: boolean;
  research: boolean;
  codeExecution: boolean;
}

interface CatalogModel {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;
  maxOutputTokens: number;
  inputCost: number;
  outputCost: number;
  capabilities: ModelCapabilities;
  speed: ModelSpeed;
  quality: ModelQuality;
  qualityTier: ModelQualityTier;
  bestFor: string[];
  status: 'active' | 'beta' | 'deprecated';
}

/** Use-case categories for recommendations. */
type UseCase = 'chat' | 'coding' | 'research' | 'creative';

// ---------------------------------------------------------------------------
// Static model catalog (hardcoded, later migrated to database)
// ---------------------------------------------------------------------------

function defaultCapabilities(overrides: Partial<ModelCapabilities> = {}): ModelCapabilities {
  return {
    streaming: true,
    tools: true,
    vision: false,
    json: true,
    thinking: false,
    computerUse: false,
    agentic: false,
    imageGen: false,
    videoGen: false,
    search: false,
    research: false,
    codeExecution: false,
    ...overrides,
  };
}

const MODEL_CATALOG: CatalogModel[] = [
  // ---- OpenAI ----
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutputTokens: 16_384,
    inputCost: 10,
    outputCost: 30,
    capabilities: defaultCapabilities({
      vision: true,
      thinking: true,
      agentic: true,
      codeExecution: true,
    }),
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['complex reasoning', 'coding', 'analysis'],
    status: 'active',
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    contextWindow: 400_000,
    maxOutputTokens: 16_384,
    inputCost: 5,
    outputCost: 15,
    capabilities: defaultCapabilities({ vision: true, thinking: true, codeExecution: true }),
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['code generation', 'refactoring', 'debugging'],
    status: 'active',
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 Nano',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCost: 0.5,
    outputCost: 1.5,
    capabilities: defaultCapabilities({ vision: true }),
    speed: 'very-fast',
    quality: 'fair',
    qualityTier: 'fast',
    bestFor: ['quick answers', 'summarization', 'translation'],
    status: 'active',
  },
  {
    id: 'o3',
    name: 'OpenAI o3',
    provider: 'openai',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    inputCost: 15,
    outputCost: 60,
    capabilities: defaultCapabilities({ vision: true, thinking: true, agentic: true }),
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['deep reasoning', 'math', 'research'],
    status: 'active',
  },

  // ---- Anthropic ----
  {
    id: 'claude-opus-4.6',
    name: 'Claude 4.6 Opus',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    inputCost: 15,
    outputCost: 75,
    capabilities: defaultCapabilities({
      vision: true,
      thinking: true,
      agentic: true,
      computerUse: true,
      codeExecution: true,
    }),
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['agentic tasks', 'complex coding', 'analysis'],
    status: 'active',
  },
  {
    id: 'claude-sonnet-4.6',
    name: 'Claude 4.6 Sonnet',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    inputCost: 3,
    outputCost: 15,
    capabilities: defaultCapabilities({
      vision: true,
      thinking: true,
      agentic: true,
      computerUse: true,
    }),
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['chat', 'coding', 'writing'],
    status: 'active',
  },
  {
    id: 'claude-haiku-4.5',
    name: 'Claude 4.5 Haiku',
    provider: 'anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCost: 0.8,
    outputCost: 4,
    capabilities: defaultCapabilities({ vision: true }),
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['quick chat', 'classification', 'extraction'],
    status: 'active',
  },

  // ---- Google ----
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro',
    provider: 'google',
    contextWindow: 2_000_000,
    maxOutputTokens: 8_192,
    inputCost: 2.5,
    outputCost: 10,
    capabilities: defaultCapabilities({ vision: true, thinking: true, search: true }),
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['long context', 'multimodal', 'research'],
    status: 'active',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    inputCost: 0.15,
    outputCost: 0.6,
    capabilities: defaultCapabilities({ vision: true }),
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['fast queries', 'summarization', 'classification'],
    status: 'active',
  },

  // ---- xAI ----
  {
    id: 'grok-4',
    name: 'Grok 4',
    provider: 'xai',
    contextWindow: 256_000,
    maxOutputTokens: 16_384,
    inputCost: 5,
    outputCost: 15,
    capabilities: defaultCapabilities({ thinking: true, agentic: true }),
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['reasoning', 'coding', 'analysis'],
    status: 'active',
  },
  {
    id: 'grok-4-fast-reasoning',
    name: 'Grok 4 Fast Reasoning',
    provider: 'xai',
    contextWindow: 2_000_000,
    maxOutputTokens: 16_384,
    inputCost: 1,
    outputCost: 4,
    capabilities: defaultCapabilities({ thinking: true }),
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['quick reasoning', 'long context'],
    status: 'active',
  },

  // ---- DeepSeek ----
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat (V3)',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCost: 0.27,
    outputCost: 1.1,
    capabilities: defaultCapabilities({ thinking: true }),
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['chat', 'coding', 'general tasks'],
    status: 'active',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCost: 0.55,
    outputCost: 2.19,
    capabilities: defaultCapabilities({ thinking: true, research: true }),
    speed: 'medium',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['deep reasoning', 'math', 'research'],
    status: 'active',
  },

  // ---- Moonshot ----
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'moonshot',
    contextWindow: 256_000,
    maxOutputTokens: 8_192,
    inputCost: 2,
    outputCost: 8,
    capabilities: defaultCapabilities({ vision: true, thinking: true }),
    speed: 'medium',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['long documents', 'multilingual', 'analysis'],
    status: 'active',
  },

  // ---- Qwen ----
  {
    id: 'qwen-max',
    name: 'Qwen Max',
    provider: 'qwen',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCost: 2,
    outputCost: 6,
    capabilities: defaultCapabilities({ thinking: true }),
    speed: 'medium',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['coding', 'math', 'multilingual'],
    status: 'active',
  },
  {
    id: 'qwen-flash',
    name: 'Qwen Flash',
    provider: 'qwen',
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    inputCost: 0,
    outputCost: 0,
    capabilities: defaultCapabilities(),
    speed: 'very-fast',
    quality: 'fair',
    qualityTier: 'fast',
    bestFor: ['free queries', 'quick answers'],
    status: 'active',
  },

  // ---- Perplexity ----
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    contextWindow: 200_000,
    maxOutputTokens: 4_096,
    inputCost: 3,
    outputCost: 15,
    capabilities: defaultCapabilities({ search: true, research: true }),
    speed: 'medium',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['web search', 'fact checking', 'research'],
    status: 'active',
  },
  {
    id: 'sonar-deep-research',
    name: 'Sonar Deep Research',
    provider: 'perplexity',
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputCost: 5,
    outputCost: 20,
    capabilities: defaultCapabilities({ thinking: true, search: true, research: true }),
    speed: 'slow',
    quality: 'excellent',
    qualityTier: 'best',
    bestFor: ['deep research', 'comprehensive analysis'],
    status: 'active',
  },

  // ---- Mistral ----
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    provider: 'mistral',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCost: 2,
    outputCost: 6,
    capabilities: defaultCapabilities({ vision: true }),
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['multilingual', 'coding', 'enterprise'],
    status: 'active',
  },

  // ---- ZhipuAI ----
  {
    id: 'glm-4.7',
    name: 'GLM-4.7',
    provider: 'zhipu',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCost: 0.5,
    outputCost: 1,
    capabilities: defaultCapabilities({ thinking: true }),
    speed: 'fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['chinese language', 'general chat'],
    status: 'active',
  },

  // ---- Groq ----
  {
    id: 'groq-llama-3.3-70b',
    name: 'Llama 3.3 70B (Groq)',
    provider: 'groq',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCost: 0.59,
    outputCost: 0.79,
    capabilities: defaultCapabilities(),
    speed: 'very-fast',
    quality: 'good',
    qualityTier: 'fast',
    bestFor: ['fast inference', 'prototyping', 'batch processing'],
    status: 'active',
  },
];

// Lookup indices
const modelById = new Map<string, CatalogModel>(MODEL_CATALOG.map((m) => [m.id, m]));

const modelsByProvider = new Map<string, CatalogModel[]>();
for (const model of MODEL_CATALOG) {
  const list = modelsByProvider.get(model.provider) ?? [];
  list.push(model);
  modelsByProvider.set(model.provider, list);
}

// ---------------------------------------------------------------------------
// Recommendation engine
// ---------------------------------------------------------------------------

/**
 * Use-case to capability/quality mapping for recommendations.
 * Each use case defines which model traits matter most.
 */
const USE_CASE_CONFIG: Record<
  UseCase,
  {
    label: string;
    filter: (m: CatalogModel) => boolean;
    sort: (a: CatalogModel, b: CatalogModel) => number;
    maxResults: number;
  }
> = {
  chat: {
    label: 'General Chat',
    filter: (m) => m.status === 'active',
    sort: (a, b) => {
      // Prefer balanced quality tier for chat, then speed
      const tierOrder: Record<string, number> = { balanced: 0, fast: 1, best: 2 };
      const tierDiff = (tierOrder[a.qualityTier] ?? 3) - (tierOrder[b.qualityTier] ?? 3);
      if (tierDiff !== 0) return tierDiff;
      const speedOrder: Record<string, number> = { 'very-fast': 0, fast: 1, medium: 2, slow: 3 };
      return (speedOrder[a.speed] ?? 4) - (speedOrder[b.speed] ?? 4);
    },
    maxResults: 5,
  },
  coding: {
    label: 'Coding & Development',
    filter: (m) =>
      m.status === 'active' &&
      (m.capabilities.codeExecution ||
        m.bestFor.some((b) => b.includes('cod') || b.includes('debug') || b.includes('refactor'))),
    sort: (a, b) => {
      const qualityOrder: Record<string, number> = { excellent: 0, good: 1, fair: 2 };
      return (qualityOrder[a.quality] ?? 3) - (qualityOrder[b.quality] ?? 3);
    },
    maxResults: 5,
  },
  research: {
    label: 'Research & Analysis',
    filter: (m) =>
      m.status === 'active' &&
      (m.capabilities.research ||
        m.capabilities.search ||
        m.capabilities.thinking ||
        m.bestFor.some(
          (b) => b.includes('research') || b.includes('analysis') || b.includes('reasoning'),
        )),
    sort: (a, b) => {
      // Prefer models with both thinking and research
      const scoreA =
        (a.capabilities.thinking ? 2 : 0) +
        (a.capabilities.research ? 2 : 0) +
        (a.capabilities.search ? 1 : 0);
      const scoreB =
        (b.capabilities.thinking ? 2 : 0) +
        (b.capabilities.research ? 2 : 0) +
        (b.capabilities.search ? 1 : 0);
      return scoreB - scoreA;
    },
    maxResults: 5,
  },
  creative: {
    label: 'Creative Writing',
    filter: (m) =>
      m.status === 'active' &&
      (m.quality === 'excellent' || m.quality === 'good') &&
      m.bestFor.some(
        (b) =>
          b.includes('writ') ||
          b.includes('chat') ||
          b.includes('creative') ||
          b.includes('multilingual'),
      ),
    sort: (a, b) => {
      const qualityOrder: Record<string, number> = { excellent: 0, good: 1, fair: 2 };
      const diff = (qualityOrder[a.quality] ?? 3) - (qualityOrder[b.quality] ?? 3);
      if (diff !== 0) return diff;
      // Prefer larger output tokens for creative writing
      return b.maxOutputTokens - a.maxOutputTokens;
    },
    maxResults: 5,
  },
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

interface ProviderHealthInfo {
  available: boolean;
  error?: string;
  checkedAt?: number;
}

interface ModelResponse extends CatalogModel {
  providerHealth: ProviderHealthInfo;
}

function enrichModelWithHealth(
  model: CatalogModel,
  healthMap: Map<string, ProviderHealthInfo>,
): ModelResponse {
  const health = healthMap.get(model.provider) ?? {
    available: true,
    checkedAt: undefined,
  };
  return { ...model, providerHealth: health };
}

async function buildHealthMap(): Promise<Map<string, ProviderHealthInfo>> {
  const healthMap = new Map<string, ProviderHealthInfo>();
  try {
    const providers = await checkAllProviders();
    for (const p of providers) {
      healthMap.set(p.provider, {
        available: p.available,
        error: p.error,
        checkedAt: p.healthCheckedAt,
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch provider health; returning models without health data');
  }
  return healthMap;
}

// ---------------------------------------------------------------------------
// Express Router
// ---------------------------------------------------------------------------

const router = Router();

/**
 * GET /api/models
 *
 * Returns the full model catalog with provider health status.
 * Optional query params:
 *   ?provider=openai    — filter by provider
 *   ?tier=fast          — filter by quality tier (fast, balanced, best)
 *   ?status=active      — filter by status (default: active only)
 *   ?planTier=pro       — filter by plan tier (pro, max) — shows models available for that subscription tier
 *
 * Plan tier mapping:
 *   - pro: economy models + pro_additions (standard tier models)
 *   - max: economy + pro_additions + flagship_additions (all models including expensive)
 *   - If planTier not provided, returns full catalog (for admins/internal use)
 */
router.get('/', createRateLimiter('default'), async (req: Request, res: Response) => {
  const providerFilter =
    typeof req.query['provider'] === 'string' ? req.query['provider'] : undefined;
  const tierFilter = typeof req.query['tier'] === 'string' ? req.query['tier'] : undefined;
  const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'] : 'active';
  const planTierFilter =
    typeof req.query['planTier'] === 'string' ? req.query['planTier'] : undefined;

  let models = MODEL_CATALOG;

  if (providerFilter) {
    models = models.filter((m) => m.provider === providerFilter);
  }
  if (tierFilter) {
    models = models.filter((m) => m.qualityTier === tierFilter);
  }
  if (statusFilter) {
    models = models.filter((m) => m.status === statusFilter);
  }

  // Plan tier filtering: pro gets standard models, max gets all
  if (planTierFilter === 'pro') {
    const allowedModelIds = new Set<string>([
      // Economy models available to all tiers
      'gemini-3.1-flash-lite',
      'glm-4.7',
      'deepseek-chat',
      'glm-4.6v',
      'glm-4.6v-flash',
      'grok-4-1-fast-reasoning',
      'grok-4-fast-reasoning',
      'claude-haiku-4.5',
      'grok-4-fast-non-reasoning',
      'qwen-flash',
      'qwen-turbo',
      'qwen-coder-flash',
      'grok-4-mini',
      'gpt-5.4-nano',
      'sonar',
      'codestral-2',
      // Pro tier additions
      'gpt-5.4',
      'gpt-5.4-codex-low',
      'gpt-5.4-codex-medium',
      'claude-sonnet-4.6',
      'claude-sonnet-4.5',
      'gemini-3.1-pro-preview',
      'qwen-max',
      'kimi-k2.5',
      'sonar-pro',
      'sonar-reasoning',
      'sonar-deep-research',
      'mistral-large-3',
      'mistral-medium-3',
    ]);
    models = models.filter((m) => allowedModelIds.has(m.id));
  } else if (planTierFilter === 'max') {
    const allowedModelIds = new Set<string>([
      // Economy models
      'gemini-3.1-flash-lite',
      'glm-4.7',
      'deepseek-chat',
      'glm-4.6v',
      'glm-4.6v-flash',
      'grok-4-1-fast-reasoning',
      'grok-4-fast-reasoning',
      'claude-haiku-4.5',
      'grok-4-fast-non-reasoning',
      'qwen-flash',
      'qwen-turbo',
      'qwen-coder-flash',
      'grok-4-mini',
      'gpt-5.4-nano',
      'sonar',
      'codestral-2',
      // Pro additions
      'gpt-5.4',
      'gpt-5.4-codex-low',
      'gpt-5.4-codex-medium',
      'claude-sonnet-4.6',
      'claude-sonnet-4.5',
      'gemini-3.1-pro-preview',
      'qwen-max',
      'kimi-k2.5',
      'sonar-pro',
      'sonar-reasoning',
      'sonar-deep-research',
      'mistral-large-3',
      'mistral-medium-3',
      // Flagship additions (Max tier only)
      'claude-opus-4.6',
      'gpt-5.4-pro',
      'o3',
      'grok-4',
      'deepseek-r1',
      'kimi-k2.5-thinking',
      'gpt-5.4-codex-xhigh',
      'gpt-5.4-codex-high',
    ]);
    models = models.filter((m) => allowedModelIds.has(m.id));
  } else if (planTierFilter && planTierFilter !== 'pro' && planTierFilter !== 'max') {
    // Invalid plan tier value
    res.status(400).json({ error: 'Invalid planTier value; must be "pro" or "max"' });
    return;
  }

  const healthMap = await buildHealthMap();
  const enriched = models.map((m) => enrichModelWithHealth(m, healthMap));

  res.json({
    models: enriched,
    total: enriched.length,
    providers: Array.from(new Set(enriched.map((m) => m.provider))),
  });
});

/**
 * GET /api/models/recommended
 *
 * Returns top recommended models for different use cases.
 * Optional query: ?useCase=coding — return only one category.
 */
router.get('/recommended', createRateLimiter('default'), async (req: Request, res: Response) => {
  const useCaseFilter = typeof req.query['useCase'] === 'string' ? req.query['useCase'] : undefined;

  const healthMap = await buildHealthMap();

  const categories = useCaseFilter
    ? { [useCaseFilter]: USE_CASE_CONFIG[useCaseFilter as UseCase] }
    : USE_CASE_CONFIG;

  const recommendations: Record<string, { label: string; models: ModelResponse[] }> = {};

  for (const [key, config] of Object.entries(categories)) {
    if (!config) continue;

    const filtered = MODEL_CATALOG.filter(config.filter);
    filtered.sort(config.sort);
    const top = filtered.slice(0, config.maxResults);

    recommendations[key] = {
      label: config.label,
      models: top.map((m) => enrichModelWithHealth(m, healthMap)),
    };
  }

  res.json({ recommendations });
});

/**
 * GET /api/models/:modelId
 *
 * Returns a single model with provider health status.
 */
router.get('/:modelId', createRateLimiter('default'), async (req: Request, res: Response) => {
  const modelId = typeof req.params['modelId'] === 'string' ? req.params['modelId'] : '';

  const model = modelById.get(modelId);
  if (!model) {
    // SECURITY: Do not reflect user input in error responses
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const healthMap = await buildHealthMap();
  const enriched = enrichModelWithHealth(model, healthMap);

  // Include sibling models from the same provider
  const siblings = (modelsByProvider.get(model.provider) ?? [])
    .filter((m) => m.id !== model.id)
    .map((m) => ({ id: m.id, name: m.name, qualityTier: m.qualityTier }));

  res.json({
    model: enriched,
    relatedModels: siblings,
  });
});

export { router as modelCatalogRouter };
