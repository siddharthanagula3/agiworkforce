import { decideServiceRegion } from '@agiworkforce/compliance/service-regions';
import { decideEuAccess, euBlockEnabled, isServerToServerRoute } from './eu-access';
import { CANONICAL_POLICY_ROUTES } from './legal-constants';

export const REGION_UNAVAILABLE_PATH = '/region-unavailable';

const REGION_UNAVAILABLE_MESSAGE =
  'AGI Workforce is not available in your country or region. The list of places where it is not offered is at /supported-countries.';

export const REGION_UNAVAILABLE_BODY = {
  success: false,
  error: { code: 'REGION_UNAVAILABLE', message: REGION_UNAVAILABLE_MESSAGE },
} as const;

const DEPLOY_VERIFICATION_ROUTES: ReadonlySet<string> = new Set(['/api/health', '/api/version']);

const PAGES_REACHABLE_FROM_ANYWHERE: ReadonlySet<string> = new Set([
  REGION_UNAVAILABLE_PATH,
  ...Object.values(CANONICAL_POLICY_ROUTES),
]);

export function isReachableFromAnyRegion(pathname: string): boolean {
  return (
    PAGES_REACHABLE_FROM_ANYWHERE.has(pathname) ||
    DEPLOY_VERIFICATION_ROUTES.has(pathname) ||
    isServerToServerRoute(pathname)
  );
}

export type RegionAccessDecision = { blocked: false } | { blocked: true; place: string };

export function decideRegionAccess(
  headers: Pick<Headers, 'get'>,
  env: Record<string, string | undefined>,
): RegionAccessDecision {
  const country = headers.get('x-vercel-ip-country');
  const service = decideServiceRegion(country, headers.get('x-vercel-ip-country-region'));
  if (!service.served) return { blocked: true, place: service.place };
  const eea = decideEuAccess(country, euBlockEnabled(env));
  return eea.blocked ? { blocked: true, place: eea.country } : { blocked: false };
}
