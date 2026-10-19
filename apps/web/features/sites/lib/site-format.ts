import type { PublishedSite, SiteVisibility } from '../services/sites-service';

export const SITE_VISIBILITY_LABELS: Record<SiteVisibility, string> = {
  public: 'Public',
  organization: 'Organization',
  invited: 'Invited people',
};

export const SITE_VISIBILITY_DESCRIPTIONS: Record<SiteVisibility, string> = {
  public: 'Anyone with the link can open it.',
  organization: 'Only signed-in members of your workspace can open it.',
  invited: 'Only the people you add below can open it, after signing in with that email.',
};

export function siteName(site: Pick<PublishedSite, 'title'>): string {
  return site.title.trim() || 'Untitled site';
}

export function displaySiteUrl(shareUrl: string): string {
  return shareUrl.replace(/^https?:\/\//, '');
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function formatRelativeTime(value: string, now: number = Date.now()): string | null {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  const seconds = Math.round((time - now) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function formatSiteUpdated(value: string, now: number = Date.now()): string {
  const relative = formatRelativeTime(value, now);
  return relative ? `Updated ${relative}` : 'Update time unavailable';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sortSitesByUpdated(sites: readonly PublishedSite[]): PublishedSite[] {
  return [...sites].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}
