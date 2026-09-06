import { originOf } from '@/lib/connectors/directory/hosts';
import type { DirectoryIconSource, DirectoryRecord } from '@/lib/connectors/directory/types';

const SITE_ICON: DirectoryIconSource = 'site';

export function siteIconUrlOf(record: DirectoryRecord): string | null {
  return record.websiteUrl ?? record.documentationUrl;
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
