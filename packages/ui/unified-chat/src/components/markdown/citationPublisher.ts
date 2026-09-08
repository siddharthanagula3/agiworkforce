/**
 * @file Which domain a citation belongs to, when its URL belongs to a router.
 *
 * A grounded search result does not arrive with the publisher's URL. Google's
 * grounding chunks hand back
 * `https://vertexaisearch.cloud.google.com/grounding-api-redirect/...`, and the
 * publisher's domain is in the chunk's title instead. Every consumer derived
 * the displayed host and the favicon from the URL, so a research answer showed
 * `vertexaisearch.cloud.google.com` under four different sources and rendered
 * Google's favicon for all of them. Observed live on 2026-09-08: the cards
 * correctly NAMED anthropic.com, claude.com and youtube.com while showing
 * Google as the host of each.
 *
 * Two problems at once, on a product sold on provider neutrality: the citation
 * advertises the routing vendor, and every source looks like it came from the
 * same place.
 *
 * This is the display half. The href is still the redirect, so a saved
 * conversation still accumulates dead citations once those redirects expire.
 * Fixing that means resolving the redirect to its target when the result is
 * ingested server-side, which is a network call and does not belong in a
 * streaming translation path.
 */

/**
 * Hosts that stand in front of a publisher rather than being one.
 *
 * Deliberately exact hostnames, not a suffix match: `grounding.example.com`
 * must not be treated as a router because a substring matched, and a publisher
 * whose own domain contains a vendor's name must keep its identity.
 */
const ROUTING_REDIRECT_HOSTS: ReadonlySet<string> = new Set([
  'vertexaisearch.cloud.google.com',
  'grounding-api-redirect.googleapis.com',
]);

/** A bare registrable domain, which is the shape a grounded title carries. */
const BARE_DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isRoutingRedirectUrl(url: string): boolean {
  const host = hostOf(url);
  return host !== null && ROUTING_REDIRECT_HOSTS.has(host);
}

/**
 * The domain to show, and to draw a favicon for.
 *
 * The URL's own host wherever it is a publisher. Where it is a router, the
 * title, but only when the title is shaped like a domain: a grounded result
 * whose title is prose is not a hostname, and printing prose where a host
 * belongs is a different wrong answer to the same question.
 *
 * @returns the domain, or null when neither source yields one.
 */
export function citationPublisherDomain(citation: {
  url: string;
  title?: string;
  siteName?: string;
}): string | null {
  const host = hostOf(citation.url);
  if (host !== null && !ROUTING_REDIRECT_HOSTS.has(host)) return host;

  for (const candidate of [citation.siteName, citation.title]) {
    const trimmed = candidate
      ?.trim()
      .toLowerCase()
      .replace(/^www\./, '');
    if (trimmed && BARE_DOMAIN_PATTERN.test(trimmed)) return trimmed;
  }
  return host;
}
