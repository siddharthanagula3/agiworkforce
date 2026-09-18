export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type DeploymentEnvironment = 'production' | 'preview' | 'development' | 'build' | 'test';

const BUILD_PHASE = 'phase-production-build';

// One owner for "which deployment is this". Reading NODE_ENV or VERCEL_ENV at a
// call site gets the build phase and preview deployments wrong.
export function deploymentEnvironment(env: EnvironmentSource = process.env): DeploymentEnvironment {
  if (env['NEXT_PHASE'] === BUILD_PHASE) return 'build';
  const vercelEnv = env['VERCEL_ENV'];
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';
  if (vercelEnv === 'development') return 'development';
  const nodeEnv = env['NODE_ENV'];
  if (nodeEnv === 'test') return 'test';
  if (nodeEnv === 'production') return 'production';
  return 'development';
}

export function isProductionRuntime(env: EnvironmentSource = process.env): boolean {
  return deploymentEnvironment(env) === 'production';
}

export function isDeployedRuntime(env: EnvironmentSource = process.env): boolean {
  const environment = deploymentEnvironment(env);
  return environment === 'production' || environment === 'preview';
}
