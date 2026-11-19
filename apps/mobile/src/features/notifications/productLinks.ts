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
  { pathname: string; flag: FeatureKey | null; perItem: boolean; idParam: string | null }
> = {
  chat: { pathname: '/(app)/chat', flag: 'cloudChat', perItem: true, idParam: null },
  work: { pathname: '/(app)/tasks', flag: 'cloudTasks', perItem: false, idParam: 'runId' },
  'browser-task': {
    pathname: '/(app)/tasks',
    flag: 'cloudTasks',
    perItem: false,
    idParam: 'runId',
  },
  research: { pathname: '/(app)/reports', flag: 'research', perItem: false, idParam: null },
  schedule: { pathname: '/(app)/schedules', flag: 'schedules', perItem: false, idParam: null },
  artifact: { pathname: '/(app)/artifacts', flag: null, perItem: false, idParam: null },
  file: { pathname: '/(app)/library', flag: null, perItem: false, idParam: null },
};

const NATIVE_SETTINGS_ROUTE: ReadonlyMap<string, { pathname: string; flag: FeatureKey | null }> =
  new Map([
    ['security', { pathname: '/(app)/settings/account-security', flag: null }],
    ['account', { pathname: '/(app)/settings/account-security', flag: null }],
    ['account-deletion', { pathname: '/(app)/settings/cloud-account', flag: null }],
    ['connectors', { pathname: '/(app)/settings/cloud-connectors', flag: 'connectors' }],
    ['capabilities', { pathname: '/(app)/settings/capabilities', flag: null }],
  ]);

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
  if (destination.perItem) return `${destination.pathname}/${encodeURIComponent(link.id)}`;
  return destination.idParam
    ? `${destination.pathname}?${destination.idParam}=${encodeURIComponent(link.id)}`
    : destination.pathname;
}

export function nativeRouteForSettingsSection(section: string): string | null {
  const destination = NATIVE_SETTINGS_ROUTE.get(section);
  if (!destination) return null;
  if (destination.flag !== null && !FEATURES[destination.flag]) return null;
  return destination.pathname;
}

export function nativeRouteForCodeSession(id: string): string {
  return `/(app)/cloud-code/${encodeURIComponent(id)}`;
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
