/**
 * The single answer to "are these two links the same page?".
 *
 * Three copies of this question existed and gave three answers: the tool loop
 * stripped tracking parameters but kept `www.` and the scheme, the research
 * loop kept tracking parameters, and the transcript's own reader sorted the
 * query but stripped a shorter list. The same page therefore deduplicated in a
 * chat turn and not in a research report, and a source the server counted once
 * could be counted twice by the client that numbered the citations.
 *
 * Deliberately scheme- and `www.`-insensitive: a publisher serving the same
 * article on both is one source, not two. The hash is dropped because a
 * fragment names a place inside a page, not another page.
 */
const TRACKING_PARAM_PATTERN = /^(utm_[a-z_]+|fbclid|gclid|msclkid|mc_[ce]id|ref)$/i;

export function normalizeSourceUrlKey(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, '') : parsed.pathname;
    const params = [...parsed.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAM_PATTERN.test(key))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return `${host}${path}${params ? `?${params}` : ''}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

export function sameSourceUrl(left: string, right: string): boolean {
  return normalizeSourceUrlKey(left) === normalizeSourceUrlKey(right);
}
