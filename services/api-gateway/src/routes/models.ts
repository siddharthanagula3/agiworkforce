/**
 * @file Model Catalog API Routes
 *
 * The API gateway serves the shared catalog from `@agiworkforce/types`.
 * Do not duplicate provider/model tables here; stale local copies have caused
 * deprecated or nonexistent IDs to leak into public API responses.
 */

import { Router, type Request, type Response } from 'express';
import {
  getAllowedModelsForTier,
  getModelMetadataById,
  getModels,
  normalizeSubscriptionAccessTier,
  type ModelMetadata,
  type ModelQualityTier,
  type ModelStatus,
  type Provider,
  type SubscriptionAccessTier,
} from '@agiworkforce/types';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { checkAllProviders } from '../services/providerHealth';

type UseCase = 'chat' | 'coding' | 'research' | 'creative';

interface ProviderHealthInfo {
  available: boolean;
  error?: string;
  checkedAt?: number;
}

type CatalogModel = ModelMetadata & {
  status: ModelStatus;
};

interface ModelResponse extends CatalogModel {
  providerHealth: ProviderHealthInfo;
}

function statusFor(model: ModelMetadata): ModelStatus {
  if (model.deprecated) return 'deprecated';
  return model.status ?? 'active';
}

function isActiveModel(model: ModelMetadata): boolean {
  return statusFor(model) !== 'deprecated';
}

function toCatalogModel(model: ModelMetadata): CatalogModel {
  return {
    ...model,
    status: statusFor(model),
  };
}

function getActiveCatalogModels(): CatalogModel[] {
  return getModels({ includeDeprecated: false }).filter(isActiveModel).map(toCatalogModel);
}

// Canonical subscription tiers + documented legacy aliases. `pro_plus` was
// removed and has no successor; it is intentionally NOT accepted here. Every
// value normalizes to a SubscriptionAccessTier via the shared catalog so the
// gateway never keeps its own tier ladder.
const KNOWN_PLAN_TIERS: ReadonlySet<string> = new Set([
  'free',
  'basic',
  'hobby',
  'pro',
  'team',
  'max',
  'max_15x',
  'max-15x',
  'max15x',
  'enterprise',
]);

function parsePlanTier(raw: unknown): SubscriptionAccessTier | undefined | null {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !KNOWN_PLAN_TIERS.has(raw.toLowerCase())) return null;
  return normalizeSubscriptionAccessTier(raw);
}

function allowedIdsForPlanTier(planTier: SubscriptionAccessTier): Set<string> {
  // Ladder derived from the canonical catalog tiers (matches
  // getMinimumRequiredTier): economy is the base; pro-and-up add pro_additions;
  // max-and-up add flagship_additions. Basic/Free = economy only.
  const ids = new Set<string>(getAllowedModelsForTier('economy'));

  if (planTier === 'pro' || planTier === 'max' || planTier === 'enterprise') {
    for (const id of getAllowedModelsForTier('pro_additions')) ids.add(id);
  }

  if (planTier === 'max' || planTier === 'enterprise') {
    for (const id of getAllowedModelsForTier('flagship_additions')) ids.add(id);
  }

  return ids;
}

function matchesStatus(model: CatalogModel, statusFilter: string): boolean {
  if (statusFilter === 'active') return model.status === 'active' || model.status === 'beta';
  if (statusFilter === 'beta' || statusFilter === 'deprecated')
    return model.status === statusFilter;
  return true;
}

function speedRank(speed: ModelMetadata['speed']): number {
  const order: Record<ModelMetadata['speed'], number> = {
    'very-fast': 0,
    fast: 1,
    medium: 2,
    slow: 3,
  };
  return order[speed] ?? 4;
}

function qualityRank(quality: ModelMetadata['quality']): number {
  const order: Record<ModelMetadata['quality'], number> = {
    excellent: 0,
    good: 1,
    fair: 2,
  };
  return order[quality] ?? 3;
}

function tierRank(tier: ModelQualityTier): number {
  const order: Record<ModelQualityTier, number> = {
    balanced: 0,
    fast: 1,
    best: 2,
  };
  return order[tier] ?? 3;
}

const USE_CASE_CONFIG: Record<
  UseCase,
  {
    label: string;
    filter: (model: CatalogModel) => boolean;
    sort: (a: CatalogModel, b: CatalogModel) => number;
    maxResults: number;
  }
> = {
  chat: {
    label: 'General Chat',
    filter: (model) => model.status === 'active',
    sort: (a, b) => {
      const tierDiff = tierRank(a.qualityTier) - tierRank(b.qualityTier);
      if (tierDiff !== 0) return tierDiff;
      return speedRank(a.speed) - speedRank(b.speed);
    },
    maxResults: 5,
  },
  coding: {
    label: 'Coding & Development',
    filter: (model) =>
      model.status === 'active' &&
      (model.capabilities.codeExecution ||
        model.modelType === 'code' ||
        model.bestFor.some((item) => /cod|debug|refactor/i.test(item))),
    sort: (a, b) => qualityRank(a.quality) - qualityRank(b.quality),
    maxResults: 5,
  },
  research: {
    label: 'Research & Analysis',
    filter: (model) =>
      model.status === 'active' &&
      (model.capabilities.research ||
        model.capabilities.search ||
        model.capabilities.thinking ||
        model.bestFor.some((item) => /research|analysis|reasoning/i.test(item))),
    sort: (a, b) => {
      const score = (model: CatalogModel) =>
        (model.capabilities.thinking ? 2 : 0) +
        (model.capabilities.research ? 2 : 0) +
        (model.capabilities.search ? 1 : 0);
      return score(b) - score(a);
    },
    maxResults: 5,
  },
  creative: {
    label: 'Creative Writing',
    filter: (model) =>
      model.status === 'active' &&
      (model.quality === 'excellent' || model.quality === 'good') &&
      model.bestFor.some((item) => /writ|chat|creative|multilingual/i.test(item)),
    sort: (a, b) => {
      const qualityDiff = qualityRank(a.quality) - qualityRank(b.quality);
      if (qualityDiff !== 0) return qualityDiff;
      return (b.maxOutputTokens ?? 0) - (a.maxOutputTokens ?? 0);
    },
    maxResults: 5,
  },
};

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
    for (const provider of providers) {
      healthMap.set(provider.provider, {
        available: provider.available,
        error: provider.error,
        checkedAt: provider.healthCheckedAt,
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch provider health; returning models without health data');
  }
  return healthMap;
}

const router = Router();

// Router-level floor: every route below already declares its own, stricter
// limiter, so no current limit changes. It exists so a route ADDED here later
// cannot ship unlimited by omission — an absence no diff review would catch.
// A DISTINCT limiter instance, never the same one a route uses: express-rate-
// limit keeps one store per instance, so reusing an instance would count each
// request twice against a single counter.
router.use(createRateLimiter('default'));

router.get('/', createRateLimiter('default'), async (req: Request, res: Response) => {
  const providerFilter =
    typeof req.query['provider'] === 'string' ? (req.query['provider'] as Provider) : undefined;
  const tierFilter =
    typeof req.query['tier'] === 'string' ? (req.query['tier'] as ModelQualityTier) : undefined;
  const statusFilter = typeof req.query['status'] === 'string' ? req.query['status'] : 'active';
  const planTierFilter = parsePlanTier(req.query['planTier']);

  if (planTierFilter === null) {
    res.status(400).json({
      error:
        'Invalid planTier value; must be a known plan tier (free, basic, pro, max, max_15x, team, enterprise)',
    });
    return;
  }

  let models = getActiveCatalogModels();

  if (providerFilter) {
    models = models.filter((model) => model.provider === providerFilter);
  }
  if (tierFilter) {
    models = models.filter((model) => model.qualityTier === tierFilter);
  }
  if (statusFilter) {
    models = models.filter((model) => matchesStatus(model, statusFilter));
  }
  if (planTierFilter) {
    const allowed = allowedIdsForPlanTier(planTierFilter);
    models = models.filter((model) => allowed.has(model.id));
  }

  const healthMap = await buildHealthMap();
  const enriched = models.map((model) => enrichModelWithHealth(model, healthMap));

  res.json({
    models: enriched,
    total: enriched.length,
    providers: Array.from(new Set(enriched.map((model) => model.provider))),
  });
});

router.get('/recommended', createRateLimiter('default'), async (req: Request, res: Response) => {
  const useCaseFilter = typeof req.query['useCase'] === 'string' ? req.query['useCase'] : undefined;
  const healthMap = await buildHealthMap();
  const models = getActiveCatalogModels();

  const categories = useCaseFilter
    ? { [useCaseFilter]: USE_CASE_CONFIG[useCaseFilter as UseCase] }
    : USE_CASE_CONFIG;

  const recommendations: Record<string, { label: string; models: ModelResponse[] }> = {};

  for (const [key, config] of Object.entries(categories)) {
    if (!config) continue;
    const top = models.filter(config.filter).sort(config.sort).slice(0, config.maxResults);
    recommendations[key] = {
      label: config.label,
      models: top.map((model) => enrichModelWithHealth(model, healthMap)),
    };
  }

  res.json({ recommendations });
});

router.get('/:modelId', createRateLimiter('default'), async (req: Request, res: Response) => {
  const modelId = typeof req.params['modelId'] === 'string' ? req.params['modelId'] : '';
  const metadata = getModelMetadataById(modelId);

  if (!metadata || !isActiveModel(metadata)) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const model = toCatalogModel(metadata);
  const healthMap = await buildHealthMap();
  const enriched = enrichModelWithHealth(model, healthMap);
  const siblings = getActiveCatalogModels()
    .filter((candidate) => candidate.provider === model.provider && candidate.id !== model.id)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      qualityTier: candidate.qualityTier,
    }));

  res.json({
    model: enriched,
    relatedModels: siblings,
  });
});

export { router as modelCatalogRouter };
