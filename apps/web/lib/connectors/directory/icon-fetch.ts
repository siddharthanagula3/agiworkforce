import 'server-only';

import { assertResolvedPublicHostname, pinnedPublicFetch } from '@/lib/egress-policy';
import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';

const ICON_CACHE_METHOD = 'connectors.directory.icon';
const ICON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const ICON_MAX_BYTES = 65_536;
const ICON_FETCH_TIMEOUT_MS = 5_000;
const ALLOWED_ICON_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

const cacheStore = new NeonMcpResponseCacheStore();

export interface CachedIcon {
  readonly contentType: string;
  readonly base64: string;
}

function iconCacheKey(url: string) {
  return { method: ICON_CACHE_METHOD, params: url, partition: '' };
}

async function readBoundedBody(response: Response): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > ICON_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function fetchIcon(url: string): Promise<CachedIcon | null> {
  try {
    await assertResolvedPublicHostname(url);
  } catch {
    return null;
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
    const response = await pinnedPublicFetch(url, { signal: controller.signal });
    if (!response.ok) return null;

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!ALLOWED_ICON_CONTENT_TYPES.has(contentType)) return null;

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > ICON_MAX_BYTES) return null;

    const body = await readBoundedBody(response);
    if (!body) return null;

    return { contentType, base64: body.toString('base64') };
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
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
