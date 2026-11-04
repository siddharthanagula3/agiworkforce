import { evaluateSitePolicy, type SitePolicyInput } from '@agiworkforce/types';
import { ORIGIN_EXTENSION_PAGE } from '../../background/policy';

export type ScheduledSourceAuthority = 'allowed' | 'denied' | 'unavailable';

/** Only observed provenance is checked; old records are not assigned new origins. */
export function scheduledSourceAuthority(
  origins: readonly (string | undefined)[],
  policy: SitePolicyInput | null,
): ScheduledSourceAuthority {
  if (origins.some((origin) => origin !== undefined && typeof origin !== 'string')) return 'unavailable';
  const scoped = origins.filter((origin): origin is string =>
    Boolean(origin) && origin !== ORIGIN_EXTENSION_PAGE);
  if (scoped.length === 0) return 'allowed';
  if (!policy || policy.admin === 'unavailable') return 'unavailable';
  return scoped.every((origin) => evaluateSitePolicy(policy, origin, 'automation').allowed)
    ? 'allowed' : 'denied';
}
