export const PRODUCT_LINK_TARGETS = [
  'file',
  'artifact',
  'work',
  'research',
  'schedule',
  'browser-task',
] as const;

export type ProductLinkTarget = (typeof PRODUCT_LINK_TARGETS)[number];

export const PRODUCT_LINK_PATH_PREFIX = '/open';

export const PRODUCT_LINK_UNAVAILABLE_STATES = [
  'not_found',
  'deleted',
  'expired',
  'unauthorized',
] as const;

export type ProductLinkUnavailableState = (typeof PRODUCT_LINK_UNAVAILABLE_STATES)[number];

export interface ProductLink {
  target: ProductLinkTarget;
  id: string;
}

const MAX_PRODUCT_LINK_ID_CHARS = 128;
const PRODUCT_LINK_ID_PATTERN = /^[A-Za-z0-9._:-]+$/u;

export function isProductLinkTarget(value: unknown): value is ProductLinkTarget {
  return typeof value === 'string' && (PRODUCT_LINK_TARGETS as readonly string[]).includes(value);
}

export function isProductLinkId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PRODUCT_LINK_ID_CHARS &&
    PRODUCT_LINK_ID_PATTERN.test(value)
  );
}

export function productLinkPath(target: ProductLinkTarget, id: string): string {
  return `${PRODUCT_LINK_PATH_PREFIX}/${target}/${encodeURIComponent(id)}`;
}

export function productLinkUrl(origin: string, target: ProductLinkTarget, id: string): string {
  return new URL(productLinkPath(target, id), origin).toString();
}

export function parseProductLinkPath(pathname: string): ProductLink | null {
  const path = pathname.split(/[?#]/u)[0] ?? '';
  const segments = path.split('/').filter(Boolean);
  if (segments.length !== 3 || `/${segments[0]}` !== PRODUCT_LINK_PATH_PREFIX) return null;
  const [, target, rawId] = segments;
  if (!isProductLinkTarget(target) || rawId === undefined) return null;
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  return isProductLinkId(id) ? { target, id } : null;
}
