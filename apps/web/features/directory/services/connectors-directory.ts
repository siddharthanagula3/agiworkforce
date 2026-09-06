import {
  isUnverifiedCustomConnector,
  DIRECTORY_SOURCE_ALL_ID,
  DIRECTORY_SOURCE_ALL_LABEL,
  type ConnectedConnector,
  type DirectoryBadgeKind,
  type DirectoryConnectableMode,
  type DirectoryConnectorDetail,
  type DirectoryEntry,
  type DirectoryFilterGroup,
  type DirectoryQuery,
  type DirectorySection,
  type DirectorySortKey,
  type DirectorySourceChip,
  type DirectoryToggle,
  type SettingsConnector,
} from '@agiworkforce/ui';

import {
  isDirectoryCategory,
  OTHER_CATEGORY,
  type DirectoryCategory,
} from '@/lib/connectors/directory/categorize';
import firstPartyTargets from '@/lib/connectors/directory/sources/first-party.json';
import type {
  DirectoryAuthMode,
  DirectoryBadge,
  DirectoryRecord,
} from '@/lib/connectors/directory/types';

import {
  CONNECTORS_PATH,
  CONNECTOR_CATEGORY_GROUP_ID,
  CONNECTOR_CATEGORY_GROUP_LABEL,
  CONNECTOR_COUNT_SUFFIX,
  CONNECTOR_DIRECTORY_PATH,
  CONNECTOR_ICON_PATH,
  CONNECTOR_INCLUDE_LOCAL_TOGGLE_ID,
  CONNECTOR_INCLUDE_LOCAL_TOGGLE_LABEL,
  CONNECTOR_REAUTHORIZATION_COPY,
  CONNECTOR_SETUP_NOTICE_CURATED_PREFIX,
  CONNECTOR_SETUP_NOTICE_CURATED_SUFFIX,
  CONNECTOR_SETUP_NOTICE_REGISTRY,
  CONNECTOR_STATE_DESKTOP_AND_CLI,
  CONNECTOR_STATE_NEEDS_SETUP,
  CONNECTOR_TAB_COMMUNITY_BADGE,
  CONNECTOR_TAB_COMMUNITY_LABEL,
  CONNECTOR_TAB_HEADINGS,
  CONNECTOR_TAB_OFFICIAL_BADGE,
  CONNECTOR_TAB_OFFICIAL_LABEL,
  CONNECTOR_TERMS_PATH,
  CURATED_CATEGORY_TO_DIRECTORY,
  CURATED_SIGN_IN_AUTH_TYPES,
  DESKTOP_DOWNLOAD_PATH,
  DIRECTORY_DEFAULT_SORT,
  DIRECTORY_PAGE_SIZE,
  DIRECTORY_QUERY_BADGE,
  DIRECTORY_QUERY_CATEGORY,
  DIRECTORY_QUERY_CONNECTABLE_ONLY,
  DIRECTORY_QUERY_CURSOR,
  DIRECTORY_QUERY_LIMIT,
  DIRECTORY_QUERY_SEARCH,
  DIRECTORY_QUERY_SORT,
  DIRECTORY_QUERY_TRUE,
  DIRECTORY_SORT_NAME,
  DIRECTORY_SORT_POPULAR,
  REGISTRY_OPEN_AUTH_MODE,
  REGISTRY_SIGN_IN_AUTH_MODES,
  RELATED_CONNECTOR_FETCH_LIMIT,
  RELATED_CONNECTOR_LIMIT,
} from '../constants';

const BADGE_TO_KIND: Record<DirectoryBadge, DirectoryBadgeKind> = {
  'first-party': 'first-party',
  official: 'official',
  verified: 'verified',
  registry: 'community',
  community: 'community',
};

const CURATED_BADGE: DirectoryBadgeKind = 'verified';
const SELF_ADDED_BADGE: DirectoryBadgeKind = 'custom';

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

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function curatedPublisher(connector: SettingsConnector): string | undefined {
  if (!isUnverifiedCustomConnector(connector)) return connector.publisher;
  return hostOf(connector.description) ?? connector.publisher;
}

const CONNECTABLE_BLOCKED: ReadonlySet<DirectoryConnectableMode> = new Set([
  'desktop-and-cli',
  'needs-setup',
]);
const FIRST_PARTY_BADGE: DirectoryBadge = 'first-party';
const CONNECTABLE_MODE: DirectoryConnectableMode = 'connect';
const NEEDS_SETUP_MODE: DirectoryConnectableMode = 'needs-setup';

export const CONNECTOR_SORT_OPTIONS: readonly DirectorySortKey[] = [
  DIRECTORY_SORT_POPULAR,
  DIRECTORY_SORT_NAME,
];

export const CONNECTOR_SOURCE_TABS: readonly DirectorySourceChip[] = [
  { id: DIRECTORY_SOURCE_ALL_ID, label: DIRECTORY_SOURCE_ALL_LABEL },
  { id: CONNECTOR_TAB_OFFICIAL_BADGE, label: CONNECTOR_TAB_OFFICIAL_LABEL },
  { id: CONNECTOR_TAB_COMMUNITY_BADGE, label: CONNECTOR_TAB_COMMUNITY_LABEL },
];

export const CONNECTOR_TOGGLES: readonly DirectoryToggle[] = [
  { id: CONNECTOR_INCLUDE_LOCAL_TOGGLE_ID, label: CONNECTOR_INCLUDE_LOCAL_TOGGLE_LABEL },
];

export const CONNECTOR_TOGGLE_DEFAULTS: Readonly<Record<string, boolean>> = {
  [CONNECTOR_INCLUDE_LOCAL_TOGGLE_ID]: false,
};

export const DEFAULT_DIRECTORY_QUERY: DirectoryQuery = {
  search: '',
  sourceId: null,
  selection: {},
  sort: DIRECTORY_DEFAULT_SORT,
  toggles: CONNECTOR_TOGGLE_DEFAULTS,
};

export interface ConnectorDirectoryStats {
  totalRecords: number;
  remoteRecords?: number;
  byConnectable?: Readonly<Record<string, number>>;
  byBadge?: Readonly<Record<string, number>>;
  bootstrapComplete?: boolean;
  lastSyncAt?: string | null;
}

export interface ConnectorDirectoryResponse {
  entries: DirectoryRecord[];
  total: number;
  nextCursor: string | null;
  categories?: readonly string[];
  connectableModes?: readonly DirectoryConnectableMode[];
  stats?: ConnectorDirectoryStats;
}

export interface ConnectorDirectoryRequest {
  search: string;
  badge: DirectoryBadge | null;
  category: string | null;
  connectableOnly: boolean;
  sort: DirectorySortKey;
  cursor: string | null;
  limit?: number;
}

export interface ConnectorSetupRequirement {
  kind?: string;
  missingEnv: readonly string[];
  message: string;
}

export interface ConnectedConnectorsResponse {
  connectors: { connectorId: string }[];
  setup?: Readonly<Record<string, ConnectorSetupRequirement>>;
}

export interface ConnectedConnectorsSnapshot {
  ids: Set<string>;
  setup: Readonly<Record<string, ConnectorSetupRequirement>>;
}

export function connectorIconHref(record: DirectoryRecord): string | null {
  return record.iconUrl ? `${CONNECTOR_ICON_PATH}?id=${encodeURIComponent(record.id)}` : null;
}

export function connectorStateLabel(
  mode: DirectoryConnectableMode,
  connected: boolean,
): string | undefined {
  if (connected) return undefined;
  if (mode === 'desktop-and-cli') return CONNECTOR_STATE_DESKTOP_AND_CLI;
  if (mode === 'needs-setup') return CONNECTOR_STATE_NEEDS_SETUP;
  return undefined;
}

function withStateLabel(label: string | undefined): { statusLabel?: string } {
  return label ? { statusLabel: label } : {};
}

export function toConnectorEntry(
  record: DirectoryRecord,
  connectedIds: ReadonlySet<string>,
  popular = false,
): DirectoryEntry {
  const connected = connectedIds.has(record.id);
  return {
    id: record.id,
    name: record.name,
    publisher: record.publisher,
    description: record.description,
    ...(record.brandSlug ? { brandId: record.brandSlug } : {}),
    iconUrl: connectorIconHref(record),
    monogram: record.monogram,
    badges: [BADGE_TO_KIND[record.badge]],
    sourceId: record.badge,
    popular,
    installed: connected,
    installable: !CONNECTABLE_BLOCKED.has(record.connectable),
    connectableMode: record.connectable,
    ...withStateLabel(connectorStateLabel(record.connectable, connected)),
    facets: {
      [CONNECTOR_CATEGORY_GROUP_ID]: record.categories,
    },
  };
}

export function connectorCategoryFilter(
  categories: readonly string[],
): DirectoryFilterGroup | null {
  const sorted = [...new Set(categories)].sort();
  if (sorted.length < 2) return null;
  return {
    id: CONNECTOR_CATEGORY_GROUP_ID,
    label: CONNECTOR_CATEGORY_GROUP_LABEL,
    options: sorted.map((category) => ({ value: category, label: category })),
  };
}

function curatedMode(connector: SettingsConnector): DirectoryConnectableMode {
  return connector.canConnect === true ? CONNECTABLE_MODE : NEEDS_SETUP_MODE;
}

export function curatedDirectoryCategory(connector: SettingsConnector): DirectoryCategory {
  if (isDirectoryCategory(connector.category)) return connector.category;
  const mapped = CURATED_CATEGORY_TO_DIRECTORY[connector.category];
  return mapped && isDirectoryCategory(mapped) ? mapped : OTHER_CATEGORY;
}

export function toCuratedConnectorEntry(
  connector: SettingsConnector,
  connectedIds: ReadonlySet<string>,
): DirectoryEntry {
  const connected = connectedIds.has(connector.id);
  const mode = curatedMode(connector);
  return {
    id: connector.id,
    name: connector.name,
    publisher: curatedPublisher(connector),
    description: connector.description,
    brandId: connector.id,
    monogram: connector.iconText,
    badges: [curatedBadge(connector)],
    sourceId: FIRST_PARTY_BADGE,
    popular: !isUnverifiedCustomConnector(connector),
    installed: connected,
    installable: connector.canConnect === true,
    connectableMode: mode,
    ...withStateLabel(connectorStateLabel(mode, connected)),
    facets: {
      [CONNECTOR_CATEGORY_GROUP_ID]: [curatedDirectoryCategory(connector)],
    },
  };
}

function matchesText(connector: SettingsConnector, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    connector.name,
    connector.publisher ?? '',
    connector.description,
    connector.category,
    curatedDirectoryCategory(connector),
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function matchesCuratedConnector(
  connector: SettingsConnector,
  request: ConnectorDirectoryRequest,
): boolean {
  if (!matchesText(connector, request.search)) return false;
  if (request.badge === CONNECTOR_TAB_COMMUNITY_BADGE) return false;
  if (request.badge !== null && isUnverifiedCustomConnector(connector)) return false;
  if (request.category && curatedDirectoryCategory(connector) !== request.category) return false;
  return true;
}

export function toDirectoryRequest(
  query: DirectoryQuery,
  cursor: string | null = null,
): ConnectorDirectoryRequest {
  const category = query.selection[CONNECTOR_CATEGORY_GROUP_ID]?.[0] ?? null;
  const includeLocal = query.toggles[CONNECTOR_INCLUDE_LOCAL_TOGGLE_ID] === true;
  const badge =
    query.sourceId === CONNECTOR_TAB_OFFICIAL_BADGE ||
    query.sourceId === CONNECTOR_TAB_COMMUNITY_BADGE
      ? query.sourceId
      : null;
  return {
    search: query.search.trim(),
    badge,
    category,
    connectableOnly: !includeLocal,
    sort: query.sort,
    cursor,
  };
}

export function connectorDirectoryHref(request: ConnectorDirectoryRequest): string {
  const params = new URLSearchParams();
  if (request.search) params.set(DIRECTORY_QUERY_SEARCH, request.search);
  if (request.badge) params.set(DIRECTORY_QUERY_BADGE, request.badge);
  if (request.category) params.set(DIRECTORY_QUERY_CATEGORY, request.category);
  if (request.connectableOnly) params.set(DIRECTORY_QUERY_CONNECTABLE_ONLY, DIRECTORY_QUERY_TRUE);
  params.set(DIRECTORY_QUERY_SORT, request.sort);
  params.set(DIRECTORY_QUERY_LIMIT, String(request.limit ?? DIRECTORY_PAGE_SIZE));
  if (request.cursor) params.set(DIRECTORY_QUERY_CURSOR, request.cursor);
  return `${CONNECTOR_DIRECTORY_PATH}?${params.toString()}`;
}

export async function fetchConnectorDirectoryPage(
  request: ConnectorDirectoryRequest,
): Promise<ConnectorDirectoryResponse> {
  const response = await fetch(connectorDirectoryHref(request), { cache: 'no-store' });
  if (!response.ok) throw new Error(`connector directory failed: ${response.status}`);
  const body = (await response.json()) as Partial<ConnectorDirectoryResponse>;
  const entries = body.entries ?? [];
  return {
    entries,
    total: typeof body.total === 'number' ? body.total : entries.length,
    nextCursor: body.nextCursor ?? null,
    ...(body.categories ? { categories: body.categories } : {}),
    ...(body.connectableModes ? { connectableModes: body.connectableModes } : {}),
    ...(body.stats ? { stats: body.stats } : {}),
  };
}

export function connectorCountLabel(count: number): string {
  return `${count.toLocaleString()} ${CONNECTOR_COUNT_SUFFIX}`;
}

export function initialConnectorSection(): DirectorySection {
  return {
    entries: [],
    installable: true,
    remote: true,
    sources: CONNECTOR_SOURCE_TABS,
    sortOptions: CONNECTOR_SORT_OPTIONS,
    toggles: CONNECTOR_TOGGLES,
    toggleDefaults: CONNECTOR_TOGGLE_DEFAULTS,
  };
}

export interface ConnectorSectionInput {
  records: readonly DirectoryRecord[];
  connectedIds: ReadonlySet<string>;
  curated: readonly SettingsConnector[];
  request: ConnectorDirectoryRequest;
  total: number;
  nextCursor: string | null;
  categories: readonly string[];
  stats?: ConnectorDirectoryStats;
  featuredLimit?: number;
}

export function toConnectorSection({
  records,
  connectedIds,
  curated,
  request,
  total,
  nextCursor,
  categories,
  stats,
  featuredLimit,
}: ConnectorSectionInput): DirectorySection {
  const tabHeading = request.badge ? CONNECTOR_TAB_HEADINGS[request.badge] : undefined;
  const allTab = tabHeading === undefined;
  const firstPage = new Set(
    records.slice(0, featuredLimit ?? records.length).map((record) => record.id),
  );
  const curatedEntries = curated
    .filter((connector) => matchesCuratedConnector(connector, request))
    .map((connector) => toCuratedConnectorEntry(connector, connectedIds))
    .map((entry) => (allTab ? entry : { ...entry, popular: false }));
  const curatedIds = new Set(curated.map((connector) => connector.id));
  const registryEntries = records
    .filter((record) => !curatedIds.has(record.id))
    .map((record) =>
      toConnectorEntry(
        record,
        connectedIds,
        allTab && record.featured === true && firstPage.has(record.id),
      ),
    );
  const categoryFilter = connectorCategoryFilter([
    ...categories,
    ...curated.map((connector) => curatedDirectoryCategory(connector)),
  ]);
  const totalRecords = stats?.totalRecords;
  return {
    ...initialConnectorSection(),
    entries: [...curatedEntries, ...registryEntries],
    filterGroups: categoryFilter ? [categoryFilter] : [],
    total: total + curatedEntries.length,
    hasMore: nextCursor !== null,
    ...(typeof totalRecords === 'number' ? { countLabel: connectorCountLabel(totalRecords) } : {}),
    ...(tabHeading ? { catalogHeading: tabHeading } : {}),
  };
}

function curatedSetupNotice(connector: SettingsConnector): string {
  return `${CONNECTOR_SETUP_NOTICE_CURATED_PREFIX} ${connector.name} ${CONNECTOR_SETUP_NOTICE_CURATED_SUFFIX}`;
}

function curatedSignIn(connector: SettingsConnector): { signInRequired?: boolean } {
  if (isUnverifiedCustomConnector(connector)) return {};
  return CURATED_SIGN_IN_AUTH_TYPES.includes(connector.authType) ? { signInRequired: true } : {};
}

export function registrySignIn(authMode: DirectoryAuthMode): { signInRequired?: boolean } {
  if (REGISTRY_SIGN_IN_AUTH_MODES.includes(authMode)) return { signInRequired: true };
  if (authMode === REGISTRY_OPEN_AUTH_MODE) return { signInRequired: false };
  return {};
}

export function relatedConnectorRequest(category: string): ConnectorDirectoryRequest {
  return {
    search: '',
    badge: null,
    category,
    connectableOnly: false,
    sort: DIRECTORY_SORT_POPULAR,
    cursor: null,
    limit: RELATED_CONNECTOR_FETCH_LIMIT,
  };
}

export function toRelatedConnectors(
  records: readonly DirectoryRecord[],
  currentId: string,
  curated: readonly SettingsConnector[],
  connectedIds: ReadonlySet<string>,
): DirectoryEntry[] {
  const curatedById = new Map(curated.map((connector) => [connector.id, connector]));
  return records
    .filter((record) => record.id !== currentId)
    .slice(0, RELATED_CONNECTOR_LIMIT)
    .map((record) => {
      const match = curatedById.get(record.id);
      return match
        ? toCuratedConnectorEntry(match, connectedIds)
        : toConnectorEntry(record, connectedIds);
    });
}

export async function fetchRelatedConnectors(
  category: string | undefined,
  currentId: string,
  curated: readonly SettingsConnector[],
  connectedIds: ReadonlySet<string>,
): Promise<DirectoryEntry[]> {
  if (!category || !isDirectoryCategory(category)) return [];
  try {
    const page = await fetchConnectorDirectoryPage(relatedConnectorRequest(category));
    return toRelatedConnectors(page.entries, currentId, curated, connectedIds);
  } catch {
    return [];
  }
}

export function toCuratedConnectorDetail(
  connector: SettingsConnector,
  connectedIds: ReadonlySet<string>,
  setupMessage?: string,
): DirectoryConnectorDetail {
  const target = FIRST_PARTY_TARGETS_BY_ID.get(connector.id);
  const vendor = connector.publisher ?? connector.name;
  const websiteUrl = target ? originOf(target.documentationUrl) : null;
  const mode = curatedMode(connector);
  return {
    kind: 'connector',
    id: connector.id,
    name: connector.name,
    summary: connector.description,
    badge: curatedBadge(connector),
    brandId: connector.id,
    monogram: connector.iconText,
    tools: target?.toolNames ?? [],
    categories: [curatedDirectoryCategory(connector)],
    publisher: vendor,
    publisherUrl: websiteUrl,
    authorName: vendor,
    authorUrl: websiteUrl,
    connectorUrl: target?.url ?? null,
    documentationUrl: target?.documentationUrl ?? null,
    websiteUrl,
    ...curatedSignIn(connector),
    termsHref: CONNECTOR_TERMS_PATH,
    connected: connectedIds.has(connector.id),
    connectable: connector.canConnect === true,
    connectableMode: mode,
    ...(mode === NEEDS_SETUP_MODE
      ? { setupNotice: setupMessage ?? curatedSetupNotice(connector) }
      : {}),
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
    ...(record.brandSlug ? { brandId: record.brandSlug } : {}),
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
    repositoryUrl: record.repositoryUrl,
    ...registrySignIn(record.authMode),
    ...(record.listingNote ? { listingNote: record.listingNote } : {}),
    termsHref: CONNECTOR_TERMS_PATH,
    connected: connectedIds.has(record.id),
    connectable: !CONNECTABLE_BLOCKED.has(record.connectable),
    connectableMode: record.connectable,
    ...(record.connectable === 'desktop-and-cli' ? { desktopHref: DESKTOP_DOWNLOAD_PATH } : {}),
    ...(record.connectable === NEEDS_SETUP_MODE && !record.listingNote
      ? { setupNotice: CONNECTOR_SETUP_NOTICE_REGISTRY }
      : {}),
  };
}

export async function fetchConnectedConnectors(): Promise<ConnectedConnectorsSnapshot> {
  const response = await fetch(CONNECTORS_PATH, { cache: 'no-store' });
  if (!response.ok) return { ids: new Set(), setup: {} };
  const body = (await response.json()) as ConnectedConnectorsResponse;
  return {
    ids: new Set((body.connectors ?? []).map((connector) => connector.connectorId)),
    setup: body.setup ?? {},
  };
}

export async function fetchConnectedConnectorIds(): Promise<Set<string>> {
  return (await fetchConnectedConnectors()).ids;
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
