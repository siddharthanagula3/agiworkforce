import 'server-only';

import {
  getDefaultModelFor,
  getModelMetadataById,
  isModelLive,
  listManagedRoutesForModel,
  type DefaultModelKind,
} from '@agiworkforce/types';

import {
  resolveDependencyReadiness,
  type DependencyCriticality,
} from '@/lib/config/dependency-readiness';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { getConfiguredStripePriceIds } from '@/lib/price-tier-mapping';
import { listAvailableManagedProviderIds } from '@/lib/services/provider-adapter-service';
import { getProviderAvailabilityMap } from '@/lib/services/provider-availability-service';
import { readJobQueueStats } from '@/lib/jobs/job-service';
import { evaluateJobHealth } from '@/lib/server/slo/job-health';
import {
  cachedRenderInput,
  RENDER_CACHE_SECONDS,
  RENDER_CACHE_TAGS,
} from '@/lib/server/render-cache';

const DATABASE_PROBE_MIN_INTERVAL_SECONDS = 3_600;
const DATABASE_PROBE_LAST_SUCCESS_REDIS_KEY = 'agi-health-probe:database-last-success-at';
const SEARCH_INDEX_PROBE_LAST_SUCCESS_REDIS_KEY = 'agi-health-probe:search-index-last-success-at';

async function shouldSkipProbe(key: string): Promise<boolean> {
  try {
    const store = getKeyValueStore();
    if (!store) return false;
    const lastSuccessAt = await store.get<number>(key);
    if (!lastSuccessAt) return false;
    return Date.now() - lastSuccessAt < DATABASE_PROBE_MIN_INTERVAL_SECONDS * 1_000;
  } catch (error) {
    logger.error({ error, key }, 'Health probe throttle check failed');
    return false;
  }
}

async function recordProbeSuccess(key: string): Promise<void> {
  try {
    const store = getKeyValueStore();
    if (!store) return;
    await store.set(key, Date.now(), { ttlSeconds: DATABASE_PROBE_MIN_INTERVAL_SECONDS });
  } catch (error) {
    logger.error({ error, key }, 'Health probe throttle record failed');
  }
}

export interface CapabilityCheck {
  status: 'healthy' | 'unhealthy';
  message?: string;
}

export interface UnreadyDependency {
  id: string;
  criticality: DependencyCriticality;
  missing: readonly string[];
}

const DATABASE_DEPENDENCY_ID = 'database';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    stripe: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    environment: {
      status: 'healthy' | 'unhealthy';
      missingCount?: number;
      /** every dependency, optional ones included, whose configuration is absent */
      unreadyDependencies?: UnreadyDependency[];
    };
    chat: CapabilityCheck;
    work: CapabilityCheck;
    voice: CapabilityCheck;
    search: CapabilityCheck;
  };
}

const SEARCH_INDEX_TABLES = ['retrieval_documents', 'retrieval_chunks'] as const;

function unhealthy(message: string): CapabilityCheck {
  return { status: 'unhealthy', message };
}

/**
 * Configuration and degradation are read from the catalogue and the runtime's
 * own marks, so this never calls a provider and never names one.
 */
async function checkRoutedCapability(kind: DefaultModelKind): Promise<CapabilityCheck> {
  try {
    const modelId = getDefaultModelFor(null, kind);
    const model = getModelMetadataById(modelId);
    if (!model || !isModelLive(model)) return unhealthy('no live default route');

    const configured = listAvailableManagedProviderIds();
    const providers = [
      ...new Set(listManagedRoutesForModel(modelId).map((route) => route.provider)),
    ].filter((provider) => configured.has(provider));
    if (providers.length === 0) return unhealthy('no configured route');

    const availability = await getProviderAvailabilityMap(providers);
    if (providers.every((provider) => availability[provider])) {
      return unhealthy('every route degraded');
    }
    return { status: 'healthy' };
  } catch (error) {
    logger.error({ error, kind }, 'Capability health check failed');
    return unhealthy('unavailable');
  }
}

async function checkWorkQueues(): Promise<CapabilityCheck> {
  try {
    const alerts = evaluateJobHealth(await readJobQueueStats(getNeonDb()));
    const critical = alerts.filter((alert) => alert.severity === 'critical');
    if (critical.length > 0) {
      return unhealthy(`${critical.length} queue(s) not draining`);
    }
    return { status: 'healthy' };
  } catch (error) {
    logger.error({ error }, 'Work queue health check failed');
    return unhealthy('unavailable');
  }
}

async function checkSearchIndex(): Promise<CapabilityCheck> {
  try {
    const rows = await getNeonDb().query<{ missing: number }>(
      `select count(*)::int as missing
         from unnest($1::text[]) as relation
        where to_regclass('public.' || relation) is null`,
      [[...SEARCH_INDEX_TABLES]],
    );
    if ((rows[0]?.missing ?? SEARCH_INDEX_TABLES.length) > 0) {
      return unhealthy('index schema missing');
    }
    return { status: 'healthy' };
  } catch (error) {
    logger.error({ error }, 'Search index health check failed');
    return unhealthy('unavailable');
  }
}

export async function runHealthChecks(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = {
    database: { status: 'unhealthy' },
    stripe: { status: 'unhealthy' },
    environment: { status: 'unhealthy' },
    chat: { status: 'unhealthy' },
    work: { status: 'unhealthy' },
    voice: { status: 'unhealthy' },
    search: { status: 'unhealthy' },
  };

  const readiness = resolveDependencyReadiness();
  const unready = readiness
    .filter((state) => !state.ready)
    .map((state) => ({
      id: state.dependency.id,
      criticality: state.dependency.criticality,
      missing: state.missing,
    }));
  const database = readiness.find((state) => state.dependency.id === DATABASE_DEPENDENCY_ID);
  if (database?.ready !== false) {
    checks.environment.status = 'healthy';
  } else {
    checks.environment.missingCount = database.missing.length;
    logger.warn(
      { missingEnvVars: database.missing },
      'Health check: missing Neon environment variables',
    );
  }
  if (unready.length > 0) {
    checks.environment.unreadyDependencies = unready;
  }

  if (await shouldSkipProbe(DATABASE_PROBE_LAST_SUCCESS_REDIS_KEY)) {
    checks.database.status = 'healthy';
  } else {
    try {
      const db = getNeonDb();
      await db.query('select 1');
      checks.database.status = 'healthy';
      await recordProbeSuccess(DATABASE_PROBE_LAST_SUCCESS_REDIS_KEY);
    } catch (error) {
      checks.database.status = 'unhealthy';
      checks.database.message = 'unavailable';
      logger.error({ error }, 'Database health check failed');
    }
  }

  if (await shouldSkipProbe(SEARCH_INDEX_PROBE_LAST_SUCCESS_REDIS_KEY)) {
    checks.search.status = 'healthy';
  } else {
    checks.search = await checkSearchIndex();
    if (checks.search.status === 'healthy') {
      await recordProbeSuccess(SEARCH_INDEX_PROBE_LAST_SUCCESS_REDIS_KEY);
    }
  }

  try {
    const stripe = getStripeClientOrNull();

    if (stripe) {
      await stripe.products.list({ limit: 1 });

      const configuredPriceIds = getConfiguredStripePriceIds();
      const configuredPrices = await Promise.all(
        configuredPriceIds.map((priceId) => stripe.prices.retrieve(priceId)),
      );
      const unusablePriceCount = configuredPrices.filter(
        (price) => !price.active || price.type !== 'recurring' || !price.recurring,
      ).length;
      if (unusablePriceCount > 0) {
        throw new Error(
          `${unusablePriceCount} configured Stripe Price(s) are not active recurring Prices`,
        );
      }

      checks.stripe.status = 'healthy';
    } else {
      checks.stripe.message = 'unavailable';
    }
  } catch (error) {
    checks.stripe.status = 'unhealthy';
    checks.stripe.message = 'unavailable';
    logger.error({ error }, 'Stripe health check failed');
  }

  const [chat, work, voice] = await Promise.all([
    checkRoutedCapability('chat'),
    checkWorkQueues(),
    checkRoutedCapability('voice'),
  ]);
  checks.chat = chat;
  checks.work = work;
  checks.voice = voice;

  const coreHealthy =
    checks.database.status === 'healthy' && checks.environment.status === 'healthy';

  const nonCoreHealthy = [checks.stripe, chat, work, voice, checks.search].every(
    (check) => check.status === 'healthy',
  );

  const status: HealthCheckResult['status'] = !coreHealthy
    ? 'unhealthy'
    : nonCoreHealthy
      ? 'healthy'
      : 'degraded';

  return {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };
}

/**
 * The status page's copy of the checks, computed once per window for everyone.
 *
 * `runHealthChecks` opens a database connection and makes 1 + N Stripe API
 * calls (`products.list` plus one `prices.retrieve` per configured price). The
 * answer is the same for every visitor, so running it per page view turned a
 * public page into a traffic-proportional load generator against Stripe and
 * Neon: a crawler or an incident-driven refresh storm hits hardest exactly
 * when those dependencies are least able to take it.
 *
 * `timestamp` in the result is the moment the checks actually ran, and the page
 * shows it, so a cached answer never claims to be more current than it is.
 */
export const getCachedHealthChecks = cachedRenderInput(runHealthChecks, {
  keyParts: ['status-page', 'health-checks'],
  tags: [RENDER_CACHE_TAGS.statusHealth],
  revalidate: RENDER_CACHE_SECONDS.liveSignal,
});
