import 'server-only';

import { getIconForUrl } from '@/lib/connectors/directory/icon-fetch';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

const FAVICON_CANDIDATE_PATHS: readonly string[] = ['/favicon.ico', '/apple-touch-icon.png'];

export async function probeSiteFavicon(siteUrl: string): Promise<string | null> {
  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    return null;
  }

  for (const path of FAVICON_CANDIDATE_PATHS) {
    const candidate = `${origin}${path}`;
    const icon = await getIconForUrl(candidate);
    if (icon) return candidate;
  }
  return null;
}

export function pendingSiteIconSource(record: DirectoryRecord): boolean {
  return record.iconSource === 'site' && record.iconUrl === null;
}

export async function resolveSiteIconForRecord(record: DirectoryRecord): Promise<DirectoryRecord> {
  if (!pendingSiteIconSource(record)) return record;
  const siteUrl = record.websiteUrl ?? record.documentationUrl;
  if (!siteUrl) return { ...record, iconSource: 'monogram' };

  const found = await probeSiteFavicon(siteUrl);
  if (found) return { ...record, iconUrl: found };
  return { ...record, iconSource: 'monogram' };
}
