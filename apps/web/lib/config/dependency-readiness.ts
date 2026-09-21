import {
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
  R2_ACCESS_KEY_ID_ENV,
  R2_ACCOUNT_ID_ENV,
  R2_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage/config';

import type { FeatureRequirement } from './optional-features';
import type { EnvironmentSource } from './runtime-environment';

export const PROBE_SURFACES = [
  'api/health',
  'api/cron/health-probe',
  'api/admin/service-health',
] as const;

export type ProbeSurface = (typeof PROBE_SURFACES)[number];

export type DependencyCriticality = 'core' | 'degradable' | 'optional';

/** Where the dependency serves from, which decides what residency it can honour. */
export type DependencyRegion = 'multi-region' | 'home-region' | 'operator-device';

export type DependencyDataClass = 'customer-content' | 'customer-metadata' | 'operational' | 'none';

/** How a caller tries again: the shared taxonomy, the vendor client, or not at all. */
export type DependencyRetry = 'shared-policy' | 'vendor-client' | 'none';

export type DependencyLifecycle = 'in-use' | 'deprecated';

export interface ProductionDependency {
  readonly id: string;
  readonly label: string;
  /** the workspace package that owns the adapter, or null for a web-local dependency */
  readonly owner: string | null;
  readonly requires: readonly FeatureRequirement[];
  readonly criticality: DependencyCriticality;
  /** the live probe that reports this dependency, or null when only readiness is known */
  readonly liveProbe: ProbeSurface | null;
  /** why no live probe exists; required whenever liveProbe is null */
  readonly liveProbeGap?: string;
  readonly region: DependencyRegion;
  readonly dataClass: DependencyDataClass;
  /** what uptime is promised and by whom; never a number nobody can check */
  readonly availability: string;
  /** the ceiling a call is given, or null when the caller sets its own per call */
  readonly timeoutMs: number | null;
  readonly retry: DependencyRetry;
  readonly circuitBreaker: boolean;
  /** what the product does for a reader while this dependency is down */
  readonly failureBehaviour: string;
  readonly lifecycle: DependencyLifecycle;
  /** how this would be swapped out, so the choice is not permanent */
  readonly replacement: string;
}

export interface DependencyReadiness {
  readonly dependency: ProductionDependency;
  readonly ready: boolean;
  readonly missing: readonly string[];
}

const all = (...keys: readonly string[]): FeatureRequirement => ({ kind: 'all', keys });
const any = (...keys: readonly string[]): FeatureRequirement => ({ kind: 'any', keys });

export const PRODUCTION_DEPENDENCIES: readonly ProductionDependency[] = [
  {
    id: 'database',
    label: 'Neon Postgres',
    owner: 'data-layer',
    requires: [any('DATABASE_URL', 'AGI_DATABASE_URL')],
    criticality: 'core',
    liveProbe: 'api/health',
    region: 'home-region',
    dataClass: 'customer-content',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 30_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour: 'readiness fails closed and the health endpoint reports the database check',
    lifecycle: 'in-use',
    replacement:
      'any Postgres behind the data-layer adapter; no Neon API is called from product code',
  },
  {
    id: 'key_value',
    label: 'Upstash Redis',
    owner: 'key-value',
    requires: [
      any('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL'),
      any('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN'),
    ],
    criticality: 'core',
    liveProbe: 'api/health',
    region: 'multi-region',
    dataClass: 'customer-metadata',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 5_000,
    retry: 'vendor-client',
    circuitBreaker: false,
    failureBehaviour: 'rate limiting and cached reads fail closed rather than serving unlimited',
    lifecycle: 'in-use',
    replacement: 'any Redis-compatible store behind the key-value adapter',
  },
  {
    id: 'identity',
    label: 'Clerk identity',
    owner: 'identity',
    requires: [all('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY')],
    criticality: 'core',
    liveProbe: null,
    liveProbeGap:
      'no server-side reachability probe exists; a vendor outage surfaces as failing sign-ins',
    region: 'multi-region',
    dataClass: 'customer-metadata',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 10_000,
    retry: 'vendor-client',
    circuitBreaker: false,
    failureBehaviour:
      'the proxy refuses session routes rather than authenticating without an azp binding',
    lifecycle: 'in-use',
    replacement: 'the identity provider is reached only through the identity package boundary',
  },
  {
    id: 'billing',
    label: 'Stripe billing',
    owner: null,
    requires: [all('STRIPE_SECRET_KEY')],
    criticality: 'degradable',
    liveProbe: 'api/health',
    region: 'multi-region',
    dataClass: 'customer-metadata',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 20_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour:
      'checkout and portal refuse; existing entitlements keep serving from the ledger',
    lifecycle: 'in-use',
    replacement: 'provider ids live in the billing catalogue, so a second processor is additive',
  },
  {
    id: 'object_storage',
    label: 'Object storage',
    owner: 'object-storage',
    requires: [
      any(OBJECT_STORAGE_ENDPOINT_ENV, R2_ACCOUNT_ID_ENV),
      any(OBJECT_STORAGE_ACCESS_KEY_ID_ENV, R2_ACCESS_KEY_ID_ENV),
      any(OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV, R2_SECRET_ACCESS_KEY_ENV),
    ],
    criticality: 'degradable',
    liveProbe: null,
    liveProbeGap: 'reachability is only exercised on an upload; readiness here is config presence',
    region: 'home-region',
    dataClass: 'customer-content',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 60_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour: 'uploads and downloads refuse; nothing else in a conversation is blocked',
    lifecycle: 'in-use',
    replacement: 'any S3-compatible endpoint; the adapter takes an endpoint rather than a vendor',
  },
  {
    id: 'artifacts',
    label: 'Artifact renderer origin',
    owner: 'artifacts',
    requires: [all('NEXT_PUBLIC_SANDBOX_ORIGIN')],
    criticality: 'degradable',
    liveProbe: null,
    liveProbeGap: 'the origin is a static asset host; absence degrades to a same-origin frame',
    region: 'multi-region',
    dataClass: 'customer-content',
    availability: 'served from the same platform as the app and promoted by the same deploy',
    timeoutMs: null,
    retry: 'none',
    circuitBreaker: false,
    failureBehaviour: 'artifacts render in a same-origin frame with the narrower policy',
    lifecycle: 'in-use',
    replacement: 'any static origin that serves the isolation headers the deploy verifies',
  },
  {
    id: 'observability',
    label: 'Telemetry export',
    owner: 'observability',
    requires: [all('AGI_OTEL_EXPORTER_ENDPOINT')],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'export failures are logged by the exporter; there is no readiness endpoint',
    region: 'multi-region',
    dataClass: 'operational',
    availability: 'best effort; an export failure never reaches a reader',
    timeoutMs: 10_000,
    retry: 'vendor-client',
    circuitBreaker: false,
    failureBehaviour: 'spans are dropped and the request is served; nothing waits on the exporter',
    lifecycle: 'in-use',
    replacement: 'any OTLP collector; the endpoint is the whole configuration',
  },
  {
    id: 'code_execution',
    label: 'E2B sandboxes',
    owner: null,
    requires: [all('E2B_API_KEY')],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'quota exhaustion only shows on a spawn; a probe would consume that quota',
    region: 'multi-region',
    dataClass: 'customer-content',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 120_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour: 'code execution refuses and the turn says so; the conversation continues',
    lifecycle: 'in-use',
    replacement:
      'the sandbox is reached through one runner boundary, so a second provider is additive',
  },
  {
    id: 'model_providers',
    label: 'Model providers',
    owner: null,
    requires: [any('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'AI_GATEWAY_API_KEY')],
    criticality: 'degradable',
    liveProbe: 'api/admin/service-health',
    region: 'multi-region',
    dataClass: 'customer-content',
    availability: 'per provider; routing treats every one of them as able to fail at any time',
    timeoutMs: 600_000,
    retry: 'shared-policy',
    circuitBreaker: true,
    failureBehaviour: 'routing fails over to another provider for the same model family',
    lifecycle: 'in-use',
    replacement: 'models are declared in the catalogue, so a provider is a routing entry',
  },
  {
    id: 'local_llm',
    label: 'Local model runtime',
    owner: 'local-llm',
    requires: [],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'runs on the operator device, not in the deployment, so it has no server probe',
    region: 'operator-device',
    dataClass: 'customer-content',
    availability: 'whatever the operator device offers; nothing is promised for it',
    timeoutMs: null,
    retry: 'none',
    circuitBreaker: false,
    failureBehaviour:
      'the surface offers the cloud models instead and says the local one is not there',
    lifecycle: 'in-use',
    replacement:
      'the runtime is behind the local-llm package, so a different engine is a swap there',
  },
  {
    id: 'context_engine',
    label: 'Context engine',
    owner: 'context-engine',
    requires: [],
    criticality: 'core',
    liveProbe: 'api/health',
    region: 'home-region',
    dataClass: 'customer-content',
    availability: 'in process; it is as available as the deployment itself',
    timeoutMs: null,
    retry: 'none',
    circuitBreaker: false,
    failureBehaviour: 'it throws into the turn that asked, which is answered as a failed turn',
    lifecycle: 'in-use',
    replacement: 'it is a workspace package with no vendor behind it',
  },
  {
    id: 'transactional_email',
    label: 'Resend email',
    owner: null,
    requires: [all('RESEND_API_KEY')],
    criticality: 'degradable',
    liveProbe: null,
    liveProbeGap: 'delivery failures are reported per send; there is no standing probe',
    region: 'multi-region',
    dataClass: 'customer-metadata',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 20_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour: 'the send is queued on the email queue and retried to its dead letter',
    lifecycle: 'in-use',
    replacement: 'sends go through one client module, so a second provider is a swap there',
  },
];

function isSet(env: EnvironmentSource, key: string): boolean {
  return (env[key] ?? '').trim().length > 0;
}

function missingFor(env: EnvironmentSource, requirement: FeatureRequirement): readonly string[] {
  if (requirement.kind === 'any') {
    return requirement.keys.some((key) => isSet(env, key)) ? [] : requirement.keys;
  }
  return requirement.keys.filter((key) => !isSet(env, key));
}

export function resolveDependencyReadiness(
  env: EnvironmentSource = process.env,
): readonly DependencyReadiness[] {
  return PRODUCTION_DEPENDENCIES.map((dependency) => {
    const missing = dependency.requires.flatMap((requirement) => missingFor(env, requirement));
    return { dependency, ready: missing.length === 0, missing };
  });
}

export function unreadyCoreDependencies(
  env: EnvironmentSource = process.env,
): readonly DependencyReadiness[] {
  return resolveDependencyReadiness(env).filter(
    (state) => !state.ready && state.dependency.criticality === 'core',
  );
}
