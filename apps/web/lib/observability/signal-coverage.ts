import { PRODUCTION_DEPENDENCIES } from '@/lib/config/dependency-readiness';

import { METRIC_NAME, type FailureKind } from './metrics';
import type { DashboardMetric } from './dashboards';
import type { SpanDomain } from './span';

/**
 * What answers for each production dependency when it breaks. Every field points
 * at something that exists elsewhere: the id is one in the dependency registry,
 * the failure kind one the failure counter accepts, the metric one an instrument
 * emits and the dashboard one in the dashboard catalogue. A dependency added
 * without an instrument fails the guard rather than going unwatched.
 */
export interface DependencySignal {
  readonly dependency: string;
  /** How a fault of this dependency is counted, or null with a stated reason. */
  readonly failureKind: FailureKind | null;
  readonly metric: DashboardMetric;
  readonly dashboardId: string;
  /** Required when failureKind is null. */
  readonly why?: string;
}

export const DEPENDENCY_SIGNALS: readonly DependencySignal[] = [
  {
    dependency: 'database',
    failureKind: 'database',
    metric: METRIC_NAME.databaseDuration,
    dashboardId: 'database-health',
  },
  {
    dependency: 'key_value',
    failureKind: 'api',
    metric: METRIC_NAME.failures,
    dashboardId: 'failures',
  },
  {
    dependency: 'identity',
    failureKind: 'api',
    metric: METRIC_NAME.httpDuration,
    dashboardId: 'security-and-identity',
  },
  {
    dependency: 'billing',
    failureKind: 'api',
    metric: METRIC_NAME.failures,
    dashboardId: 'failures',
  },
  {
    dependency: 'object_storage',
    failureKind: 'api',
    metric: METRIC_NAME.failures,
    dashboardId: 'failures',
  },
  {
    dependency: 'artifacts',
    failureKind: null,
    metric: METRIC_NAME.httpRequests,
    dashboardId: 'http-traffic',
    why: 'a static asset origin the browser fetches directly; the server never calls it, so no server-side fault class exists',
  },
  {
    dependency: 'observability',
    failureKind: null,
    metric: METRIC_NAME.configurationState,
    dashboardId: 'release-health',
    why: 'the exporter cannot report its own outage through itself; its state is the boot-time configuration gauge',
  },
  {
    dependency: 'code_execution',
    failureKind: 'tool',
    metric: METRIC_NAME.toolDuration,
    dashboardId: 'completion-truth',
  },
  {
    dependency: 'model_providers',
    failureKind: 'model',
    metric: METRIC_NAME.turns,
    dashboardId: 'turn-latency-and-cost',
  },
  {
    dependency: 'local_llm',
    failureKind: null,
    metric: METRIC_NAME.configurationState,
    dashboardId: 'release-health',
    why: 'it runs on the operator device rather than in the deployment, so the platform sees only whether it is configured',
  },
  {
    dependency: 'context_engine',
    failureKind: 'api',
    metric: METRIC_NAME.spanDuration,
    dashboardId: 'provider-and-model',
  },
  {
    dependency: 'transactional_email',
    failureKind: 'notification',
    metric: METRIC_NAME.notificationDeliveries,
    dashboardId: 'notification-delivery',
  },
];

export function dependencySignal(id: string): DependencySignal | null {
  return DEPENDENCY_SIGNALS.find((signal) => signal.dependency === id) ?? null;
}

export function unwatchedDependencies(): readonly string[] {
  return PRODUCTION_DEPENDENCIES.filter((dependency) => !dependencySignal(dependency.id)).map(
    (dependency) => dependency.id,
  );
}

/**
 * The test that proves a product call site opens each span domain, or the reason
 * nothing opens it yet. A domain with neither is a name in the vocabulary that
 * describes nothing, which is what this refuses to let grow.
 */
export interface SpanDomainEvidence {
  readonly domain: SpanDomain;
  /** Repository-relative path of the behavioural test, or null with a reason. */
  readonly provenBy: string | null;
  readonly why?: string;
}

const SPAN_COVERAGE_TEST = 'apps/web/lib/__tests__/span-domain-coverage.test.ts';
const DATABASE_SPAN_TEST = 'apps/web/lib/observability/database-span.test.ts';

export const SPAN_DOMAIN_EVIDENCE: readonly SpanDomainEvidence[] = [
  { domain: 'approval', provenBy: SPAN_COVERAGE_TEST },
  {
    domain: 'billing',
    provenBy: null,
    why: 'opened by apps/web/app/api/stripe-webhook/route.ts, which no test drives far enough to emit it',
  },
  { domain: 'database', provenBy: DATABASE_SPAN_TEST },
  {
    domain: 'external',
    provenBy: null,
    why: 'no call site opens it: the name is in the vocabulary and nothing in the product uses it',
  },
  { domain: 'http', provenBy: SPAN_COVERAGE_TEST },
  {
    domain: 'model',
    provenBy: null,
    why: 'opened by apps/web/lib/observability/provider-tracer.ts and the gateway route; no test drives a provider call through it',
  },
  {
    domain: 'queue',
    provenBy: null,
    why: 'apps/web/lib/jobs/job-drain.ts meters queue depth, wait and age but opens no span around a drained job',
  },
  { domain: 'retrieval', provenBy: SPAN_COVERAGE_TEST },
  {
    domain: 'sandbox',
    provenBy: null,
    why: 'opened by apps/web/lib/e2b/tracing.ts; no test drives a sandbox call through it',
  },
  { domain: 'task', provenBy: SPAN_COVERAGE_TEST },
  {
    domain: 'tool',
    provenBy: null,
    why: 'opened by apps/web/lib/mcp-tool-executor.ts and the gateway tool loop; no test drives either through the span',
  },
];
