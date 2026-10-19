import {
  isProductLinkId,
  isProductLinkTarget,
  productLinkUrl,
  type ProductLink,
  type ProductLinkTarget,
} from '@agiworkforce/types';
import { API_URL } from '@/lib/constants';
import { FEATURES, type FeatureKey } from '@/lib/v1FeatureFlags';

const NATIVE_DESTINATION: Record<
  ProductLinkTarget,
  { pathname: string; flag: FeatureKey | null; perItem: boolean }
> = {
  chat: { pathname: '/(app)/chat', flag: 'cloudChat', perItem: true },
  work: { pathname: '/(app)/tasks', flag: 'cloudTasks', perItem: false },
  'browser-task': { pathname: '/(app)/tasks', flag: 'cloudTasks', perItem: false },
  research: { pathname: '/(app)/reports', flag: 'research', perItem: false },
  schedule: { pathname: '/(app)/schedules', flag: 'schedules', perItem: false },
  artifact: { pathname: '/(app)/artifacts', flag: null, perItem: false },
  file: { pathname: '/(app)/library', flag: null, perItem: false },
};

export interface ProductLinkHistory {
  hasConversation: (id: string) => boolean;
  sync: () => Promise<void>;
}

export function readProductLink(data: Record<string, unknown> | undefined): ProductLink | null {
  const target = data?.['target'];
  const id = data?.['targetId'];
  if (!isProductLinkTarget(target) || !isProductLinkId(id)) return null;
  return { target, id };
}

export function nativeRouteForProductLink(link: ProductLink): string | null {
  const destination = NATIVE_DESTINATION[link.target];
  if (destination.flag !== null && !FEATURES[destination.flag]) return null;
  return destination.perItem
    ? `${destination.pathname}/${encodeURIComponent(link.id)}`
    : destination.pathname;
}

export async function resolveNativeProductLinkRoute(
  link: ProductLink,
  history: ProductLinkHistory,
): Promise<string | null> {
  const route = nativeRouteForProductLink(link);
  if (route === null || link.target !== 'chat') return route;
  if (history.hasConversation(link.id)) return route;
  await history.sync();
  return history.hasConversation(link.id) ? route : null;
}

export function productLinkWebFallbackUrl(link: ProductLink): string {
  return productLinkUrl(API_URL, link.target, link.id);
}
