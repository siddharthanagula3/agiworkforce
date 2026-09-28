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
