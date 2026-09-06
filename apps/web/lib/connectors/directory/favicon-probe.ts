import 'server-only';

import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import { originOf } from '@/lib/connectors/directory/hosts';
import { fetchPageHead, getIconForUrl } from '@/lib/connectors/directory/icon-fetch';
import { discoverIconLinks } from '@/lib/connectors/directory/icon-links';
import { pendingSiteIconSource, siteIconUrlOf } from '@/lib/connectors/directory/site-icon';
import type { DirectoryIconSource, DirectoryRecord } from '@/lib/connectors/directory/types';

export { pendingSiteIconSource } from '@/lib/connectors/directory/site-icon';

const FAVICON_CANDIDATE_PATHS: readonly string[] = ['/favicon.ico', '/apple-touch-icon.png'];
const PAGE_ROOT_PATH = '/';
export const MAX_LINKED_ICON_CANDIDATES = 4;
const SITE_FAVICON_CACHE_METHOD = 'connectors.directory.site-favicon';
export const SITE_FAVICON_TTL_MS = 24 * 60 * 60 * 1_000;
const SITE_FAVICON_MISS = '';
const MONOGRAM_ICON: DirectoryIconSource = 'monogram';

const cacheStore = new NeonMcpResponseCacheStore();

function faviconCacheKey(origin: string) {
  return { method: SITE_FAVICON_CACHE_METHOD, params: origin, partition: '' };
}

async function firstServedIcon(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const icon = await getIconForUrl(candidate);
    if (icon) return candidate;
  }
  return null;
}

async function linkedIconCandidates(origin: string): Promise<string[]> {
  const head = await fetchPageHead(`${origin}${PAGE_ROOT_PATH}`);
  if (!head) return [];
  return discoverIconLinks(head.html, head.url).slice(0, MAX_LINKED_ICON_CANDIDATES);
}

async function findFavicon(origin: string): Promise<string | null> {
  const wellKnown = await firstServedIcon(
    FAVICON_CANDIDATE_PATHS.map((path) => `${origin}${path}`),
  );
  if (wellKnown) return wellKnown;
  return firstServedIcon(await linkedIconCandidates(origin));
}

export async function probeSiteFavicon(siteUrl: string): Promise<string | null> {
  const origin = originOf(siteUrl);
  if (!origin) return null;

  const key = faviconCacheKey(origin);
  const cached = await cacheStore.get(key);
  if (cached) return cached.value === SITE_FAVICON_MISS ? null : cached.value;

  const found = await findFavicon(origin);
  await cacheStore.set(key, {
    value: found ?? SITE_FAVICON_MISS,
    expiresAt: Date.now() + SITE_FAVICON_TTL_MS,
    scope: 'public',
  });
  return found;
}

export async function resolveSiteIconForRecord(record: DirectoryRecord): Promise<DirectoryRecord> {
  if (!pendingSiteIconSource(record)) return record;
  const siteUrl = siteIconUrlOf(record);
  if (!siteUrl) return { ...record, iconSource: MONOGRAM_ICON };

  const found = await probeSiteFavicon(siteUrl);
  if (found) return { ...record, iconUrl: found };
  return { ...record, iconSource: MONOGRAM_ICON };
}
