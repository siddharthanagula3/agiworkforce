import { isProductLinkId, parseProductLinkPath, type ProductLink } from '@agiworkforce/types';
import { isAgiWorkforceUniversalLinkHost } from '@/src/integrations/universalLinks';
import { classifyExternalLink } from '@/src/features/chat/utils/externalUrls';

export type AnswerLinkAction =
  | { readonly kind: 'web'; readonly url: string }
  | { readonly kind: 'system'; readonly url: string }
  | { readonly kind: 'route'; readonly route: string }
  | { readonly kind: 'plain' };

const SETTINGS_ROUTE = '/(app)/settings';
const OPEN_ROUTE_PREFIX = '/(app)/open';
const PATH_SUFFIX = /[?#].*$/;

function openRoute(link: ProductLink): string {
  return `${OPEN_ROUTE_PREFIX}/${link.target}/${encodeURIComponent(link.id)}`;
}

function decodedSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function routeForPath(rawPath: string): string | null {
  const path = rawPath.replace(PATH_SUFFIX, '').replace(/\/+$/, '');
  const product = parseProductLinkPath(path);
  if (product) return openRoute(product);
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 2 && segments[0] === 'chat') {
    const id = decodedSegment(segments[1]!);
    if (id !== null && isProductLinkId(id)) {
      return openRoute({ target: 'chat', id });
    }
  }
  if (segments.length === 1 && segments[0] === 'settings') return SETTINGS_ROUTE;
  return null;
}

function appPathOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return isAgiWorkforceUniversalLinkHost(parsed.hostname) ? parsed.pathname : null;
  } catch {
    return null;
  }
}

export function resolveAnswerLink(href: string): AnswerLinkAction {
  const kind = classifyExternalLink(href);
  if (kind === 'http') {
    const appPath = appPathOf(href);
    const route = appPath === null ? null : routeForPath(appPath);
    return route === null ? { kind: 'web', url: href } : { kind: 'route', route };
  }
  if (kind === 'system-intent') return { kind: 'system', url: href };
  if (href.startsWith('/') && !href.startsWith('//')) {
    const route = routeForPath(href);
    if (route !== null) return { kind: 'route', route };
  }
  return { kind: 'plain' };
}
