import {
  isUnverifiedCustomConnector,
  DIRECTORY_SOURCE_ALL_ID,
  DIRECTORY_SOURCE_ALL_LABEL,
  type ConnectedConnector,
  type DirectoryBadgeKind,
  type DirectoryConnectorDetail,
  type DirectoryEntry,
  type DirectoryFilterGroup,
  type DirectorySection,
  type DirectorySourceChip,
  type SettingsConnector,
} from '@agiworkforce/ui';

import firstPartyTargets from '@/lib/connectors/directory/sources/first-party.json';
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
  CONNECTOR_REAUTHORIZATION_COPY,
  DIRECTORY_PAGE_SIZE,
} from '../constants';

const BADGE_TO_KIND: Record<DirectoryBadge, DirectoryBadgeKind> = {
  'first-party': 'verified',
  registry: 'community',
  community: 'community',
};

const CURATED_BADGE: DirectoryBadgeKind = 'verified';
const SELF_ADDED_BADGE: DirectoryBadgeKind = 'yours';

function curatedBadge(connector: SettingsConnector): DirectoryBadgeKind {
  return isUnverifiedCustomConnector(connector) ? SELF_ADDED_BADGE : CURATED_BADGE;
}

interface FirstPartyDirectoryTarget {
  readonly connectorId: string;
  readonly name: string;
  readonly url: string;
  readonly toolNames: readonly string[];
  readonly documentationUrl: string;
}

const FIRST_PARTY_TARGETS_BY_ID: ReadonlyMap<string, FirstPartyDirectoryTarget> = new Map(
  (firstPartyTargets as readonly FirstPartyDirectoryTarget[]).map((target) => [
    target.connectorId,
    target,
  ]),
);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const BADGE_CHIP_ORDER: readonly DirectoryBadge[] = ['first-party', 'registry', 'community'];
const BADGE_CHIP_LABELS: Record<DirectoryBadge, string> = {
  'first-party': 'Built by AGI',
  registry: 'Verified',
  community: 'Community',
};

const CONNECTABLE_BLOCKED = new Set(['desktop-and-cli', 'needs-setup']);
const FIRST_PARTY_BADGE: DirectoryBadge = 'first-party';
const CONNECTABLE_MODE = 'connect';
const NEEDS_SETUP_MODE = 'needs-setup';

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
    installable: !CONNECTABLE_BLOCKED.has(record.connectable),
    facets: {
      [CONNECTOR_AVAILABILITY_GROUP_ID]: [record.connectable],
      [CONNECTOR_CATEGORY_GROUP_ID]: record.categories,
    },
  };
}

function connectorSources(
  records: readonly DirectoryRecord[],
  hasCurated: boolean,
): DirectorySourceChip[] {
  const present = new Set<DirectoryBadge>(records.map((record) => record.badge));
  if (hasCurated) present.add(FIRST_PARTY_BADGE);
  const badgeChips = BADGE_CHIP_ORDER.filter((badge) => present.has(badge)).map((badge) => ({
    id: badge,
    label: BADGE_CHIP_LABELS[badge],
  }));
  if (badgeChips.length === 0) return badgeChips;
  return [{ id: DIRECTORY_SOURCE_ALL_ID, label: DIRECTORY_SOURCE_ALL_LABEL }, ...badgeChips];
}

function connectorFilterGroups(
  records: readonly DirectoryRecord[],
  curated: readonly SettingsConnector[],
): DirectoryFilterGroup[] {
  const modes = [
    ...new Set([
      ...records.map((record) => record.connectable),
      ...curated.map((connector) =>
        connector.canConnect === true ? CONNECTABLE_MODE : NEEDS_SETUP_MODE,
      ),
    ]),
  ].sort();
  const categories = [
    ...new Set([
      ...records.flatMap((record) => record.categories),
      ...curated.map((connector) => connector.category),
    ]),
  ].sort();
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

export function toCuratedConnectorEntry(
  connector: SettingsConnector,
  connectedIds: ReadonlySet<string>,
): DirectoryEntry {
  const connected = connectedIds.has(connector.id);
  return {
    id: connector.id,
    name: connector.name,
    publisher: connector.publisher,
    description: connector.description,
    brandId: connector.id,
    monogram: connector.iconText,
    badges: [curatedBadge(connector)],
    sourceId: FIRST_PARTY_BADGE,
    popular: true,
    installed: connected,
    installable: connector.canConnect === true,
    ...(connector.statusLabel ? { statusLabel: connector.statusLabel } : {}),
    facets: {
      [CONNECTOR_AVAILABILITY_GROUP_ID]: [
        connector.canConnect === true ? CONNECTABLE_MODE : NEEDS_SETUP_MODE,
      ],
      [CONNECTOR_CATEGORY_GROUP_ID]: [connector.category],
    },
  };
}

export function toConnectorSection(
  records: readonly DirectoryRecord[],
  connectedIds: ReadonlySet<string>,
  curated: readonly SettingsConnector[] = [],
): DirectorySection {
  const curatedEntries = curated.map((connector) =>
    toCuratedConnectorEntry(connector, connectedIds),
  );
  const curatedIds = new Set(curatedEntries.map((entry) => entry.id));
  const registryEntries = records
    .filter((record) => !curatedIds.has(record.id))
    .map((record) => toConnectorEntry(record, connectedIds));
  return {
    entries: [...curatedEntries, ...registryEntries],
    installable: true,
    sources: connectorSources(records, curatedEntries.length > 0),
    filterGroups: connectorFilterGroups(records, curated),
    sortOptions: ['name'],
  };
}

export function toCuratedConnectorDetail(
  connector: SettingsConnector,
  connectedIds: ReadonlySet<string>,
): DirectoryConnectorDetail {
  const target = FIRST_PARTY_TARGETS_BY_ID.get(connector.id);
  const vendor = connector.publisher ?? connector.name;
  const websiteUrl = target ? originOf(target.documentationUrl) : null;
  return {
    kind: 'connector',
    id: connector.id,
    name: connector.name,
    summary: connector.description,
    badge: curatedBadge(connector),
    brandId: connector.id,
    monogram: connector.iconText,
    tools: target?.toolNames ?? [],
    categories: [connector.category],
    publisher: vendor,
    publisherUrl: websiteUrl,
    authorName: vendor,
    authorUrl: websiteUrl,
    connectorUrl: target?.url ?? null,
    documentationUrl: target?.documentationUrl ?? null,
    websiteUrl,
    connected: connectedIds.has(connector.id),
    connectable: connector.canConnect === true,
  };
}

export function connectedConnectorIds(connected: readonly ConnectedConnector[]): Set<string> {
  return new Set(connected.map((entry) => entry.connectorId));
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
    categories: record.categories,
    publisher: record.publisher,
    publisherUrl: record.websiteUrl ?? record.authorUrl,
    authorName: record.authorName,
    authorUrl: record.authorUrl,
    connectorUrl: record.remotes[0]?.url ?? null,
    documentationUrl: record.documentationUrl,
    websiteUrl: record.websiteUrl,
    supportUrl: record.supportUrl,
    privacyPolicyUrl: record.privacyPolicyUrl,
    connected: connectedIds.has(record.id),
    connectable: !CONNECTABLE_BLOCKED.has(record.connectable),
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

export function withConnectorErrors(
  entries: readonly DirectoryEntry[],
  errors: Readonly<Record<string, string>>,
): DirectoryEntry[] {
  return entries.map((entry) => {
    const message = errors[entry.id];
    return message ? { ...entry, error: message } : entry;
  });
}

/**
 * The attention badge on the Connectors nav row counts connectors flagged
 * `status: 'warning'`, but nothing carried that flag onto the connector's own
 * card, so clicking the badge landed on a grid with no way to tell which
 * connector it was about. This surfaces the same warning inline, through the
 * same `error` field `withConnectorErrors` already renders.
 */
export function connectorReauthorizationErrors(
  connected: readonly ConnectedConnector[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const connector of connected) {
    if (connector.status === 'warning') {
      errors[connector.connectorId] = connector.warningLabel ?? CONNECTOR_REAUTHORIZATION_COPY;
    }
  }
  return errors;
}
