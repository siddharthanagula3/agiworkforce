import {
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
  R2_ACCESS_KEY_ID_ENV,
  R2_ACCOUNT_ID_ENV,
  R2_SECRET_ACCESS_KEY_ENV,
} from '@agiworkforce/object-storage/config';

import webSearchProviders from '@/lib/web-search/web-search-providers.json';

import type { FeatureRequirement } from './optional-features';
import type { EnvironmentSource } from './runtime-environment';

const WEB_SEARCH_KEY_ENVS: readonly string[] = (
  webSearchProviders as { providers: { apiKeyEnv: string }[] }
).providers.map((provider) => provider.apiKeyEnv);

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
    id: 'web_search',
    label: 'Web search provider',
    owner: null,
    requires: [any(...WEB_SEARCH_KEY_ENVS)],
    criticality: 'degradable',
    liveProbe: null,
    liveProbeGap: 'every query is billed, so a standing probe would be a standing charge',
    region: 'multi-region',
    dataClass: 'customer-content',
    availability: 'the vendor plan is the only commitment; the product claims none of its own',
    timeoutMs: 30_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour:
      'the search tool answers unavailable and the turn is told to answer without it',
    lifecycle: 'in-use',
    replacement:
      'providers are declared in web-search-providers.json with their host and key, so a second one is an entry',
  },
  {
    id: 'push_delivery',
    label: 'Device push delivery',
    owner: null,
    requires: [
      all('WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT'),
    ],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap:
      'the endpoint belongs to each subscriber browser or to Expo; there is nothing common to probe',
    region: 'multi-region',
    dataClass: 'customer-metadata',
    availability: 'best effort; the device vendor makes no commitment to this deployment',
    timeoutMs: 20_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour:
      'the notification stays in the in-app inbox and the email channel still sends',
    lifecycle: 'in-use',
    replacement:
      'delivery goes through one push service per channel, so a transport is a swap there',
  },
  {
    id: 'signaling',
    label: 'Device pairing service',
    owner: null,
    requires: [all('SIGNALING_HTTP_URL', 'SIGNALING_INTERNAL_SECRET')],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'reachability is only known from a pairing attempt, which mints a device session',
    region: 'multi-region',
    dataClass: 'customer-metadata',
    availability: 'a first-party service promoted on its own; it is not the web deployment',
    timeoutMs: 10_000,
    retry: 'none',
    circuitBreaker: false,
    failureBehaviour:
      'a remote or browser action is refused at admission rather than held for a device that cannot be reached',
    lifecycle: 'in-use',
    replacement: 'the pairing service is reached over one http boundary with its own secret',
  },
  {
    id: 'paired_browser',
    label: 'Paired browser',
    owner: null,
    requires: [],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'it runs on the reader device, not in the deployment, so it has no server probe',
    region: 'operator-device',
    dataClass: 'customer-content',
    availability: 'whatever the reader device and its extension offer; nothing is promised for it',
    timeoutMs: null,
    retry: 'none',
    circuitBreaker: false,
    failureBehaviour: 'a browser action is refused and says the browser was not reachable',
    lifecycle: 'in-use',
    replacement: 'the browser is driven through the device step boundary rather than a vendor api',
  },
  {
    id: 'connector_providers',
    label: 'Connector providers',
    owner: null,
    requires: [all('CONNECTOR_OAUTH_PROVIDERS_JSON')],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap:
      'each provider is a different third party reached with one reader grant; there is no common endpoint',
    region: 'multi-region',
    dataClass: 'customer-content',
    availability: 'per provider; a connector is treated as able to fail or revoke at any time',
    timeoutMs: 30_000,
    retry: 'shared-policy',
    circuitBreaker: false,
    failureBehaviour:
      'the connector tool refuses, the grant is dropped when it was revoked and the reader is told to reconnect',
    lifecycle: 'in-use',
    replacement: 'providers are entries in the connector oauth registry rather than code paths',
  },
  {
    id: 'marketing_analytics',
    label: 'Marketing analytics script',
    owner: null,
    requires: [all('NEXT_PUBLIC_GA_TRACKING_ID')],
    criticality: 'optional',
    liveProbe: null,
    liveProbeGap: 'the browser loads it directly on the public pages; the server never calls it',
    region: 'multi-region',
    dataClass: 'operational',
    availability: 'best effort; nothing a reader does waits on it',
    timeoutMs: null,
    retry: 'none',
    circuitBreaker: false,
    failureBehaviour: 'the public pages render without it and nothing signed in is affected',
    lifecycle: 'in-use',
    replacement: 'absent property id means no script; product analytics is first party in Postgres',
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

export interface DependencyCategory {
  readonly category: string;
  /** the registry ids that answer for this category, in registry spelling */
  readonly dependencies: readonly string[];
  /** required when the list is empty: why this product depends on nothing here */
  readonly absent?: string;
}

/**
 * The kinds of third party a deployment of this product can rest on. A kind
 * with nothing behind it is an answered question rather than an omission, so a
 * reader can tell "we do not use one" from "nobody wrote it down".
 */
export const DEPENDENCY_CATEGORIES: readonly DependencyCategory[] = [
  { category: 'model_providers', dependencies: ['model_providers', 'local_llm'] },
  { category: 'auth', dependencies: ['identity'] },
  { category: 'database', dependencies: ['database'] },
  { category: 'cache', dependencies: ['key_value'] },
  { category: 'storage', dependencies: ['object_storage', 'artifacts'] },
  { category: 'search', dependencies: ['web_search', 'context_engine'] },
  { category: 'vector', dependencies: ['database', 'context_engine'] },
  { category: 'billing', dependencies: ['billing'] },
  { category: 'email', dependencies: ['transactional_email'] },
  { category: 'push', dependencies: ['push_delivery'] },
  { category: 'browser', dependencies: ['paired_browser', 'signaling'] },
  { category: 'sandbox', dependencies: ['code_execution'] },
  { category: 'analytics', dependencies: ['marketing_analytics'] },
  { category: 'observability', dependencies: ['observability'] },
  { category: 'signaling', dependencies: ['signaling'] },
  { category: 'connector_providers', dependencies: ['connector_providers'] },
];

/** Category ids naming a dependency the registry does not declare. */
export function uncategorizedDependencies(): readonly string[] {
  const claimed = new Set(DEPENDENCY_CATEGORIES.flatMap((entry) => entry.dependencies));
  return PRODUCTION_DEPENDENCIES.filter((dependency) => !claimed.has(dependency.id)).map(
    (dependency) => dependency.id,
  );
}

export function unknownCategoryDependencies(): readonly string[] {
  const known = new Set(PRODUCTION_DEPENDENCIES.map((dependency) => dependency.id));
  return [
    ...new Set(
      DEPENDENCY_CATEGORIES.flatMap((entry) => entry.dependencies).filter((id) => !known.has(id)),
    ),
  ];
}
