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
  type DependencyReadiness,
} from '@/lib/config/dependency-readiness';
import {
  configurationStates,
  recordConfigurationState,
  recordFailure,
  type ConfigurationStateReport,
  type FailureKind,
} from '@/lib/observability/metrics';
import { dependencySignal } from '@/lib/observability/signal-coverage';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
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

const HEALTH_PROBE_ERROR_TYPE = 'health_probe';

export interface CapabilityCheck {
  status: 'healthy' | 'unhealthy';
  message?: string;
}

export interface UnreadyDependency {
  id: string;
  criticality: DependencyCriticality;
  missing: readonly string[];
}

/**
 * `unobserved` is the honest answer for a configured dependency no check here
 * probes: present configuration is not a reachable vendor.
 */
export type DependencyObservation = 'ok' | 'failing' | 'unconfigured' | 'unobserved';

export interface DependencyStatus {
  id: string;
  criticality: DependencyCriticality;
  observation: DependencyObservation;
  /** the failure counter a fault of this dependency lands on, or null */
  signal: FailureKind | null;
  /** the dashboard that answers for it, from the signal registry */
  dashboard: string | null;
}

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
  /**
   * One entry per PRODUCTION_DEPENDENCIES member, in registry order. Absent
   * only on a synthetic result for a run that measured nothing.
   */
  dependencies?: readonly DependencyStatus[];
  /** what the boot-time configuration checks last found, per component */
  configuration?: readonly ConfigurationStateReport[];
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

/**
 * Which check speaks for a dependency once its configuration is present.
 * Configured and failing is a different state from never configured, and the
 * configuration gauge is the only place that difference is standing data.
 */
const DEPENDENCY_LIVE_CHECK: Readonly<Record<string, keyof HealthCheckResult['checks']>> = {
  database: 'database',
  billing: 'stripe',
  context_engine: 'search',
  model_providers: 'chat',
};

/**
 * Every dependency's state, the gauge that carries it and the fault of any that
 * is configured and not answering. Which counter a fault lands on is the signal
 * registry's decision, not this file's.
 */
function observeDependencies(
  readiness: readonly DependencyReadiness[],
  checks: HealthCheckResult['checks'],
): readonly DependencyStatus[] {
  return readiness.map((state) => {
    const live = DEPENDENCY_LIVE_CHECK[state.dependency.id];
    const failing = live !== undefined && checks[live].status !== 'healthy';
    const observation: DependencyObservation = !state.ready
      ? 'unconfigured'
      : live === undefined
        ? 'unobserved'
        : failing
          ? 'failing'
          : 'ok';
    recordConfigurationState({
      component: state.dependency.id,
      state: observation === 'unconfigured' ? 'unavailable' : failing ? 'invalid' : 'ok',
    });
    const signal = dependencySignal(state.dependency.id);
    if (failing && signal?.failureKind) recordFailure(signal.failureKind, HEALTH_PROBE_ERROR_TYPE);
    return {
      id: state.dependency.id,
      criticality: state.dependency.criticality,
      observation,
      signal: signal?.failureKind ?? null,
      dashboard: signal?.dashboardId ?? null,
    };
  });
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
  const unreadyCore = unready.filter(({ criticality }) => criticality === 'core');
  if (unreadyCore.length === 0) {
    checks.environment.status = 'healthy';
  } else {
    checks.environment.missingCount = unreadyCore.length;
    logger.warn(
      { unreadyCoreDependencies: unreadyCore },
      'Health check: core dependency configuration is incomplete',
    );
  }
  if (unready.length > 0) {
    checks.environment.unreadyDependencies = unready;
  }

  try {
    await getNeonDb().query('select 1');
    checks.database.status = 'healthy';
  } catch (error) {
    checks.database.status = 'unhealthy';
    checks.database.message = 'unavailable';
    logger.error({ error }, 'Database health check failed');
  }

  checks.search = await checkSearchIndex();

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

  const dependencies = observeDependencies(readiness, checks);

  return {
    status,
    timestamp: new Date().toISOString(),
    checks,
    dependencies,
    configuration: configurationStates(),
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
