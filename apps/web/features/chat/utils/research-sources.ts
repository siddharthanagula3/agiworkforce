const WWW_PREFIX_PATTERN = /^www\./;
const FAVICON_SERVICE_ORIGIN = 'https://www.google.com/s2/favicons';
const FAVICON_SERVICE_SIZE = 32;

const SOURCE_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

export function formatSourceDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, SOURCE_DATE_FORMAT);
}

export function sourceDisplayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX_PATTERN, '');
  } catch {
    return url;
  }
}

/**
 * A source arrives with a favicon only when the provider supplied one. The
 * shared favicon service resolves the rest from the hostname, so a row never
 * renders a bare bullet where every sibling has a mark.
 */
export function sourceFaviconUrl(url: string, favicon?: string): string | undefined {
  if (favicon) return favicon;
  try {
    const { hostname } = new URL(url);
    return `${FAVICON_SERVICE_ORIGIN}?domain=${hostname}&sz=${FAVICON_SERVICE_SIZE}`;
  } catch {
    return undefined;
  }
}
