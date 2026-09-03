import type {
  DirectoryBadgeKind,
  DirectoryConnectorDetail,
  DirectoryEntry,
  DirectoryFilterGroup,
  DirectorySection,
  DirectorySourceChip,
} from '@agiworkforce/ui';

import type { DirectoryBadge, DirectoryRecord } from '@/lib/connectors/directory/types';

import {
  CONNECTORS_PATH,
  CONNECTOR_AVAILABILITY_GROUP_ID,
  CONNECTOR_AVAILABILITY_GROUP_LABEL,
  CONNECTOR_AVAILABILITY_LABELS,
  CONNECTOR_CATEGORY_GROUP_ID,
  CONNECTOR_CATEGORY_GROUP_LABEL,
  CONNECTOR_DIRECTORY_PATH,
  CONNECTOR_ICON_PATH,
  CONNECTOR_SOURCES_HEADING,
  DIRECTORY_PAGE_SIZE,
} from '../constants';

const BADGE_TO_KIND: Record<DirectoryBadge, DirectoryBadgeKind> = {
  'first-party': 'agi',
  registry: 'verified',
  community: 'community',
};

const BADGE_CHIP_ORDER: readonly DirectoryBadge[] = ['first-party', 'registry', 'community'];
const BADGE_CHIP_LABELS: Record<DirectoryBadge, string> = {
  'first-party': 'AGI',
  registry: 'Verified',
  community: 'Community',
};

const CONNECTABLE_BLOCKED = new Set(['desktop-and-cli', 'needs-setup']);

export interface ConnectorDirectoryResponse {
  entries: DirectoryRecord[];
  total: number;
  nextCursor: string | null;
}

export interface ConnectedConnectorsResponse {
  connectors: { connectorId: string }[];
}

export function connectorIconHref(record: DirectoryRecord): string | null {
  return record.iconUrl ? `${CONNECTOR_ICON_PATH}?id=${encodeURIComponent(record.id)}` : null;
}

export function toConnectorEntry(
  record: DirectoryRecord,
  connectedIds: ReadonlySet<string>,
): DirectoryEntry {
  return {
    id: record.id,
    name: record.name,
    publisher: record.publisher,
    description: record.description,
    iconUrl: connectorIconHref(record),
    monogram: record.monogram,
    badges: [BADGE_TO_KIND[record.badge]],
    sourceId: record.badge,
    installed: connectedIds.has(record.id),
    facets: {
      [CONNECTOR_AVAILABILITY_GROUP_ID]: [record.connectable],
      [CONNECTOR_CATEGORY_GROUP_ID]: record.categories,
    },
  };
}

function connectorSources(records: readonly DirectoryRecord[]): DirectorySourceChip[] {
  const present = new Set(records.map((record) => record.badge));
  return BADGE_CHIP_ORDER.filter((badge) => present.has(badge)).map((badge) => ({
    id: badge,
    label: BADGE_CHIP_LABELS[badge],
  }));
}

function connectorFilterGroups(records: readonly DirectoryRecord[]): DirectoryFilterGroup[] {
  const modes = [...new Set(records.map((record) => record.connectable))].sort();
  const categories = [...new Set(records.flatMap((record) => record.categories))].sort();
  const groups: DirectoryFilterGroup[] = [];
  if (modes.length > 1) {
    groups.push({
      id: CONNECTOR_AVAILABILITY_GROUP_ID,
      label: CONNECTOR_AVAILABILITY_GROUP_LABEL,
      options: modes.map((mode) => ({
        value: mode,
        label: CONNECTOR_AVAILABILITY_LABELS[mode] ?? mode,
      })),
    });
  }
  if (categories.length > 1) {
    groups.push({
      id: CONNECTOR_CATEGORY_GROUP_ID,
      label: CONNECTOR_CATEGORY_GROUP_LABEL,
      options: categories.map((category) => ({ value: category, label: category })),
    });
  }
  return groups;
}

export function toConnectorSection(
  records: readonly DirectoryRecord[],
  connectedIds: ReadonlySet<string>,
): DirectorySection {
  return {
    entries: records.map((record) => toConnectorEntry(record, connectedIds)),
    sourcesHeading: CONNECTOR_SOURCES_HEADING,
    sources: connectorSources(records),
    filterGroups: connectorFilterGroups(records),
    sortOptions: ['name'],
  };
}

export function toConnectorDetail(
  record: DirectoryRecord,
  connectedIds: ReadonlySet<string>,
): DirectoryConnectorDetail {
  return {
    kind: 'connector',
    id: record.id,
    name: record.name,
    summary: record.description,
    badge: BADGE_TO_KIND[record.badge],
    iconUrl: connectorIconHref(record),
    monogram: record.monogram,
    tools: record.toolNames,
    connected: connectedIds.has(record.id),
    connectable: !CONNECTABLE_BLOCKED.has(record.connectable),
    ...(record.docsUrl ? { href: record.docsUrl } : {}),
  };
}

export async function fetchConnectorRecords(): Promise<DirectoryRecord[]> {
  const response = await fetch(`${CONNECTOR_DIRECTORY_PATH}?limit=${DIRECTORY_PAGE_SIZE}`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`connector directory failed: ${response.status}`);
  const body = (await response.json()) as ConnectorDirectoryResponse;
  return body.entries ?? [];
}

export async function fetchConnectedConnectorIds(): Promise<Set<string>> {
  const response = await fetch(CONNECTORS_PATH, { cache: 'no-store' });
  if (!response.ok) return new Set();
  const body = (await response.json()) as ConnectedConnectorsResponse;
  return new Set((body.connectors ?? []).map((connector) => connector.connectorId));
}

export async function fetchConnectorRecord(id: string): Promise<DirectoryRecord | null> {
  const path = id
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const response = await fetch(`${CONNECTOR_DIRECTORY_PATH}/${path}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const body = (await response.json()) as { entry?: DirectoryRecord };
  return body.entry ?? null;
}
