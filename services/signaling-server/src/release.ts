export type DeployTarget = 'fly' | 'railway' | 'local';

export interface ReleaseIdentity {
  target: DeployTarget;
  id?: string;
  version?: string;
  region?: string;
  environment?: string;
}

export type ServiceEnvironment = Record<string, string | undefined>;

export const RELEASE_ENV_VARS = {
  deploymentId: ['AGI_DEPLOYMENT_ID', 'FLY_MACHINE_ID', 'FLY_ALLOC_ID', 'RAILWAY_DEPLOYMENT_ID'],
  version: ['AGI_RELEASE_SHA', 'RAILWAY_GIT_COMMIT_SHA', 'GITHUB_SHA'],
  region: ['AGI_DEPLOY_REGION', 'FLY_REGION', 'RAILWAY_REPLICA_REGION'],
  environment: ['AGI_DEPLOY_ENV', 'RAILWAY_ENVIRONMENT_NAME', 'NODE_ENV'],
  flyMarker: ['FLY_APP_NAME', 'FLY_MACHINE_ID', 'FLY_ALLOC_ID'],
  railwayMarker: ['RAILWAY_SERVICE_ID', 'RAILWAY_DEPLOYMENT_ID', 'RAILWAY_PROJECT_ID'],
  canonicalUrl: ['SIGNALING_CANONICAL_URL', 'SIGNALING_HTTP_URL'],
} as const satisfies Record<string, readonly string[]>;

const RELEASE_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

function firstConfigured(names: readonly string[], env: ServiceEnvironment): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function deployTarget(env: ServiceEnvironment): DeployTarget {
  if (firstConfigured(RELEASE_ENV_VARS.flyMarker, env)) return 'fly';
  if (firstConfigured(RELEASE_ENV_VARS.railwayMarker, env)) return 'railway';
  return 'local';
}

/**
 * An unset value is omitted rather than reported as 'unknown': a made-up
 * deployment id groups a signal under a rollout that was never shipped.
 */
export function releaseIdentity(env: ServiceEnvironment = process.env): ReleaseIdentity {
  const identity: ReleaseIdentity = { target: deployTarget(env) };
  const id = firstConfigured(RELEASE_ENV_VARS.deploymentId, env);
  const region = firstConfigured(RELEASE_ENV_VARS.region, env);
  const environment = firstConfigured(RELEASE_ENV_VARS.environment, env);
  for (const name of RELEASE_ENV_VARS.version) {
    const value = env[name]?.trim().toLowerCase();
    if (value && RELEASE_SHA_PATTERN.test(value)) {
      identity.version = value;
      break;
    }
  }
  if (id) identity.id = id;
  if (region) identity.region = region;
  if (environment) identity.environment = environment;
  return identity;
}

/**
 * The one hostname clients and probes are allowed to use. Two deploy targets
 * exist, so an endpoint taken from whichever provider answered last points half
 * the fleet at a machine that may be scaled to zero.
 */
export function canonicalEndpoint(env: ServiceEnvironment = process.env): string | undefined {
  const value = firstConfigured(RELEASE_ENV_VARS.canonicalUrl, env);
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Every origin a synthetic check must find healthy: the canonical endpoint plus
 * each deploy target behind it, so a target that is down is caught before DNS
 * sends a client there.
 */
export function probeEndpoints(env: ServiceEnvironment = process.env): string[] {
  const endpoints: string[] = [];
  const canonical = canonicalEndpoint(env);
  if (canonical) endpoints.push(canonical);
  for (const raw of (env['SIGNALING_FAILOVER_URLS'] ?? '').split(',')) {
    const value = raw.trim();
    if (!value) continue;
    try {
      const origin = new URL(value).origin;
      if (!endpoints.includes(origin)) endpoints.push(origin);
    } catch {
      continue;
    }
  }
  return endpoints;
}

export function buildInfoMetric(identity: ReleaseIdentity): string {
  const labels: string[] = [`target="${identity.target}"`];
  if (identity.id) labels.push(`deployment_id="${identity.id}"`);
  if (identity.version) labels.push(`version="${identity.version}"`);
  if (identity.region) labels.push(`region="${identity.region}"`);
  if (identity.environment) labels.push(`environment="${identity.environment}"`);
  return `signaling_build_info{${labels.join(',')}} 1`;
}
