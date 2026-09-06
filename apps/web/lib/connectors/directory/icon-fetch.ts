import 'server-only';

import { assertResolvedPublicHostname, pinnedPublicFetch } from '@/lib/egress-policy';
import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';

const ICON_CACHE_METHOD = 'connectors.directory.icon';
const ICON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const ICON_MAX_BYTES = 262_144;
export const PAGE_HEAD_MAX_BYTES = 65_536;
export const MAX_REDIRECT_HOPS = 3;
const FETCH_STEP_TIMEOUT_MS = 5_000;
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
const FETCHABLE_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);
const LOCATION_HEADER = 'location';
const CONTENT_TYPE_HEADER = 'content-type';
const CONTENT_LENGTH_HEADER = 'content-length';
const ALLOWED_ICON_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);
const HTML_CONTENT_TYPES: ReadonlySet<string> = new Set(['text/html', 'application/xhtml+xml']);

const cacheStore = new NeonMcpResponseCacheStore();

export interface CachedIcon {
  readonly contentType: string;
  readonly base64: string;
}

export interface PageHead {
  readonly url: string;
  readonly html: string;
}

interface FetchedResource {
  readonly url: string;
  readonly response: Response;
}

function iconCacheKey(url: string) {
  return { method: ICON_CACHE_METHOD, params: url, partition: '' };
}

async function timed<T>(controller: AbortController, work: () => Promise<T>): Promise<T> {
  const timer = setTimeout(() => controller.abort(), FETCH_STEP_TIMEOUT_MS);
  try {
    return await work();
  } finally {
    clearTimeout(timer);
  }
}

function contentTypeOf(response: Response): string {
  return (
    (response.headers.get(CONTENT_TYPE_HEADER) ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  );
}

function declaredLengthOf(response: Response): number {
  return Number(response.headers.get(CONTENT_LENGTH_HEADER) ?? '0');
}

function redirectTarget(response: Response, from: string): string | null {
  if (!REDIRECT_STATUSES.has(response.status)) return null;
  const location = response.headers.get(LOCATION_HEADER);
  if (!location) return null;
  try {
    const target = new URL(location, from);
    return FETCHABLE_PROTOCOLS.has(target.protocol) ? target.href : null;
  } catch {
    return null;
  }
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function fetchWithVettedRedirects(
  url: string,
  controller: AbortController,
): Promise<FetchedResource | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    await assertResolvedPublicHostname(current);
    const response = await timed(controller, () =>
      pinnedPublicFetch(current, { signal: controller.signal, redirect: 'manual' }),
    );
    const next = redirectTarget(response, current);
    if (next === null) return { url: current, response };
    await discard(response);
    current = next;
  }
  return null;
}

async function readBodyPrefix(response: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).subarray(0, maxBytes);
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function fetchIcon(url: string): Promise<CachedIcon | null> {
  const controller = new AbortController();
  try {
    const fetched = await fetchWithVettedRedirects(url, controller);
    if (!fetched) return null;
    const { response } = fetched;
    const contentType = contentTypeOf(response);
    if (
      !response.ok ||
      !ALLOWED_ICON_CONTENT_TYPES.has(contentType) ||
      declaredLengthOf(response) > ICON_MAX_BYTES
    ) {
      await discard(response);
      return null;
    }
    const body = await timed(controller, () => readBoundedBody(response, ICON_MAX_BYTES));
    if (!body) return null;
    return { contentType, base64: body.toString('base64') };
  } catch {
    return null;
  }
}

export async function fetchPageHead(pageUrl: string): Promise<PageHead | null> {
  const controller = new AbortController();
  try {
    const fetched = await fetchWithVettedRedirects(pageUrl, controller);
    if (!fetched) return null;
    const { response, url } = fetched;
    if (!response.ok || !HTML_CONTENT_TYPES.has(contentTypeOf(response))) {
      await discard(response);
      return null;
    }
    const prefix = await timed(controller, () => readBodyPrefix(response, PAGE_HEAD_MAX_BYTES));
    if (!prefix) return null;
    return { url, html: prefix.toString('utf8') };
  } catch {
    return null;
  }
}

export async function getIconForUrl(url: string): Promise<CachedIcon | null> {
  const key = iconCacheKey(url);
  const cached = await cacheStore.get(key);
  if (cached) {
    try {
      return JSON.parse(cached.value) as CachedIcon;
    } catch {
      return null;
    }
  }

  const fetched = await fetchIcon(url);
  if (!fetched) return null;

  await cacheStore.set(key, {
    value: JSON.stringify(fetched),
    expiresAt: Date.now() + ICON_CACHE_TTL_MS,
    scope: 'public',
  });
  return fetched;
}
