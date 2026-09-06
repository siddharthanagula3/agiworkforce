import type {
  PluginMarketplaceEntry,
  PluginMarketplaceInstallation,
  PluginMarketplaceSourceSummary,
} from '@agiworkforce/cloud-contracts';
import { isPluginEntryWebInstallable, type PluginRegistryEntry } from '@agiworkforce/types';
import {
  DIRECTORY_SOURCE_ALL_ID,
  DIRECTORY_SOURCE_ALL_LABEL,
  matchesDirectorySearch,
  sortDirectoryEntries,
  type DirectoryBadgeKind,
  type DirectoryEntry,
  type DirectoryFilterGroup,
  type DirectoryGroup,
  type DirectoryPluginComponents,
  type DirectoryPluginDetail,
  type DirectoryQuery,
  type DirectorySection,
  type DirectorySortKey,
  type DirectorySourceChip,
} from '@agiworkforce/ui';

import type {
  PluginDirectoryEntry,
  PluginDirectoryListResponse,
  PluginDirectoryStats,
  PluginSourceFacet,
  PluginWorksWith,
} from '@/features/plugins/server/directory/types';

import {
  CSRF_HEADER,
  DIRECTORY_PAGE_SIZE,
  DIRECTORY_QUERY_CURSOR,
  DIRECTORY_QUERY_LIMIT,
  DIRECTORY_QUERY_SEARCH,
  DIRECTORY_QUERY_SORT,
  DIRECTORY_QUERY_SOURCE,
  DIRECTORY_QUERY_WORKS_WITH,
  DIRECTORY_SORT_NAME,
  JSON_CONTENT_TYPE,
  PLUGINS_PATH,
  PLUGIN_CONFLICT_STATUS,
  PLUGIN_COUNT_SUFFIX,
  PLUGIN_GROUP_HEADINGS,
  PLUGIN_INSTALLATIONS_PATH,
  PLUGIN_INSTALLS_DISABLED_CODE,
  PLUGIN_INSTALLS_DISABLED_STATUS,
  PLUGIN_INSTALL_FAILED_COPY,
  PLUGIN_MARKETPLACES_PATH,
  PLUGIN_MARKETPLACE_ENTRIES_PATH,
  PLUGIN_MARKETPLACE_INSTALLATIONS_PATH,
  PLUGIN_MESSAGE_STATUSES,
  PLUGIN_NOT_INSTALLABLE_CODE,
  PLUGIN_PUBLISHED_STATUS,
  PLUGIN_SORT_INSTALLS,
  PLUGIN_SOURCE_BUILTIN,
  PLUGIN_SOURCE_FACETS,
  PLUGIN_SOURCE_MARKETPLACE,
  PLUGIN_SOURCE_PARTNER,
  PLUGIN_SOURCE_TAB_LABELS,
  PLUGIN_STATE_DESKTOP_AND_CLI,
  PLUGIN_STATE_INSTALL,
  PLUGIN_STATE_INSTALLED,
  PLUGIN_UNINSTALL_FAILED_COPY,
  PLUGIN_UNPUBLISHED_LABEL,
  PLUGIN_USER_GROUP_HEADING,
  PLUGIN_USER_GROUP_ID,
  PLUGIN_WORKS_WITH_GROUP_ID,
  PLUGIN_WORKS_WITH_GROUP_LABEL,
  PLUGIN_WORKS_WITH_LABELS,
  PLUGIN_WORKS_WITH_ORDER,
} from '../constants';
import { DirectoryRequestError } from './request-error';

const VERIFIED_BADGE: DirectoryBadgeKind = 'verified';
const BUILTIN_PUBLISHER_KIND = 'first-party';
const EMPTY_STRINGS: readonly string[] = [];

export const PLUGIN_SORT_OPTIONS: readonly DirectorySortKey[] = [
  PLUGIN_SORT_INSTALLS,
  DIRECTORY_SORT_NAME,
];

export const DEFAULT_PLUGIN_QUERY: DirectoryQuery = {
  search: '',
  sourceId: null,
  selection: {},
  sort: PLUGIN_SORT_INSTALLS,
  toggles: {},
};

export interface PluginDirectoryRequest {
  search: string;
  source: PluginSourceFacet | null;
  worksWith: PluginWorksWith | null;
  sort: DirectorySortKey;
  cursor: string | null;
  limit?: number;
}

export interface PluginMarketplacePage {
  entries: PluginDirectoryEntry[];
  total: number;
  nextCursor: string | null;
}

export interface PluginInstallState {
  builtinIds: ReadonlySet<string>;
  byPluginKey: ReadonlyMap<string, PluginMarketplaceInstallation>;
  byEntryId: ReadonlyMap<string, PluginMarketplaceInstallation>;
  notice: string | null;
}

export interface UserMarketplaceState {
  sources: PluginMarketplaceSourceSummary[];
  entries: PluginMarketplaceEntry[];
}

export const EMPTY_INSTALL_STATE: PluginInstallState = {
  builtinIds: new Set(),
  byPluginKey: new Map(),
  byEntryId: new Map(),
  notice: null,
};

export const EMPTY_USER_MARKETPLACES: UserMarketplaceState = { sources: [], entries: [] };

function isSourceFacet(value: string | null): value is PluginSourceFacet {
  return value !== null && PLUGIN_SOURCE_FACETS.includes(value);
}

function isWorksWith(value: string | undefined): value is PluginWorksWith {
  return value !== undefined && PLUGIN_WORKS_WITH_ORDER.includes(value);
}

export function userMarketplaceSourceId(query: DirectoryQuery): string | null {
  return query.sourceId !== null && !isSourceFacet(query.sourceId) ? query.sourceId : null;
}

export function toPluginRequest(
  query: DirectoryQuery,
  cursor: string | null = null,
): PluginDirectoryRequest {
  const worksWith = query.selection[PLUGIN_WORKS_WITH_GROUP_ID]?.[0];
  return {
    search: query.search.trim(),
    source: isSourceFacet(query.sourceId) ? query.sourceId : null,
    worksWith: isWorksWith(worksWith) ? worksWith : null,
    sort: query.sort === DIRECTORY_SORT_NAME ? DIRECTORY_SORT_NAME : PLUGIN_SORT_INSTALLS,
    cursor,
  };
}

export function marketplaceRequest(
  query: DirectoryQuery,
  cursor: string | null = null,
): PluginDirectoryRequest {
  const request = toPluginRequest(query, cursor);
  return { ...request, source: request.source ?? PLUGIN_SOURCE_MARKETPLACE };
}

export function pluginDirectoryHref(request: PluginDirectoryRequest): string {
  const params = new URLSearchParams();
  if (request.search) params.set(DIRECTORY_QUERY_SEARCH, request.search);
  if (request.source) params.set(DIRECTORY_QUERY_SOURCE, request.source);
  if (request.worksWith) params.set(DIRECTORY_QUERY_WORKS_WITH, request.worksWith);
  params.set(DIRECTORY_QUERY_SORT, request.sort);
  params.set(DIRECTORY_QUERY_LIMIT, String(request.limit ?? DIRECTORY_PAGE_SIZE));
  if (request.cursor) params.set(DIRECTORY_QUERY_CURSOR, request.cursor);
  return `${PLUGINS_PATH}?${params.toString()}`;
}

export function facetRequest(source: PluginSourceFacet): PluginDirectoryRequest {
  return { search: '', source, worksWith: null, sort: PLUGIN_SORT_INSTALLS, cursor: null };
}

export async function fetchPluginDirectoryPage(
  request: PluginDirectoryRequest,
): Promise<PluginDirectoryListResponse> {
  const response = await fetch(pluginDirectoryHref(request), { cache: 'no-store' });
  if (!response.ok) throw new Error(`plugin directory failed: ${response.status}`);
  const body = (await response.json()) as Partial<PluginDirectoryListResponse>;
  const entries = (body.entries ?? []).map(toDirectoryShape);
  return {
    entries,
    total: typeof body.total === 'number' ? body.total : entries.length,
    nextCursor: body.nextCursor ?? null,
    stats: body.stats ?? computeStats(entries),
  };
}

function computeStats(entries: readonly PluginDirectoryEntry[]): PluginDirectoryStats {
  const bySource = {
    [PLUGIN_SOURCE_BUILTIN]: 0,
    [PLUGIN_SOURCE_PARTNER]: 0,
    [PLUGIN_SOURCE_MARKETPLACE]: 0,
  } as Record<PluginSourceFacet, number>;
  const byWorksWith = Object.fromEntries(
    PLUGIN_WORKS_WITH_ORDER.map((value) => [value, 0]),
  ) as Record<PluginWorksWith, number>;
  let verified = 0;
  for (const entry of entries) {
    bySource[entry.sourceFacet] += 1;
    if (entry.verified) verified += 1;
    for (const value of entry.worksWith) byWorksWith[value] += 1;
  }
  return { totalPlugins: entries.length, verified, bySource, byWorksWith };
}

export function toDirectoryShape(
  entry: PluginRegistryEntry | PluginDirectoryEntry,
): PluginDirectoryEntry {
  if ('sourceFacet' in entry) return entry;
  const builtin = entry.source === PLUGIN_SOURCE_BUILTIN;
  return {
    ...entry,
    slug: entry.id,
    sourceFacet: builtin ? PLUGIN_SOURCE_BUILTIN : PLUGIN_SOURCE_PARTNER,
    verified: entry.publisher.kind === BUILTIN_PUBLISHER_KIND,
    installs: entry.installCount ?? null,
    worksWith: [],
    repositoryUrl: null,
    marketplace: null,
    installCommand: null,
    runtime: {
      webInstallable: entry.webInstallable,
      inspected: true,
      components: {
        skills: entry.declaredSkills,
        skillPaths: [],
        commands: 0,
        agents: 0,
        hooks: false,
        mcpServers: [],
        lspServers: [],
      },
      note: null,
    },
    sourceLocation: null,
  };
}

export async function fetchPluginDirectoryEntry(id: string): Promise<PluginDirectoryEntry | null> {
  const response = await fetch(`${PLUGINS_PATH}/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { entry?: PluginRegistryEntry | PluginDirectoryEntry };
  return body.entry ? toDirectoryShape(body.entry) : null;
}

interface ErrorBody {
  error?: { code?: string; message?: string; installCommand?: string | null };
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
  return (await response.json().catch(() => ({}))) as ErrorBody;
}

export async function fetchPluginInstallState(): Promise<PluginInstallState> {
  const [builtin, marketplace] = await Promise.all([
    fetch(PLUGIN_INSTALLATIONS_PATH, { cache: 'no-store' }).catch(() => null),
    fetch(PLUGIN_MARKETPLACE_INSTALLATIONS_PATH, { cache: 'no-store' }).catch(() => null),
  ]);
  const builtinIds = new Set<string>();
  if (builtin?.ok) {
    const body = (await builtin.json().catch(() => ({}))) as {
      installations?: { pluginId: string }[];
    };
    for (const installation of body.installations ?? []) builtinIds.add(installation.pluginId);
  }
  const byPluginKey = new Map<string, PluginMarketplaceInstallation>();
  const byEntryId = new Map<string, PluginMarketplaceInstallation>();
  let notice: string | null = null;
  if (marketplace?.ok) {
    const body = (await marketplace.json().catch(() => ({}))) as {
      installations?: PluginMarketplaceInstallation[];
    };
    for (const installation of body.installations ?? []) {
      byPluginKey.set(installation.pluginKey, installation);
      byEntryId.set(installation.entryId, installation);
    }
  } else if (marketplace && marketplace.status === PLUGIN_INSTALLS_DISABLED_STATUS) {
    const body = await readErrorBody(marketplace);
    if (body.error?.code === PLUGIN_INSTALLS_DISABLED_CODE) notice = body.error.message ?? null;
  }
  return { builtinIds, byPluginKey, byEntryId, notice };
}

async function readOptional<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchUserMarketplaces(): Promise<UserMarketplaceState> {
  const [sources, entries] = await Promise.all([
    readOptional<{ sources?: PluginMarketplaceSourceSummary[] }>(PLUGIN_MARKETPLACES_PATH),
    readOptional<{ entries?: PluginMarketplaceEntry[] }>(PLUGIN_MARKETPLACE_ENTRIES_PATH),
  ]);
  return { sources: sources?.sources ?? [], entries: entries?.entries ?? [] };
}

export function isPluginInstalled(entry: PluginDirectoryEntry, installs: PluginInstallState) {
  return entry.sourceFacet === PLUGIN_SOURCE_BUILTIN
    ? installs.builtinIds.has(entry.id)
    : installs.byPluginKey.has(entry.id);
}

function availabilityLabel(entry: PluginDirectoryEntry): string {
  return entry.status === PLUGIN_PUBLISHED_STATUS
    ? PLUGIN_STATE_DESKTOP_AND_CLI
    : PLUGIN_UNPUBLISHED_LABEL;
}

export function pluginStateLabel(
  entry: PluginDirectoryEntry,
  installed: boolean,
  installable: boolean,
): string {
  if (installed) return PLUGIN_STATE_INSTALLED;
  if (installable) return PLUGIN_STATE_INSTALL;
  return availabilityLabel(entry);
}

function monogramOf(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

export function toPluginEntry(
  entry: PluginDirectoryEntry,
  installs: PluginInstallState,
): DirectoryEntry {
  const installed = isPluginInstalled(entry, installs);
  const installable = isPluginEntryWebInstallable(entry);
  return {
    id: entry.id,
    name: entry.name,
    publisher: entry.publisher.name,
    description: entry.description,
    monogram: monogramOf(entry.name),
    ...(entry.verified ? { badges: [VERIFIED_BADGE] } : {}),
    sourceId: entry.sourceFacet,
    groupId: entry.sourceFacet,
    installed,
    installable,
    statusLabel: pluginStateLabel(entry, installed, installable),
    ...(entry.installs === null ? {} : { installCount: entry.installs }),
    updatedAt: entry.updatedAt,
    facets: { [PLUGIN_WORKS_WITH_GROUP_ID]: entry.worksWith },
  };
}

export function toUserMarketplaceEntry(
  entry: PluginMarketplaceEntry,
  source: PluginMarketplaceSourceSummary | undefined,
  installs: PluginInstallState,
): DirectoryEntry {
  const installed = installs.byEntryId.has(entry.id);
  return {
    id: entry.id,
    name: entry.name,
    ...(source ? { publisher: source.name } : {}),
    description: entry.description,
    monogram: monogramOf(entry.name),
    sourceId: entry.sourceId,
    groupId: PLUGIN_USER_GROUP_ID,
    installed,
    installable: true,
    statusLabel: installed ? PLUGIN_STATE_INSTALLED : PLUGIN_STATE_INSTALL,
    updatedAt: entry.updatedAt,
    facets: {},
  };
}

function worksWithLabels(values: readonly string[]): string[] {
  return PLUGIN_WORKS_WITH_ORDER.filter((value) => values.includes(value)).map(
    (value) => PLUGIN_WORKS_WITH_LABELS[value] ?? value,
  );
}

function toComponents(entry: PluginDirectoryEntry): DirectoryPluginComponents {
  const components = entry.runtime.components;
  return {
    skills: components.skills,
    commands: components.commands,
    agents: components.agents,
    hooks: components.hooks,
    mcpServers: components.mcpServers.map((server) => ({
      name: server.name,
      transport: server.transport,
    })),
    lspServers: components.lspServers,
  };
}

export function toPluginDetail(
  entry: PluginDirectoryEntry,
  installs: PluginInstallState,
): DirectoryPluginDetail {
  const installed = isPluginInstalled(entry, installs);
  const installable = isPluginEntryWebInstallable(entry);
  return {
    kind: 'plugin',
    id: entry.id,
    name: entry.name,
    publisher: entry.publisher.name,
    description: entry.description,
    verified: entry.verified,
    ...(entry.installs === null ? {} : { installCount: entry.installs }),
    examplePrompts: entry.examplePrompts,
    components: toComponents(entry),
    installCommand: entry.installCommand,
    runtimeNote: entry.runtime.note,
    homepageUrl: entry.homepageUrl ?? null,
    repositoryUrl: entry.repositoryUrl,
    marketplaceName: entry.marketplace?.name ?? null,
    marketplaceUrl: entry.marketplace?.repositoryUrl ?? null,
    worksWith: worksWithLabels(entry.worksWith),
    installed,
    installable,
    ...(installed || installable ? {} : { availabilityNote: availabilityLabel(entry) }),
  };
}

export function toUserMarketplaceDetail(
  entry: PluginMarketplaceEntry,
  source: PluginMarketplaceSourceSummary | undefined,
  installs: PluginInstallState,
): DirectoryPluginDetail {
  return {
    kind: 'plugin',
    id: entry.id,
    name: entry.name,
    ...(source ? { publisher: source.name } : {}),
    description: entry.description,
    examplePrompts: entry.examplePrompts,
    components: {
      skills: entry.declaredSkills,
      commands: 0,
      agents: entry.agents.length,
      hooks: false,
      mcpServers: [],
      lspServers: [],
    },
    repositoryUrl: source?.repositoryUrl ?? null,
    installed: installs.byEntryId.has(entry.id),
    installable: true,
  };
}

export function pluginCountLabel(count: number): string {
  return `${count.toLocaleString()} ${PLUGIN_COUNT_SUFFIX}`;
}

export function pluginSourceChips(
  sources: readonly PluginMarketplaceSourceSummary[],
): DirectorySourceChip[] {
  return [
    { id: DIRECTORY_SOURCE_ALL_ID, label: DIRECTORY_SOURCE_ALL_LABEL },
    ...PLUGIN_SOURCE_FACETS.map((facet) => ({
      id: facet,
      label: PLUGIN_SOURCE_TAB_LABELS[facet] ?? facet,
    })),
    ...sources.map((source) => ({ id: source.id, label: source.name, removable: true })),
  ];
}

export function pluginWorksWithFilter(stats: PluginDirectoryStats | null): DirectoryFilterGroup {
  const options = PLUGIN_WORKS_WITH_ORDER.filter(
    (value) => stats === null || (stats.byWorksWith[value as PluginWorksWith] ?? 0) > 0,
  ).map((value) => ({ value, label: PLUGIN_WORKS_WITH_LABELS[value] ?? value }));
  return {
    id: PLUGIN_WORKS_WITH_GROUP_ID,
    label: PLUGIN_WORKS_WITH_GROUP_LABEL,
    options,
    exclusive: true,
  };
}

export function initialPluginSection(): DirectorySection {
  return {
    entries: [],
    installable: true,
    remote: true,
    sources: pluginSourceChips([]),
    filterGroups: [pluginWorksWithFilter(null)],
    sortOptions: PLUGIN_SORT_OPTIONS,
  };
}

export interface PluginSectionInput {
  query: DirectoryQuery;
  builtin: readonly PluginDirectoryEntry[];
  partner: readonly PluginDirectoryEntry[];
  marketplace: PluginMarketplacePage | null;
  stats: PluginDirectoryStats | null;
  user: UserMarketplaceState;
  installs: PluginInstallState;
}

interface PluginGroupSlice {
  group: DirectoryGroup;
  entries: DirectoryEntry[];
  remote: boolean;
}

function localMatcher(request: PluginDirectoryRequest): (entry: DirectoryEntry) => boolean {
  return (entry) =>
    matchesDirectorySearch(entry, request.search) &&
    (request.worksWith === null ||
      (entry.facets?.[PLUGIN_WORKS_WITH_GROUP_ID] ?? EMPTY_STRINGS).includes(request.worksWith));
}

function facetGroup(facet: PluginSourceFacet): DirectoryGroup {
  return { id: facet, heading: PLUGIN_GROUP_HEADINGS[facet] ?? facet };
}

export function toPluginSection({
  query,
  builtin,
  partner,
  marketplace,
  stats,
  user,
  installs,
}: PluginSectionInput): DirectorySection {
  const request = toPluginRequest(query);
  const userSourceId = userMarketplaceSourceId(query);
  const matches = localMatcher(request);
  const sourcesById = new Map(user.sources.map((source) => [source.id, source]));
  const local = (entries: readonly PluginDirectoryEntry[]): DirectoryEntry[] =>
    sortDirectoryEntries(
      entries.map((entry) => toPluginEntry(entry, installs)).filter(matches),
      query.sort,
    );
  const userEntries = (entries: readonly PluginMarketplaceEntry[]): DirectoryEntry[] =>
    sortDirectoryEntries(
      entries
        .map((entry) => toUserMarketplaceEntry(entry, sourcesById.get(entry.sourceId), installs))
        .filter(matches),
      query.sort,
    );

  const slices: PluginGroupSlice[] = [];
  let catalogHeading: string | undefined;
  if (userSourceId) {
    const source = sourcesById.get(userSourceId);
    catalogHeading = source?.name;
    slices.push({
      group: { id: PLUGIN_USER_GROUP_ID, heading: PLUGIN_USER_GROUP_HEADING },
      entries: userEntries(user.entries.filter((entry) => entry.sourceId === userSourceId)),
      remote: false,
    });
  } else {
    const facet = request.source;
    if (facet !== null) catalogHeading = PLUGIN_GROUP_HEADINGS[facet];
    if (facet === null || facet === PLUGIN_SOURCE_BUILTIN) {
      slices.push({
        group: facetGroup(PLUGIN_SOURCE_BUILTIN),
        entries: local(builtin),
        remote: false,
      });
    }
    if (facet === null || facet === PLUGIN_SOURCE_PARTNER) {
      slices.push({
        group: facetGroup(PLUGIN_SOURCE_PARTNER),
        entries: local(partner),
        remote: false,
      });
    }
    if (facet === null || facet === PLUGIN_SOURCE_MARKETPLACE) {
      slices.push({
        group: facetGroup(PLUGIN_SOURCE_MARKETPLACE),
        entries: (marketplace?.entries ?? []).map((entry) => toPluginEntry(entry, installs)),
        remote: true,
      });
    }
    if (facet === null && user.entries.length > 0) {
      slices.push({
        group: { id: PLUGIN_USER_GROUP_ID, heading: PLUGIN_USER_GROUP_HEADING },
        entries: userEntries(user.entries),
        remote: false,
      });
    }
  }

  const entries = slices.flatMap((slice) =>
    slice.entries.map((entry) => ({ ...entry, groupId: slice.group.id })),
  );
  const remote = slices.find((slice) => slice.remote);
  const localCount = slices
    .filter((slice) => !slice.remote)
    .reduce((sum, slice) => sum + slice.entries.length, 0);
  const total = remote ? (marketplace?.total ?? 0) + localCount : localCount;
  const grouped = !userSourceId && request.source === null;
  const facetCount = request.source ? stats?.bySource[request.source] : stats?.totalPlugins;
  const countLabel = userSourceId
    ? pluginCountLabel(entries.length)
    : typeof facetCount === 'number'
      ? pluginCountLabel(facetCount)
      : undefined;

  return {
    ...initialPluginSection(),
    entries,
    sources: pluginSourceChips(user.sources),
    filterGroups: [pluginWorksWithFilter(stats)],
    total,
    hasMore: remote !== undefined && marketplace?.nextCursor != null,
    ...(countLabel ? { countLabel } : {}),
    ...(grouped ? { groups: slices.map((slice) => slice.group) } : {}),
    ...(catalogHeading ? { catalogHeading } : {}),
  };
}

export function withInstallBlock(
  entry: PluginDirectoryEntry,
  message: string,
  installCommand: string | null,
): PluginDirectoryEntry {
  return {
    ...entry,
    webInstallable: false,
    installCommand: installCommand ?? entry.installCommand,
    runtime: { ...entry.runtime, webInstallable: false, note: message },
  };
}

export type PluginInstallTarget =
  | { kind: 'builtin'; pluginId: string }
  | { kind: 'directory'; pluginId: string }
  | { kind: 'user'; entryId: string };

export type PluginInstallOutcome =
  | { status: 'installed' }
  | { status: 'disabled'; message: string }
  | { status: 'blocked'; message: string; installCommand: string | null };

function messageFor(status: number, body: ErrorBody, fallback: string): string {
  const message = body.error?.message;
  return PLUGIN_MESSAGE_STATUSES.includes(status) && message ? message : fallback;
}

export async function installPlugin(
  target: PluginInstallTarget,
  csrfToken: string,
): Promise<PluginInstallOutcome> {
  const path =
    target.kind === 'builtin' ? PLUGIN_INSTALLATIONS_PATH : PLUGIN_MARKETPLACE_INSTALLATIONS_PATH;
  const body = target.kind === 'user' ? { entryId: target.entryId } : { pluginId: target.pluginId };
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    body: JSON.stringify(body),
  });
  if (response.ok) return { status: 'installed' };
  const payload = await readErrorBody(response);
  const code = payload.error?.code;
  if (
    response.status === PLUGIN_INSTALLS_DISABLED_STATUS &&
    code === PLUGIN_INSTALLS_DISABLED_CODE
  ) {
    return {
      status: 'disabled',
      message: messageFor(response.status, payload, PLUGIN_INSTALL_FAILED_COPY),
    };
  }
  if (response.status === PLUGIN_CONFLICT_STATUS && code === PLUGIN_NOT_INSTALLABLE_CODE) {
    return {
      status: 'blocked',
      message: messageFor(response.status, payload, PLUGIN_INSTALL_FAILED_COPY),
      installCommand:
        typeof payload.error?.installCommand === 'string' ? payload.error.installCommand : null,
    };
  }
  throw new DirectoryRequestError(
    response.status,
    messageFor(response.status, payload, PLUGIN_INSTALL_FAILED_COPY),
  );
}

export type PluginUninstallTarget =
  | { kind: 'builtin'; pluginId: string }
  | { kind: 'installation'; installationId: string };

export type PluginUninstallOutcome =
  | { status: 'removed' }
  | { status: 'disabled'; message: string };

export async function uninstallPlugin(
  target: PluginUninstallTarget,
  csrfToken: string,
): Promise<PluginUninstallOutcome> {
  const path =
    target.kind === 'builtin'
      ? `${PLUGIN_INSTALLATIONS_PATH}/${encodeURIComponent(target.pluginId)}`
      : `${PLUGIN_MARKETPLACE_INSTALLATIONS_PATH}/${encodeURIComponent(target.installationId)}`;
  const response = await fetch(path, { method: 'DELETE', headers: { [CSRF_HEADER]: csrfToken } });
  if (response.ok) return { status: 'removed' };
  const payload = await readErrorBody(response);
  if (
    response.status === PLUGIN_INSTALLS_DISABLED_STATUS &&
    payload.error?.code === PLUGIN_INSTALLS_DISABLED_CODE
  ) {
    return {
      status: 'disabled',
      message: messageFor(response.status, payload, PLUGIN_UNINSTALL_FAILED_COPY),
    };
  }
  throw new DirectoryRequestError(
    response.status,
    messageFor(response.status, payload, PLUGIN_UNINSTALL_FAILED_COPY),
  );
}
