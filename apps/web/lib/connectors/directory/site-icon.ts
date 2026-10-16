import { isCodeForgeHost, originOf } from '@/lib/connectors/directory/hosts';
import type { DirectoryIconSource, DirectoryRecord } from '@/lib/connectors/directory/types';

const SITE_ICON: DirectoryIconSource = 'site';

function isVendorSiteUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    return !isCodeForgeHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function siteIconUrlOf(record: DirectoryRecord): string | null {
  return [record.websiteUrl, record.documentationUrl].find(isVendorSiteUrl) ?? null;
}

export function pendingSiteIconSource(record: DirectoryRecord): boolean {
  return record.iconSource === SITE_ICON && record.iconUrl === null;
}

export function hasResolvedSiteIcon(record: DirectoryRecord): boolean {
  return record.iconSource === SITE_ICON && record.iconUrl !== null;
}

export function carrySiteIcon(
  record: DirectoryRecord,
  previous: DirectoryRecord | undefined,
): DirectoryRecord {
  if (!previous || !pendingSiteIconSource(record) || !hasResolvedSiteIcon(previous)) return record;
  const siteUrl = siteIconUrlOf(record);
  if (!siteUrl || !previous.iconUrl || originOf(previous.iconUrl) !== originOf(siteUrl)) {
    return record;
  }
  return { ...record, iconUrl: previous.iconUrl };
}
