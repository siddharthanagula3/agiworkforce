import {
  COMMUNITY_PLUGINS_PATH,
  MEMBER_ORGANIZATION_PLUGINS_PATH,
  PLUGIN_SUBMISSIONS_PATH,
  pluginSubmissionPath,
  type CommunityPlugin,
  type CommunityPluginPatch,
  type CommunityPluginsResponse,
  type MemberOrganizationPlugin,
  type MemberOrganizationPluginPatch,
  type MemberOrganizationPluginsResponse,
  type PluginConnectorRegistration,
  type PluginInstalledDependency,
  type PluginMarketplaceEntry,
  type PluginMarketplaceInstallation,
  type PluginMarketplaceSourceSummary,
  type PluginScanResponse,
  type PluginSubmissionResponse,
  type PluginSubmissionsResponse,
  type PluginSubmissionSummary,
  type PluginVersionsResponse,
} from '@agiworkforce/cloud-contracts';
import {
  isPluginEntryWebInstallable,
  type PluginInstallation,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import {
  COMMUNITY_BADGE,
  DIRECTORY_CATEGORY_FILTER_ID,
  DIRECTORY_PUBLISHER_FILTER_ID,
  DIRECTORY_SOURCE_ALL_ID,
  DIRECTORY_SOURCE_ALL_LABEL,
  UPDATE_BADGE,
  matchesDirectorySearch,
  sortDirectoryEntries,
  type DirectoryBadgeKind,
  type DirectoryEntry,
  type DirectoryFilterGroup,
  type DirectoryGroup,
  type DirectoryManageRow,
  type DirectoryPluginComponents,
  type DirectoryPluginDetail,
  type DirectoryPluginScan,
  type DirectoryPluginSubmission,
  type DirectoryPluginVersions,
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
import type { PluginUpdateOffer } from '@/lib/services/plugin-lifecycle';
import {
  PLUGIN_TARGET_BUILTIN,
  PLUGIN_TARGET_MARKETPLACE,
  type PluginInstallationTarget,
} from '@/features/plugins/routes';

import {
  CSRF_HEADER,
  DIRECTORY_PAGE_SIZE,
  DIRECTORY_QUERY_CATEGORY,
  DIRECTORY_QUERY_CURSOR,
  DIRECTORY_QUERY_LIMIT,
  DIRECTORY_QUERY_PUBLISHER,
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
  PLUGIN_SOURCE_KIND_AUTHORED,
  PLUGIN_SOURCE_KIND_REPOSITORY,
  PLUGIN_MARKETPLACE_ENTRIES_PATH,
  PLUGIN_MARKETPLACE_INSTALLATIONS_PATH,
  PLUGIN_MESSAGE_STATUSES,
  PLUGIN_NOT_INSTALLABLE_CODE,
  PLUGIN_CATEGORY_GROUP_LABEL,
  PLUGIN_PUBLISHED_STATUS,
  PLUGIN_PUBLISHER_GROUP_LABEL,
  PLUGIN_PUBLISHER_KIND_LABELS,
  PLUGIN_PUBLISHER_MORE_HEADING_PREFIX,
  PLUGIN_PERMISSIONS_NOTICE_PREFIX,
  PLUGIN_PERMISSIONS_NOTICE_SUFFIX,
  PLUGIN_SOURCE_BUILTIN,
  PLUGIN_SOURCE_FACETS,
  PLUGIN_SOURCE_MARKETPLACE,
  PLUGIN_SOURCE_PARTNER,
  PLUGIN_SOURCE_TAB_LABELS,
  PLUGIN_STATE_DESKTOP_AND_CLI,
  PLUGIN_STATE_INSTALL,
  PLUGIN_STATE_INSTALLED,
  PLUGIN_STATE_REQUIRED,
  PLUGIN_STATE_TURNED_OFF,
  PLUGIN_UNINSTALL_FAILED_COPY,
  PLUGIN_UNPUBLISHED_LABEL,
  PLUGIN_SCAN_LEAF,
  PLUGIN_UPDATES_PATH,
  PLUGIN_UPDATE_FAILED_COPY,
  PLUGIN_VERSIONS_LEAF,
  PLUGIN_USER_GROUP_HEADING,
  PLUGIN_USER_GROUP_ID,
  PLUGIN_WORKS_WITH_GROUP_ID,
  PLUGIN_WORKS_WITH_GROUP_LABEL,
  PLUGIN_WORKS_WITH_LABELS,
  PLUGIN_WORKS_WITH_ORDER,
  PLUGIN_COMMUNITY_GROUP_HEADING,
  PLUGIN_COMMUNITY_GROUP_ID,
  PLUGIN_COMMUNITY_INSTALL_NOTICE,
  PLUGIN_SUBMISSION_STATUS_LABELS,
  PLUGIN_SUBMIT_FAILED_COPY,
  PLUGIN_WITHDRAW_FAILED_COPY,
  PLUGIN_WORKSPACE_AVAILABLE_NOTE,
  PLUGIN_WORKSPACE_DEFAULT_NOTE,
  PLUGIN_WORKSPACE_GROUP_ID,
  PLUGIN_WORKSPACE_PUBLISHER,
  PLUGIN_WORKSPACE_REQUIRED_NOTE,
  workspaceGroupHeading,
} from '../constants';
import { DirectoryRequestError } from './request-error';

const VERIFIED_BADGE: DirectoryBadgeKind = 'verified';
const BUILTIN_PUBLISHER_KIND = 'first-party';
const EMPTY_STRINGS: readonly string[] = [];

export const PLUGIN_SORT_OPTIONS: readonly DirectorySortKey[] = [DIRECTORY_SORT_NAME];

export const DEFAULT_PLUGIN_QUERY: DirectoryQuery = {
  search: '',
  sourceId: null,
  selection: {},
  sort: DIRECTORY_SORT_NAME,
  toggles: {},
};

export interface PluginDirectoryRequest {
  search: string;
  source: PluginSourceFacet | null;
  worksWith: PluginWorksWith | null;
  category: string | null;
  publisher: string | null;
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
  builtin: readonly PluginInstallation[];
  builtinIds: ReadonlyMap<string, boolean>;
  byPluginKey: ReadonlyMap<string, PluginMarketplaceInstallation>;
  byEntryId: ReadonlyMap<string, PluginMarketplaceInstallation>;
  updates: ReadonlyMap<string, PluginUpdateOffer>;
  notice: string | null;
}

export interface UserMarketplaceState {
  sources: PluginMarketplaceSourceSummary[];
  entries: PluginMarketplaceEntry[];
}

export const EMPTY_INSTALL_STATE: PluginInstallState = {
  builtin: [],
  builtinIds: new Map(),
  byPluginKey: new Map(),
  byEntryId: new Map(),
  updates: new Map(),
  notice: null,
};

export const EMPTY_USER_MARKETPLACES: UserMarketplaceState = { sources: [], entries: [] };

export const EMPTY_WORKSPACE_PLUGINS: MemberOrganizationPluginsResponse = {
  organizationId: null,
  organizationName: null,
  plugins: [],
};

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
    category: query.selection[DIRECTORY_CATEGORY_FILTER_ID]?.[0] ?? null,
    publisher: query.selection[DIRECTORY_PUBLISHER_FILTER_ID]?.[0] ?? null,
    sort: DIRECTORY_SORT_NAME,
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
  if (request.category) params.set(DIRECTORY_QUERY_CATEGORY, request.category);
  if (request.publisher) params.set(DIRECTORY_QUERY_PUBLISHER, request.publisher);
  params.set(DIRECTORY_QUERY_SORT, request.sort);
  params.set(DIRECTORY_QUERY_LIMIT, String(request.limit ?? DIRECTORY_PAGE_SIZE));
  if (request.cursor) params.set(DIRECTORY_QUERY_CURSOR, request.cursor);
  return `${PLUGINS_PATH}?${params.toString()}`;
}

export function facetRequest(source: PluginSourceFacet): PluginDirectoryRequest {
  return {
    search: '',
    source,
    worksWith: null,
    category: null,
    publisher: null,
    sort: DIRECTORY_SORT_NAME,
    cursor: null,
  };
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
  const byCategory: Record<string, number> = {};
  let verified = 0;
  for (const entry of entries) {
    bySource[entry.sourceFacet] += 1;
    if (entry.verified) verified += 1;
    for (const value of entry.worksWith) byWorksWith[value] += 1;
    const category = pluginCategoryKey(entry);
    if (category) byCategory[category] = (byCategory[category] ?? 0) + 1;
  }
  return { totalPlugins: entries.length, verified, bySource, byWorksWith, byCategory };
}

function pluginCategoryKey(entry: PluginDirectoryEntry): string {
  return entry.category.trim().toLowerCase();
}

export function pluginCategoryLabel(category: string): string {
  const words = category.trim().replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
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
        agents: [],
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
  error?: {
    code?: string;
    message?: string;
    installCommand?: string | null;
    dependents?: unknown;
  };
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
  return (await response.json().catch(() => ({}))) as ErrorBody;
}

export async function fetchPluginInstallState(): Promise<PluginInstallState> {
  const [builtin, marketplace, offers] = await Promise.all([
    fetch(PLUGIN_INSTALLATIONS_PATH, { cache: 'no-store' }).catch(() => null),
    fetch(PLUGIN_MARKETPLACE_INSTALLATIONS_PATH, { cache: 'no-store' }).catch(() => null),
    readOptional<{ updates?: PluginUpdateOffer[] }>(PLUGIN_UPDATES_PATH),
  ]);
  const updates = new Map((offers?.updates ?? []).map((offer) => [offer.pluginId, offer]));
  const builtinInstallations: PluginInstallation[] = [];
  const builtinIds = new Map<string, boolean>();
  if (builtin?.ok) {
    const body = (await builtin.json().catch(() => ({}))) as {
      installations?: PluginInstallation[];
    };
    for (const installation of body.installations ?? []) {
      builtinInstallations.push(installation);
      builtinIds.set(installation.pluginId, installation.enabled !== false);
    }
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
  return { builtin: builtinInstallations, builtinIds, byPluginKey, byEntryId, updates, notice };
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

export async function fetchWorkspacePlugins(): Promise<MemberOrganizationPluginsResponse> {
  return (
    (await readOptional<MemberOrganizationPluginsResponse>(MEMBER_ORGANIZATION_PLUGINS_PATH)) ??
    EMPTY_WORKSPACE_PLUGINS
  );
}

export async function updateWorkspacePlugin(
  id: string,
  patch: MemberOrganizationPluginPatch,
  csrfToken: string,
): Promise<MemberOrganizationPlugin> {
  const response = await fetch(`${MEMBER_ORGANIZATION_PLUGINS_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    body: JSON.stringify(patch),
  });
  const body = (await response.json().catch(() => ({}))) as {
    plugin?: MemberOrganizationPlugin;
    error?: { message?: string };
  };
  if (!response.ok || !body.plugin) {
    throw new DirectoryRequestError(
      response.status,
      body.error?.message ?? PLUGIN_INSTALL_FAILED_COPY,
    );
  }
  return body.plugin;
}

function workspacePublisher(workspace: MemberOrganizationPluginsResponse): string {
  return workspace.organizationName ?? PLUGIN_WORKSPACE_PUBLISHER;
}

function workspaceStatusLabel(plugin: MemberOrganizationPlugin): string {
  if (plugin.installPreference === 'required') return PLUGIN_STATE_REQUIRED;
  if (!plugin.installed) return PLUGIN_STATE_INSTALL;
  return plugin.enabled ? PLUGIN_STATE_INSTALLED : PLUGIN_STATE_TURNED_OFF;
}

export function toWorkspacePluginEntry(
  plugin: MemberOrganizationPlugin,
  workspace: MemberOrganizationPluginsResponse,
): DirectoryEntry {
  return {
    id: plugin.id,
    name: plugin.name,
    publisher: workspacePublisher(workspace),
    description: plugin.description,
    monogram: monogramOf(plugin.name),
    installed: plugin.installed,
    installable: true,
    statusLabel: workspaceStatusLabel(plugin),
    updatedAt: plugin.updatedAt,
    facets: {},
  };
}

function workspaceNote(plugin: MemberOrganizationPlugin): string {
  if (plugin.installPreference === 'required') return PLUGIN_WORKSPACE_REQUIRED_NOTE;
  return plugin.installPreference === 'installed_by_default'
    ? PLUGIN_WORKSPACE_DEFAULT_NOTE
    : PLUGIN_WORKSPACE_AVAILABLE_NOTE;
}

export function toWorkspacePluginDetail(
  plugin: MemberOrganizationPlugin,
  workspace: MemberOrganizationPluginsResponse,
): DirectoryPluginDetail {
  return {
    kind: 'plugin',
    id: plugin.id,
    name: plugin.name,
    publisher: workspacePublisher(workspace),
    description: plugin.description,
    version: plugin.version,
    enabled: plugin.enabled,
    examplePrompts: [],
    components: {
      skills: plugin.skills,
      commands: 0,
      agents: 0,
      hooks: false,
      mcpServers: [],
      lspServers: [],
    },
    sourceLabel: workspacePublisher(workspace),
    updatedAt: plugin.updatedAt,
    installed: plugin.installed,
    installable: true,
    removable: plugin.installPreference === 'available',
    locked: plugin.installPreference === 'required',
    managedNote: workspaceNote(plugin),
  };
}

export async function fetchCommunityPlugins(): Promise<CommunityPlugin[]> {
  return (await readOptional<CommunityPluginsResponse>(COMMUNITY_PLUGINS_PATH))?.plugins ?? [];
}

export async function fetchPluginSubmissions(): Promise<PluginSubmissionSummary[]> {
  return (
    (await readOptional<PluginSubmissionsResponse>(PLUGIN_SUBMISSIONS_PATH))?.submissions ?? []
  );
}

async function sendJson<T>(
  path: string,
  method: string,
  body: unknown,
  csrfToken: string,
  failureCopy: string,
): Promise<T | null> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const failure = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new DirectoryRequestError(response.status, failure.error?.message ?? failureCopy);
  }
  return response.status === 204 ? null : ((await response.json()) as T);
}

export async function updateCommunityPlugin(
  id: string,
  patch: CommunityPluginPatch,
  csrfToken: string,
): Promise<void> {
  await sendJson(
    `${COMMUNITY_PLUGINS_PATH}/${encodeURIComponent(id)}`,
    'PATCH',
    patch,
    csrfToken,
    PLUGIN_INSTALL_FAILED_COPY,
  );
}

export async function submitPluginForReview(
  entryId: string,
  csrfToken: string,
): Promise<PluginSubmissionSummary | null> {
  const body = await sendJson<PluginSubmissionResponse>(
    PLUGIN_SUBMISSIONS_PATH,
    'POST',
    { entryId },
    csrfToken,
    PLUGIN_SUBMIT_FAILED_COPY,
  );
  return body?.submission ?? null;
}

export async function withdrawPluginSubmission(id: string, csrfToken: string): Promise<void> {
  await sendJson(
    pluginSubmissionPath(id),
    'DELETE',
    undefined,
    csrfToken,
    PLUGIN_WITHDRAW_FAILED_COPY,
  );
}

export function latestSubmissionFor(
  submissions: readonly PluginSubmissionSummary[],
  entryId: string,
): PluginSubmissionSummary | undefined {
  return submissions
    .filter((submission) => submission.entryId === entryId)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0];
}

function toSubmissionDetail(submission: PluginSubmissionSummary): DirectoryPluginSubmission {
  return {
    statusLabel: PLUGIN_SUBMISSION_STATUS_LABELS[submission.status] ?? submission.status,
    note: submission.reviewNote,
    withdrawable: submission.status === 'pending' || submission.status === 'approved',
  };
}

function communityStatusLabel(plugin: CommunityPlugin): string {
  if (!plugin.installed) return PLUGIN_STATE_INSTALL;
  return plugin.enabled ? PLUGIN_STATE_INSTALLED : PLUGIN_STATE_TURNED_OFF;
}

export function toCommunityPluginEntry(plugin: CommunityPlugin): DirectoryEntry {
  return {
    id: plugin.id,
    name: plugin.name,
    publisher: plugin.publisherName,
    description: plugin.description,
    monogram: monogramOf(plugin.name),
    badges: [COMMUNITY_BADGE],
    installed: plugin.installed,
    installable: true,
    statusLabel: communityStatusLabel(plugin),
    ...(plugin.installed ? {} : { installNotice: PLUGIN_COMMUNITY_INSTALL_NOTICE }),
    ...(plugin.approvedAt ? { updatedAt: plugin.approvedAt } : {}),
    facets: plugin.category ? { [DIRECTORY_CATEGORY_FILTER_ID]: [plugin.category] } : {},
  };
}

export function toCommunityPluginDetail(plugin: CommunityPlugin): DirectoryPluginDetail {
  return {
    kind: 'plugin',
    id: plugin.id,
    name: plugin.name,
    publisher: plugin.publisherName,
    description: plugin.description,
    community: true,
    ...(plugin.category ? { category: plugin.category } : {}),
    version: plugin.version,
    enabled: plugin.enabled,
    scan: {
      verdict: plugin.scanVerdict,
      findings: [
        ...new Set(
          plugin.scanFindings.map(
            (finding) => `${finding.path}:${finding.line} ${finding.message}`,
          ),
        ),
      ],
      scannedAt: plugin.approvedAt ?? '',
    },
    examplePrompts: [],
    components: {
      skills: plugin.skills,
      commands: 0,
      agents: 0,
      hooks: false,
      mcpServers: [],
      lspServers: [],
    },
    sourceLabel: PLUGIN_COMMUNITY_GROUP_HEADING,
    ...(plugin.approvedAt ? { updatedAt: plugin.approvedAt } : {}),
    installed: plugin.installed,
    installable: true,
  };
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

function permissionsNotice(permissions: readonly string[]): string | null {
  return permissions.length > 0
    ? `${PLUGIN_PERMISSIONS_NOTICE_PREFIX} ${permissions.join(', ')}. ${PLUGIN_PERMISSIONS_NOTICE_SUFFIX}`
    : null;
}

function isCommunityPlugin(entry: PluginDirectoryEntry): boolean {
  return !entry.verified && entry.sourceFacet === PLUGIN_SOURCE_MARKETPLACE;
}

function pluginBadges(
  entry: PluginDirectoryEntry,
  installs: PluginInstallState,
): DirectoryBadgeKind[] {
  const badges: DirectoryBadgeKind[] = [];
  if (entry.verified) badges.push(VERIFIED_BADGE);
  else if (isCommunityPlugin(entry)) badges.push(COMMUNITY_BADGE);
  if (installs.updates.has(entry.id)) badges.push(UPDATE_BADGE);
  return badges;
}

export function toPluginEntry(
  entry: PluginDirectoryEntry,
  installs: PluginInstallState,
): DirectoryEntry {
  const installed = isPluginInstalled(entry, installs);
  const installable = isPluginEntryWebInstallable(entry);
  const badges = pluginBadges(entry, installs);
  const category = pluginCategoryKey(entry);
  const notice = installed ? null : permissionsNotice(entry.permissions);
  return {
    id: entry.id,
    name: entry.name,
    publisher: entry.publisher.name,
    description: entry.description,
    monogram: monogramOf(entry.name),
    ...(badges.length > 0 ? { badges } : {}),
    sourceId: entry.sourceFacet,
    groupId: entry.sourceFacet,
    installed,
    installable,
    statusLabel: pluginStateLabel(entry, installed, installable),
    ...(notice ? { installNotice: notice } : {}),
    updatedAt: entry.updatedAt,
    facets: {
      [PLUGIN_WORKS_WITH_GROUP_ID]: entry.worksWith,
      [DIRECTORY_CATEGORY_FILTER_ID]: category ? [category] : EMPTY_STRINGS,
      [DIRECTORY_PUBLISHER_FILTER_ID]: [entry.publisher.id],
    },
  };
}

export function toUserMarketplaceEntry(
  entry: PluginMarketplaceEntry,
  source: PluginMarketplaceSourceSummary | undefined,
  installs: PluginInstallState,
): DirectoryEntry {
  const installed = installs.byEntryId.has(entry.id);
  const notice = installed ? null : permissionsNotice(entry.permissions);
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
    ...(notice ? { installNotice: notice } : {}),
    updatedAt: entry.updatedAt,
    facets: {},
  };
}

export interface PluginManageInput {
  builtin: readonly PluginDirectoryEntry[];
  partner: readonly PluginDirectoryEntry[];
  marketplace: readonly PluginDirectoryEntry[];
  details: readonly PluginDirectoryEntry[];
  user: UserMarketplaceState;
  installs: PluginInstallState;
  workspace?: MemberOrganizationPluginsResponse;
  community?: readonly CommunityPlugin[];
}

function findRecord(input: PluginManageInput, id: string): PluginDirectoryEntry | undefined {
  return (
    input.builtin.find((entry) => entry.id === id) ??
    input.partner.find((entry) => entry.id === id) ??
    input.marketplace.find((entry) => entry.id === id) ??
    input.details.find((entry) => entry.id === id)
  );
}

function recordManageRow(
  record: PluginDirectoryEntry,
  updatedAt: string | undefined,
): DirectoryManageRow {
  return {
    id: record.id,
    name: record.name,
    author: record.publisher.name,
    skillCount: record.runtime.components.skills.length,
    ...((updatedAt ?? record.updatedAt) ? { updatedAt: updatedAt ?? record.updatedAt } : {}),
  };
}

export function toPluginManageRows(input: PluginManageInput): DirectoryManageRow[] {
  const rows: DirectoryManageRow[] = [];
  const seen = new Set<string>();
  const push = (row: DirectoryManageRow) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  for (const installation of input.installs.builtin) {
    const record = findRecord(input, installation.pluginId);
    push(
      record
        ? recordManageRow(record, installation.updatedAt)
        : {
            id: installation.pluginId,
            name: installation.pluginId,
            updatedAt: installation.updatedAt,
          },
    );
  }

  for (const installation of input.installs.byPluginKey.values()) {
    const record = findRecord(input, installation.pluginKey);
    if (record) {
      push(recordManageRow(record, installation.updatedAt));
      continue;
    }
    const entry = input.user.entries.find((candidate) => candidate.id === installation.entryId);
    const source = entry
      ? input.user.sources.find((candidate) => candidate.id === entry.sourceId)
      : undefined;
    push({
      id: entry?.id ?? installation.entryId,
      name: entry?.name ?? installation.pluginKey,
      ...(source ? { author: source.name } : {}),
      skillCount: entry?.declaredSkills.length ?? installation.enabledSkills.length,
      updatedAt: installation.updatedAt,
    });
  }

  for (const plugin of input.community ?? []) {
    if (!plugin.installed) continue;
    push({
      id: plugin.id,
      name: plugin.name,
      author: plugin.publisherName,
      skillCount: plugin.skills.length,
      ...(plugin.approvedAt ? { updatedAt: plugin.approvedAt } : {}),
    });
  }

  const workspace = input.workspace ?? EMPTY_WORKSPACE_PLUGINS;
  for (const plugin of workspace.plugins) {
    if (!plugin.installed) continue;
    push({
      id: plugin.id,
      name: plugin.name,
      author: workspacePublisher(workspace),
      skillCount: plugin.skills.length,
      updatedAt: plugin.updatedAt,
    });
  }

  return rows.sort((left, right) => left.name.localeCompare(right.name));
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
    agents: components.agents.length,
    hooks: components.hooks,
    mcpServers: components.mcpServers.map((server) => ({
      name: server.name,
      transport: server.transport,
    })),
    lspServers: components.lspServers,
  };
}

export function pluginInstallationEnabled(
  entry: PluginDirectoryEntry,
  installs: PluginInstallState,
): boolean {
  return entry.sourceFacet === PLUGIN_SOURCE_BUILTIN
    ? (installs.builtinIds.get(entry.id) ?? true)
    : (installs.byPluginKey.get(entry.id)?.enabled ?? true);
}

export function pluginInstallationTarget(
  entry: PluginDirectoryEntry,
  installs: PluginInstallState,
): PluginInstallationTarget | null {
  if (entry.sourceFacet === PLUGIN_SOURCE_BUILTIN) {
    return installs.builtinIds.has(entry.id)
      ? { kind: PLUGIN_TARGET_BUILTIN, pluginId: entry.id }
      : null;
  }
  const installation = installs.byPluginKey.get(entry.id);
  return installation ? { kind: PLUGIN_TARGET_MARKETPLACE, installationId: installation.id } : null;
}

export function toPluginDetail(
  entry: PluginDirectoryEntry,
  installs: PluginInstallState,
): DirectoryPluginDetail {
  const installed = isPluginInstalled(entry, installs);
  const installable = isPluginEntryWebInstallable(entry);
  const category = pluginCategoryKey(entry);
  const kindLabel = PLUGIN_PUBLISHER_KIND_LABELS[entry.publisher.kind];
  return {
    kind: 'plugin',
    id: entry.id,
    name: entry.name,
    publisher: entry.publisher.name,
    publisherProfile: {
      id: entry.publisher.id,
      name: entry.publisher.name,
      ...(kindLabel ? { kindLabel } : {}),
      url: entry.publisher.url ?? null,
    },
    description: entry.description,
    verified: entry.verified,
    community: isCommunityPlugin(entry),
    ...(category ? { category: pluginCategoryLabel(category) } : {}),
    ...(entry.permissions.length > 0 ? { permissions: entry.permissions } : {}),
    version: entry.version,
    ...(installed ? { enabled: pluginInstallationEnabled(entry, installs) } : {}),
    customizable: installed && pluginInstallationEnabled(entry, installs),
    examplePrompts: entry.examplePrompts,
    components: toComponents(entry),
    installCommand: entry.installCommand,
    runtimeNote: entry.runtime.note,
    homepageUrl: entry.homepageUrl ?? null,
    repositoryUrl: entry.repositoryUrl,
    marketplaceName: entry.marketplace?.name ?? null,
    marketplaceUrl: entry.marketplace?.repositoryUrl ?? null,
    sourceLabel: PLUGIN_SOURCE_TAB_LABELS[entry.sourceFacet] ?? entry.sourceFacet,
    sourceUrl: entry.marketplace?.repositoryUrl ?? null,
    updatedAt: entry.updatedAt,
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
  submission?: PluginSubmissionSummary,
): DirectoryPluginDetail {
  const installation = installs.byEntryId.get(entry.id);
  const authored = source?.kind === PLUGIN_SOURCE_KIND_AUTHORED;
  const owned = source !== undefined && source.kind !== PLUGIN_SOURCE_KIND_REPOSITORY;
  return {
    kind: 'plugin',
    id: entry.id,
    name: entry.name,
    ...(source ? { publisher: source.name } : {}),
    description: entry.description,
    ...(entry.permissions.length > 0 ? { permissions: entry.permissions } : {}),
    ...(installation ? { enabled: installation.enabled } : {}),
    editable: authored,
    customizable: installation?.enabled === true && !authored,
    submittable: owned && submission?.status !== 'pending',
    ...(owned && submission ? { submission: toSubmissionDetail(submission) } : {}),
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
    ...(source ? { sourceLabel: source.name } : {}),
    sourceUrl: source?.repositoryUrl ?? null,
    updatedAt: entry.updatedAt,
    installed: installation !== undefined,
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
    ...sources.map((source) => ({
      id: source.id,
      label: source.name,
      removable: true,
      refreshable: source.kind === PLUGIN_SOURCE_KIND_REPOSITORY,
    })),
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

export function pluginCategoryFilter(stats: PluginDirectoryStats | null): DirectoryFilterGroup {
  const options = Object.entries(stats?.byCategory ?? {})
    .filter(([, count]) => count > 0)
    .map(([value]) => ({ value, label: pluginCategoryLabel(value) }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return {
    id: DIRECTORY_CATEGORY_FILTER_ID,
    label: PLUGIN_CATEGORY_GROUP_LABEL,
    options,
    exclusive: true,
  };
}

export function pluginPublisherFilter(
  publisherId: string | null,
  entries: readonly PluginDirectoryEntry[],
): DirectoryFilterGroup | null {
  if (!publisherId) return null;
  const name = entries.find((entry) => entry.publisher.id === publisherId)?.publisher.name;
  return {
    id: DIRECTORY_PUBLISHER_FILTER_ID,
    label: PLUGIN_PUBLISHER_GROUP_LABEL,
    options: [{ value: publisherId, label: name ?? publisherId }],
    exclusive: true,
  };
}

export function initialPluginSection(): DirectorySection {
  return {
    entries: [],
    manage: { rows: [], loading: true },
    installable: true,
    remote: true,
    sources: pluginSourceChips([]),
    filterGroups: [pluginWorksWithFilter(null), pluginCategoryFilter(null)],
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
  workspace?: MemberOrganizationPluginsResponse;
  community?: readonly CommunityPlugin[];
}

interface PluginGroupSlice {
  group: DirectoryGroup;
  entries: DirectoryEntry[];
  remote: boolean;
}

function matchesFacet(entry: DirectoryEntry, groupId: string, value: string | null): boolean {
  return value === null || (entry.facets?.[groupId] ?? EMPTY_STRINGS).includes(value);
}

function localMatcher(request: PluginDirectoryRequest): (entry: DirectoryEntry) => boolean {
  return (entry) =>
    matchesDirectorySearch(entry, request.search) &&
    matchesFacet(entry, PLUGIN_WORKS_WITH_GROUP_ID, request.worksWith) &&
    matchesFacet(entry, DIRECTORY_CATEGORY_FILTER_ID, request.category) &&
    matchesFacet(entry, DIRECTORY_PUBLISHER_FILTER_ID, request.publisher);
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
  workspace = EMPTY_WORKSPACE_PLUGINS,
  community = [],
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
    if (facet === null && workspace.plugins.length > 0) {
      slices.push({
        group: {
          id: PLUGIN_WORKSPACE_GROUP_ID,
          heading: workspaceGroupHeading(workspace.organizationName),
        },
        entries: sortDirectoryEntries(
          workspace.plugins
            .map((plugin) => toWorkspacePluginEntry(plugin, workspace))
            .filter(matches),
          query.sort,
        ),
        remote: false,
      });
    }
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
    if (facet === null && community.length > 0) {
      slices.push({
        group: { id: PLUGIN_COMMUNITY_GROUP_ID, heading: PLUGIN_COMMUNITY_GROUP_HEADING },
        entries: sortDirectoryEntries(
          community.map(toCommunityPluginEntry).filter(matches),
          query.sort,
        ),
        remote: false,
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

  const publisherFilter = pluginPublisherFilter(request.publisher, [
    ...builtin,
    ...partner,
    ...(marketplace?.entries ?? []),
  ]);
  const publisherName = publisherFilter?.options[0]?.label;
  return {
    ...initialPluginSection(),
    entries,
    sources: pluginSourceChips(user.sources),
    filterGroups: [
      pluginWorksWithFilter(stats),
      pluginCategoryFilter(stats),
      ...(publisherFilter ? [publisherFilter] : []),
    ],
    total,
    hasMore: remote !== undefined && marketplace?.nextCursor != null,
    ...(countLabel ? { countLabel } : {}),
    ...(grouped ? { groups: slices.map((slice) => slice.group) } : {}),
    ...(publisherName
      ? { catalogHeading: `${PLUGIN_PUBLISHER_MORE_HEADING_PREFIX} ${publisherName}` }
      : catalogHeading
        ? { catalogHeading }
        : {}),
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
  | {
      status: 'installed';
      dependencies: PluginInstalledDependency[];
      connectors: PluginConnectorRegistration | null;
    }
  | { status: 'disabled'; message: string }
  | { status: 'blocked'; message: string; installCommand: string | null };

function messageFor(status: number, body: ErrorBody, fallback: string): string {
  const message = body.error?.message;
  return PLUGIN_MESSAGE_STATUSES.includes(status) && message ? message : fallback;
}

async function readInstalledOutcome(
  response: Response,
): Promise<Extract<PluginInstallOutcome, { status: 'installed' }>> {
  const body = (await response.json().catch(() => ({}))) as {
    dependencies?: PluginInstalledDependency[];
    connectors?: PluginConnectorRegistration;
  };
  return {
    status: 'installed',
    dependencies: Array.isArray(body.dependencies) ? body.dependencies : [],
    connectors: body.connectors ?? null,
  };
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
  if (response.ok) return readInstalledOutcome(response);
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
  { kind: 'builtin'; pluginId: string } | { kind: 'installation'; installationId: string };

export interface PluginDependentSummary {
  id: string;
  name: string;
}

export function dependentNames(dependents: readonly PluginDependentSummary[]): string {
  const names = dependents.map((dependent) => dependent.name);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const PLUGIN_HAS_DEPENDENTS_CODE = 'PLUGIN_HAS_DEPENDENTS';

export type PluginUninstallOutcome =
  | { status: 'removed' }
  | { status: 'disabled'; message: string }
  | { status: 'has-dependents'; message: string; dependents: PluginDependentSummary[] };

function readDependents(value: unknown): PluginDependentSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const { id, name } = (item ?? {}) as { id?: unknown; name?: unknown };
    return typeof id === 'string' && typeof name === 'string' ? [{ id, name }] : [];
  });
}

export async function uninstallPlugin(
  target: PluginUninstallTarget,
  csrfToken: string,
  withDependents = false,
): Promise<PluginUninstallOutcome> {
  const base =
    target.kind === 'builtin'
      ? `${PLUGIN_INSTALLATIONS_PATH}/${encodeURIComponent(target.pluginId)}`
      : `${PLUGIN_MARKETPLACE_INSTALLATIONS_PATH}/${encodeURIComponent(target.installationId)}`;
  const path = withDependents ? `${base}?withDependents=true` : base;
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
  const dependents = readDependents(payload.error?.dependents);
  if (
    response.status === PLUGIN_CONFLICT_STATUS &&
    payload.error?.code === PLUGIN_HAS_DEPENDENTS_CODE &&
    dependents.length > 0
  ) {
    return {
      status: 'has-dependents',
      message: messageFor(response.status, payload, PLUGIN_UNINSTALL_FAILED_COPY),
      dependents,
    };
  }
  throw new DirectoryRequestError(
    response.status,
    messageFor(response.status, payload, PLUGIN_UNINSTALL_FAILED_COPY),
  );
}

function pluginPath(id: string, leaf: string): string {
  return `${PLUGINS_PATH}/${encodeURIComponent(id)}/${leaf}`;
}

export async function fetchPluginScan(id: string): Promise<DirectoryPluginScan | null> {
  const body = await readOptional<PluginScanResponse>(pluginPath(id, PLUGIN_SCAN_LEAF));
  const scan = body?.scan;
  if (!scan) return null;
  return {
    verdict: scan.verdict,
    findings: [
      ...new Set(
        scan.findings.map((finding) => `${finding.path}:${finding.line} ${finding.message}`),
      ),
    ],
    scannedAt: scan.scannedAt,
  };
}

export async function fetchPluginVersions(
  id: string,
  latestVersion: string | null,
): Promise<DirectoryPluginVersions | null> {
  const body = await readOptional<PluginVersionsResponse>(pluginPath(id, PLUGIN_VERSIONS_LEAF));
  if (!body?.installedVersion) return null;
  const approved = new Set(body.approvedPermissions);
  const installedSkills = new Set(
    body.versions.find((version) => version.version === body.installedVersion)?.declaredSkills ??
      [],
  );
  return {
    installed: body.installedVersion,
    latest:
      latestVersion &&
      latestVersion !== body.installedVersion &&
      body.versions.some((version) => version.version === latestVersion)
        ? latestVersion
        : null,
    options: body.versions.map((version) => ({
      version: version.version,
      publishedAt: version.publishedAt,
      changelog: version.changelog,
      newPermissions: version.permissions.filter((permission) => !approved.has(permission)),
      addedSkills: version.declaredSkills.filter((skill) => !installedSkills.has(skill)),
      removedSkills: [...installedSkills].filter(
        (skill) => !version.declaredSkills.includes(skill),
      ),
    })),
  };
}

export async function applyPluginVersion(
  pluginId: string,
  toVersion: string,
  acknowledgedPermissions: readonly string[],
  csrfToken: string,
): Promise<void> {
  const response = await fetch(PLUGIN_UPDATES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    body: JSON.stringify({ pluginId, toVersion, acknowledgedPermissions }),
  });
  if (response.ok) return;
  const payload = await readErrorBody(response);
  throw new DirectoryRequestError(
    response.status,
    payload.error?.message ?? PLUGIN_UPDATE_FAILED_COPY,
  );
}
