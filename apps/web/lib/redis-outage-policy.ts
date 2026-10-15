import { readUpstashCredentials } from '@agiworkforce/key-value';
import { logger } from './logger';
import { deployEnvironment } from './server/hosting';

export const REDIS_OUTAGE_POLICY_ENV = 'AGI_RATE_LIMIT_REDIS_OUTAGE_POLICY';

export type RedisOutagePolicy = 'fail-closed' | 'fail-open';

export function hasSharedStoreCredentials(): boolean {
  return readUpstashCredentials() !== null;
}

export function isRateLimitProductionRuntime(): boolean {
  if (process.env['NEXT_PHASE'] === 'phase-production-build') return false;
  const deployEnv = deployEnvironment();
  return (
    deployEnv !== 'preview' &&
    (deployEnv === 'production' || process.env['NODE_ENV'] === 'production')
  );
}

export function resolveRedisOutagePolicy(): RedisOutagePolicy {
  const configured = process.env[REDIS_OUTAGE_POLICY_ENV]?.trim().toLowerCase();
  if (configured === 'fail-closed' || configured === 'fail-open') return configured;
  if (configured) {
    logger.error(
      { [REDIS_OUTAGE_POLICY_ENV]: configured },
      'Unrecognised Redis outage policy; enforcing fail-closed',
    );
    return 'fail-closed';
  }
  return hasSharedStoreCredentials() || isRateLimitProductionRuntime()
    ? 'fail-closed'
    : 'fail-open';
}
