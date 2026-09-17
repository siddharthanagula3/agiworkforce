import {
  isProductLinkId,
  isProductLinkTarget,
  productLinkUrl,
  type ProductLink,
  type ProductLinkTarget,
} from '@agiworkforce/types';
import { API_URL } from '@/lib/constants';
import { FEATURES, type FeatureKey } from '@/lib/v1FeatureFlags';

const NATIVE_DESTINATION: Record<ProductLinkTarget, { pathname: string; flag: FeatureKey | null }> =
  {
    work: { pathname: '/(app)/tasks', flag: 'cloudTasks' },
    'browser-task': { pathname: '/(app)/tasks', flag: 'cloudTasks' },
    research: { pathname: '/(app)/reports', flag: 'research' },
    schedule: { pathname: '/(app)/schedules', flag: 'schedules' },
    artifact: { pathname: '/(app)/artifacts', flag: null },
    file: { pathname: '/(app)/library', flag: null },
  };

export function readProductLink(data: Record<string, unknown> | undefined): ProductLink | null {
  const target = data?.['target'];
  const id = data?.['targetId'];
  if (!isProductLinkTarget(target) || !isProductLinkId(id)) return null;
  return { target, id };
}

export function nativeRouteForProductLink(link: ProductLink): string | null {
  const destination = NATIVE_DESTINATION[link.target];
  if (destination.flag !== null && !FEATURES[destination.flag]) return null;
  return destination.pathname;
}

export function productLinkWebFallbackUrl(link: ProductLink): string {
  return productLinkUrl(API_URL, link.target, link.id);
}
