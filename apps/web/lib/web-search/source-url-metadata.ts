import 'server-only';

import {
  isRoutingRedirectUrl,
  resolveRoutingRedirectUrls,
  type RedirectResolutionOverrides,
} from './web-search-tool';

/**
 * The two message-metadata keys whose contents are hrefs a reader can follow.
 * The rest of the row is left alone: nothing else on it is a citation.
 */
export const SOURCE_URL_METADATA_KEYS = ['searchResults', 'citations'] as const;

/**
 * Bounds the two walks below. Both shapes these keys hold are two or three
 * levels deep, and the client's own save writes this metadata, so the input is
 * user-controlled and a cycle-free but very deep object must not be able to
 * exhaust the stack.
 */
const SOURCE_URL_WALK_MAX_DEPTH = 8;

function collectRoutingRedirects(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > SOURCE_URL_WALK_MAX_DEPTH) return;
  if (typeof value === 'string') {
    if (isRoutingRedirectUrl(value)) into.add(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectRoutingRedirects(entry, into, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectRoutingRedirects(entry, into, depth + 1);
  }
}

/**
 * Substitutes leaf strings and nothing else. No entry is added, removed, merged
 * or reordered, even when two redirects resolve to the same publisher page, so
 * the `[n]` markers in an answer already on a reader's screen keep counting to
 * the same entries. It is also why the stored shape does not have to be known:
 * `searchResults` is an array on one path and a `{ results, sources }` object on
 * another, and both survive this untouched apart from their hrefs.
 */
function remapRoutingRedirects(
  value: unknown,
  publisherUrlByRedirect: ReadonlyMap<string, string>,
  depth = 0,
): unknown {
  if (depth > SOURCE_URL_WALK_MAX_DEPTH) return value;
  if (typeof value === 'string') return publisherUrlByRedirect.get(value) ?? value;
  if (Array.isArray(value)) {
    return value.map((entry) => remapRoutingRedirects(entry, publisherUrlByRedirect, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        remapRoutingRedirects(entry, publisherUrlByRedirect, depth + 1),
      ]),
    );
  }
  return value;
}

/**
 * True when this metadata carries at least one routing-provider redirect under
 * a citation key.
 *
 * Synchronous and allocation-light on purpose: it is the gate every caller
 * checks before spending a read, a network call or a second write, so a turn
 * that cited publishers directly, which is most of them, costs a walk of two
 * keys and nothing else.
 */
export function metadataCitesRoutingRedirect(metadata: Record<string, unknown>): boolean {
  const found = new Set<string>();
  for (const key of SOURCE_URL_METADATA_KEYS) {
    collectRoutingRedirects(metadata[key], found);
    if (found.size > 0) return true;
  }
  return false;
}

/**
 * Rewrite the routing-provider redirects under the citation keys of one message
 * metadata object to the publisher URLs they stand in front of.
 *
 * Returns only the keys that changed, so the result can be merged into a row
 * with `||` without touching anything else on it, and null when there is
 * nothing to do: no redirect was cited, or none of them resolved. A redirect
 * that could not be resolved keeps the URL it arrived with, because that link
 * is dead only once it expires while an invented or emptied href is dead
 * immediately.
 */
export async function resolveSourceUrlMetadataRedirects(
  metadata: Record<string, unknown>,
  overrides: RedirectResolutionOverrides = {},
): Promise<Record<string, unknown> | null> {
  const storedRedirects = new Set<string>();
  for (const key of SOURCE_URL_METADATA_KEYS) {
    collectRoutingRedirects(metadata[key], storedRedirects);
  }
  if (storedRedirects.size === 0) return null;

  const redirects = [...storedRedirects];
  const resolved = await resolveRoutingRedirectUrls(
    redirects.map((url) => ({ url })),
    overrides,
  );
  const publisherUrlByRedirect = new Map<string, string>();
  redirects.forEach((redirect, index) => {
    const publisherUrl = resolved[index]?.url;
    if (publisherUrl && publisherUrl !== redirect) {
      publisherUrlByRedirect.set(redirect, publisherUrl);
    }
  });
  if (publisherUrlByRedirect.size === 0) return null;

  const patch: Record<string, unknown> = {};
  for (const key of SOURCE_URL_METADATA_KEYS) {
    if (metadata[key] !== undefined) {
      patch[key] = remapRoutingRedirects(metadata[key], publisherUrlByRedirect);
    }
  }
  return patch;
}
