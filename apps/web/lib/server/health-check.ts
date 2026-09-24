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
import { getKeyValueStore } from '@/lib/server/key-value';
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
    vector: CapabilityCheck;
    cache: CapabilityCheck;
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
const FULL_TEXT_INDEX = 'public.idx_retrieval_chunks_search_vector';
const EMBEDDING_INDEX = 'public.idx_retrieval_chunks_embedding';

/**
 * One read of one constant key, and nothing else. The store is billed and rate
 * limited per command, and exhausting its quota is itself an outage, so the
 * probe that watches for that must not be a meaningful share of the budget: a
 * second command here would double the cost of watching.
 */
const CACHE_PROBE_KEY = 'health:probe';

/**
 * The public endpoint and the ten-minute pager both wait on this, so it is
 * bounded well inside their own budgets. A store that has not answered in a
 * second is not serving a request either.
 */
const CACHE_PROBE_TIMEOUT_MS = 1_000;

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

interface RetrievalChecks {
  search: CapabilityCheck;
  vector: CapabilityCheck;
}

/**
 * Full text and semantic retrieval fail apart: the tables and the `tsvector`
 * index can be present while the `vector` extension or the embedding index is
 * not, which serves keyword results and silently returns nothing for every
 * semantic query. One catalogue round trip answers for both, so naming them
 * separately costs no extra statement.
 */
async function checkRetrieval(): Promise<RetrievalChecks> {
  try {
    const rows = await getNeonDb().query<{
      missing_relations: number;
      full_text_index: boolean;
      embedding_index: boolean;
      vector_extension: boolean;
    }>(
      `select
         (select count(*)::int
            from unnest($1::text[]) as relation
           where to_regclass('public.' || relation) is null) as missing_relations,
         to_regclass($2) is not null as full_text_index,
         to_regclass($3) is not null as embedding_index,
         exists (select 1 from pg_extension where extname = 'vector') as vector_extension`,
      [[...SEARCH_INDEX_TABLES], FULL_TEXT_INDEX, EMBEDDING_INDEX],
    );
    const row = rows[0];
    if (!row) return { search: unhealthy('unavailable'), vector: unhealthy('unavailable') };

    const schemaPresent = row.missing_relations === 0;
    return {
      search: !schemaPresent
        ? unhealthy('index schema missing')
        : row.full_text_index
          ? { status: 'healthy' }
          : unhealthy('full text index missing'),
      vector: !schemaPresent
        ? unhealthy('index schema missing')
        : !row.vector_extension
          ? unhealthy('extension missing')
          : row.embedding_index
            ? { status: 'healthy' }
            : unhealthy('embedding index missing'),
    };
  } catch (error) {
    logger.error({ error }, 'Retrieval index health check failed');
    return { search: unhealthy('unavailable'), vector: unhealthy('unavailable') };
  }
}

function withProbeTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('probe timed out')), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Whether the store answers a command, which is the thing that stops being
 * true in the outage this watches for: a quota refusal accepts the connection
 * and rejects the command. A key nobody wrote reads as empty, and empty is an
 * answer, so only a throw or a stall is a fault. Nothing is configured here
 * that the caller has to undo, and nothing this catches reaches the reader: the
 * vendor's own words stay in the log line.
 */
async function checkCache(): Promise<CapabilityCheck> {
  try {
    const store = getKeyValueStore();
    // Nothing to probe: a missing store is the environment check's finding in
    // production, and a dev or CI runtime without one is not an outage.
    if (!store) return { status: 'healthy', message: 'not configured' };
    await withProbeTimeout(store.get<string>(CACHE_PROBE_KEY), CACHE_PROBE_TIMEOUT_MS);
    return { status: 'healthy' };
  } catch (error) {
    logger.error({ error }, 'Cache health check failed');
    return unhealthy('unavailable');
  }
}

/**
 * Which checks speak for a dependency once its configuration is present.
 * Configured and failing is a different state from never configured, and the
 * configuration gauge is the only place that difference is standing data. A
 * dependency several checks answer for is failing when any one of them is, so
 * half a working retrieval index never reads as a healthy context engine.
 */
export const DEPENDENCY_LIVE_CHECKS: Readonly<
  Record<string, readonly (keyof HealthCheckResult['checks'])[]>
> = {
  database: ['database'],
  key_value: ['cache'],
  billing: ['stripe'],
  context_engine: ['search', 'vector'],
  model_providers: ['chat'],
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
    const live = DEPENDENCY_LIVE_CHECKS[state.dependency.id];
    const failing = live !== undefined && live.some((name) => checks[name].status !== 'healthy');
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
    vector: { status: 'unhealthy' },
    cache: { status: 'unhealthy' },
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

  const retrieval = await checkRetrieval();
  checks.search = retrieval.search;
  checks.vector = retrieval.vector;
  checks.cache = await checkCache();

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

  // The cache sits with the database rather than with the degradable checks
  // because the product's own answer to losing it is to fail closed: rate
  // limiting and cached reads refuse rather than serve unlimited, so a turn
  // cannot be served without it. Retrieval stays degradable: a missing index
  // costs search over your own content and leaves a conversation working.
  const coreHealthy =
    checks.database.status === 'healthy' &&
    checks.environment.status === 'healthy' &&
    checks.cache.status === 'healthy';

  const nonCoreHealthy = [checks.stripe, chat, work, voice, checks.search, checks.vector].every(
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
