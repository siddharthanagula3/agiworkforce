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
    liveProbe: null,
    liveProbeGap:
      'the health probe writes its own failure streak to Redis, so a Redis outage is visible ' +
      'in that route but is not reported as a named check by api/health',
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
  },
  {
    id: 'billing',
    label: 'Stripe billing',
    owner: null,
    requires: [all('STRIPE_SECRET_KEY')],
    criticality: 'degradable',
    liveProbe: 'api/health',
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
  },
  {
    id: 'artifacts',
    label: 'Artifact renderer origin',
    owner: 'artifacts',
    requires: [all('NEXT_PUBLIC_SANDBOX_ORIGIN')],
    criticality: 'degradable',
    liveProbe: null,
    liveProbeGap: 'the origin is a static asset host; absence degrades to a same-origin frame',
  },
  {
    id: 'observability',
    label: 'Telemetry export',
    owner: 'observability',
    requires: [all('AGI_OTEL_EXPORTER_ENDPOINT')],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'export failures are logged by the exporter; there is no readiness endpoint',
  },
  {
    id: 'code_execution',
    label: 'E2B sandboxes',
    owner: null,
    requires: [all('E2B_API_KEY')],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'quota exhaustion only shows on a spawn; a probe would consume that quota',
  },
  {
    id: 'model_providers',
    label: 'Model providers',
    owner: null,
    requires: [any('OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'AI_GATEWAY_API_KEY')],
    criticality: 'degradable',
    liveProbe: 'api/admin/service-health',
  },
  {
    id: 'local_llm',
    label: 'Local model runtime',
    owner: 'local-llm',
    requires: [],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'runs on the operator device, not in the deployment, so it has no server probe',
  },
  {
    id: 'transactional_email',
    label: 'Resend email',
    owner: null,
    requires: [all('RESEND_API_KEY')],
    criticality: 'degradable',
    liveProbe: null,
    liveProbeGap: 'delivery failures are reported per send; there is no standing probe',
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
