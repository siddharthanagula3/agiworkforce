export type HostingEnvironment = Record<string, string | undefined>;

export const HOSTING_ENV_VARS = {
  releaseSha: ['AGI_RELEASE_SHA', 'VERCEL_GIT_COMMIT_SHA', 'GITHUB_SHA'],
  deployRegion: ['AGI_DEPLOY_REGION', 'VERCEL_REGION'],
  deployEnvironment: ['AGI_DEPLOY_ENV', 'VERCEL_ENV'],
  deploymentId: ['AGI_DEPLOYMENT_ID', 'VERCEL_DEPLOYMENT_ID'],
  platformMarker: ['VERCEL_DEPLOYMENT_ID', 'VERCEL_ENV', 'VERCEL'],
} as const satisfies Record<string, readonly string[]>;

const RELEASE_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

function firstConfigured(names: readonly string[], env: HostingEnvironment): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function releaseSha(env: HostingEnvironment = process.env): string | undefined {
  for (const name of HOSTING_ENV_VARS.releaseSha) {
    const value = env[name]?.trim().toLowerCase();
    if (value && RELEASE_SHA_PATTERN.test(value)) return value;
  }
  return undefined;
}

export function deployRegion(env: HostingEnvironment = process.env): string | undefined {
  return firstConfigured(HOSTING_ENV_VARS.deployRegion, env);
}

export function deployEnvironment(env: HostingEnvironment = process.env): string | undefined {
  return firstConfigured(HOSTING_ENV_VARS.deployEnvironment, env);
}

export function deploymentId(env: HostingEnvironment = process.env): string | undefined {
  return firstConfigured(HOSTING_ENV_VARS.deploymentId, env);
}

export function isPlatformHosted(env: HostingEnvironment = process.env): boolean {
  return firstConfigured(HOSTING_ENV_VARS.platformMarker, env) !== undefined;
}
