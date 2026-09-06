'use client';

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { ManagedSkillSummary } from '@agiworkforce/cloud-contracts';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import type {
  PluginDirectoryEntry,
  PluginDirectoryStats,
} from '@/features/plugins/server/directory/types';

import {
  DirectoryActionNotice,
  type ConnectedConnector,
  type DirectoryAdapter,
  type DirectoryConnectorDetail,
  type DirectoryDetail,
  type DirectoryMarketplaceInput,
  type DirectoryMarketplaceResult,
  type DirectoryQuery,
  type DirectorySection,
  type DirectorySectionKey,
  type SettingsConnector,
} from '@agiworkforce/ui';

import { ConnectorApiKeyForm } from '@/features/connectors/components/ConnectorApiKeyForm';
import {
  currentConnectorReturnPath,
  withConnectorReturnPath,
} from '@features/connectors/hooks/use-connectors';
import { invalidateSkillsCatalog } from '@features/skills/services/skills-catalog';
import { announceSkillCatalogChanged } from '@shared/events/skill-catalog-events';
import { getCsrfToken } from '@/lib/client/csrf';

import { buildSettingsBrowseHash, skillFileDownloadHref } from '../routing';

import {
  CONNECTORS_FAILED_COPY,
  CONNECTORS_PATH,
  CONNECT_FAILED_COPY,
  CSRF_HEADER,
  JSON_CONTENT_TYPE,
  MARKETPLACE_FAILED_COPY,
  PLUGINS_FAILED_COPY,
  PLUGIN_INSTALL_FAILED_COPY,
  PLUGIN_UNINSTALL_FAILED_COPY,
  PLUGIN_MARKETPLACES_PATH,
  PLUGIN_SOURCE_BUILTIN,
  PLUGIN_SOURCE_MARKETPLACE,
  PLUGIN_SOURCE_PARTNER,
  SKILLS_FAILED_COPY,
  SKILL_INSTALL_FAILED_COPY,
  SKILL_UNINSTALL_FAILED_COPY,
} from '../constants';
import { DirectoryRequestError, describeActionFailure } from '../services/request-error';
import {
  DEFAULT_DIRECTORY_QUERY,
  connectedConnectorIds,
  connectorDirectoryHref,
  connectorReauthorizationErrors,
  fetchConnectedConnectors,
  fetchConnectorDirectoryPage,
  fetchConnectorRecord,
  fetchRelatedConnectors,
  initialConnectorSection,
  toConnectorDetail,
  toConnectorSection,
  toCuratedConnectorDetail,
  toDirectoryRequest,
  withConnectorErrors,
  type ConnectorDirectoryStats,
  type ConnectorSetupRequirement,
} from '../services/connectors-directory';
import {
  DEFAULT_PLUGIN_QUERY,
  EMPTY_INSTALL_STATE,
  EMPTY_USER_MARKETPLACES,
  facetRequest,
  fetchPluginDirectoryEntry,
  fetchPluginDirectoryPage,
  fetchPluginInstallState,
  fetchUserMarketplaces,
  initialPluginSection,
  installPlugin as requestPluginInstall,
  marketplaceRequest,
  pluginDirectoryHref,
  toPluginDetail,
  toPluginRequest,
  toPluginSection,
  toUserMarketplaceDetail,
  uninstallPlugin as requestPluginUninstall,
  userMarketplaceSourceId,
  withInstallBlock,
  type PluginInstallOutcome,
  type PluginInstallState,
  type PluginInstallTarget,
  type PluginMarketplacePage,
  type PluginUninstallOutcome,
  type PluginUninstallTarget,
  type UserMarketplaceState,
} from '../services/plugins-directory';
import {
  fetchInstalledSkillNames,
  fetchSkillCatalog,
  fetchSkillDetail,
  installSkill,
  toSkillSection,
  uninstallSkill,
} from '../services/skills-directory';

const EMPTY: DirectorySection = { entries: [] };
const SECTIONS: readonly DirectorySectionKey[] = ['skills', 'connectors', 'plugins'];
const DEFAULT_CONNECT_AUTH_TYPE = 'oauth2';

interface ConnectStartBody {
  message?: string;
  oauthStartPath?: string;
  installStartPath?: string;
  credentialsPath?: string;
}

const CREDENTIALS_STATUS = 409;

interface ConnectorPageState {
  records: DirectoryRecord[];
  firstPageCount: number;
  nextCursor: string | null;
  total: number;
  categories: readonly string[];
  stats?: ConnectorDirectoryStats;
}

const EMPTY_CONNECTOR_PAGE: ConnectorPageState = {
  records: [],
  firstPageCount: 0,
  nextCursor: null,
  total: 0,
  categories: [],
};

interface PluginPageState {
  builtin: PluginDirectoryEntry[];
  partner: PluginDirectoryEntry[];
  marketplace: PluginMarketplacePage | null;
  stats: PluginDirectoryStats | null;
  user: UserMarketplaceState;
  installs: PluginInstallState;
}

const EMPTY_PLUGIN_PAGE: PluginPageState = {
  builtin: [],
  partner: [],
  marketplace: null,
  stats: null,
  user: EMPTY_USER_MARKETPLACES,
  installs: EMPTY_INSTALL_STATE,
};

function pluginQueryKey(query: DirectoryQuery): string {
  return `${pluginDirectoryHref(marketplaceRequest(query))}|${userMarketplaceSourceId(query) ?? ''}`;
}

function swapPluginRecord(
  entries: readonly PluginDirectoryEntry[],
  next: PluginDirectoryEntry,
): PluginDirectoryEntry[] {
  return entries.map((entry) => (entry.id === next.id ? next : entry));
}

async function postJson(path: string, body: unknown): Promise<Response> {
  const csrfToken = await getCsrfToken();
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    body: JSON.stringify(body),
  });
}

export interface DirectoryAdapterOptions {
  onCreateSkill?: () => void;
  onEditSkill?: (name: string) => void;
  createSkillLabel?: string;
  curatedConnectors?: readonly SettingsConnector[];
  connectedConnectors?: readonly ConnectedConnector[];
  connectorsError?: string | null;
  connectorsNotice?: string | null;
  renderConnectorDetailFooter?: (id: string, detail: DirectoryConnectorDetail) => ReactNode;
  onRetryConnectors?: () => Promise<void> | void;
  onConnectConnector?: (id: string) => Promise<void> | void;
  onDisconnectConnector?: (id: string) => Promise<void> | void;
}

export function useDirectoryAdapter(options: DirectoryAdapterOptions = {}): DirectoryAdapter {
  const {
    onCreateSkill,
    onEditSkill,
    createSkillLabel,
    curatedConnectors,
    connectedConnectors,
    connectorsError,
    connectorsNotice,
    renderConnectorDetailFooter,
    onRetryConnectors,
    onConnectConnector,
    onDisconnectConnector,
  } = options;
  const [skills, setSkills] = useState<DirectorySection>(EMPTY);
  const [connectors, setConnectors] = useState<DirectorySection>(initialConnectorSection);
  const [plugins, setPlugins] = useState<DirectorySection>(initialPluginSection);
  const skillCache = useRef<readonly ManagedSkillSummary[]>([]);
  const installedSkills = useRef<ReadonlySet<string>>(new Set<string>());
  const serverConnectedIds = useRef<ReadonlySet<string>>(new Set<string>());
  const connectorErrors = useRef<Record<string, string>>({});
  const connectorsErrorRef = useRef<string | null>(null);
  const connectorsNoticeRef = useRef<string | null>(null);
  connectorsErrorRef.current = connectorsError ?? null;
  connectorsNoticeRef.current = connectorsNotice ?? null;
  const curatedRef = useRef<readonly SettingsConnector[]>([]);
  const connectedRef = useRef<readonly ConnectedConnector[]>([]);
  curatedRef.current = curatedConnectors ?? [];
  connectedRef.current = connectedConnectors ?? [];
  const pluginQueryRef = useRef<DirectoryQuery>(DEFAULT_PLUGIN_QUERY);
  const pluginPageRef = useRef<PluginPageState>(EMPTY_PLUGIN_PAGE);
  const pluginRequestSeq = useRef(0);
  const pluginLoadingMore = useRef(false);
  const pluginInFlight = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const pluginPrime = useRef<Promise<void> | null>(null);
  const pluginRegistryNotice = useRef<string | null>(null);
  const pluginDetails = useRef(new Map<string, PluginDirectoryEntry>());
  const connectorQueryRef = useRef<DirectoryQuery>(DEFAULT_DIRECTORY_QUERY);
  const connectorPageRef = useRef<ConnectorPageState>(EMPTY_CONNECTOR_PAGE);
  const connectorRequestSeq = useRef(0);
  const connectorLoadingMore = useRef(false);
  const connectorInFlight = useRef<{ href: string; promise: Promise<void> } | null>(null);
  const connectorRegistryNotice = useRef<string | null>(null);
  const connectorSetup = useRef<Readonly<Record<string, ConnectorSetupRequirement>>>({});
  const connectorsQueried = useRef(false);
  const [credentialFormId, setCredentialFormId] = useState<string | null>(null);

  const connectedIds = useCallback(
    () => new Set([...serverConnectedIds.current, ...connectedConnectorIds(connectedRef.current)]),
    [],
  );

  const loadSkills = useCallback(async () => {
    setSkills((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [catalog, installed] = await Promise.all([
        fetchSkillCatalog(),
        fetchInstalledSkillNames(),
      ]);
      skillCache.current = catalog;
      installedSkills.current = installed;
      setSkills({
        ...toSkillSection(catalog, installed),
        ...(createSkillLabel ? { createLabel: createSkillLabel } : {}),
        retry: loadSkills,
      });
    } catch {
      setSkills((prev) => ({
        ...prev,
        loading: false,
        error: SKILLS_FAILED_COPY,
        retry: loadSkills,
      }));
    }
  }, [createSkillLabel]);

  const retryConnectorsRef = useRef<(() => Promise<void>) | null>(null);
  const retryConnectors = useCallback(async () => {
    await retryConnectorsRef.current?.();
  }, []);

  const publishConnectors = useCallback(
    (patch: Partial<DirectorySection>) => {
      const page = connectorPageRef.current;
      const section = toConnectorSection({
        records: page.records,
        connectedIds: connectedIds(),
        curated: curatedRef.current,
        request: toDirectoryRequest(connectorQueryRef.current),
        total: page.total,
        nextCursor: page.nextCursor,
        categories: page.categories,
        featuredLimit: page.firstPageCount,
        ...(page.stats ? { stats: page.stats } : {}),
      });
      const errors = {
        ...connectorReauthorizationErrors(connectedRef.current),
        ...connectorErrors.current,
      };
      const notice = [connectorsNoticeRef.current, connectorRegistryNotice.current]
        .filter(Boolean)
        .join(' ');
      setConnectors({
        ...section,
        entries: withConnectorErrors(section.entries, errors),
        ...(connectorsErrorRef.current ? { error: connectorsErrorRef.current } : {}),
        ...(notice ? { notice } : {}),
        ...(connectorRegistryNotice.current ? { noticeRetry: retryConnectors } : {}),
        retry: retryConnectors,
        ...patch,
      });
    },
    [retryConnectors, connectedIds],
  );

  useEffect(() => {
    if (!connectorsQueried.current || connectorInFlight.current) return;
    publishConnectors({});
  }, [connectedConnectors, publishConnectors]);

  const runConnectorQuery = useCallback(
    async (query: DirectoryQuery) => {
      connectorRequestSeq.current += 1;
      const seq = connectorRequestSeq.current;
      setConnectors((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const [page, connected] = await Promise.all([
          fetchConnectorDirectoryPage(toDirectoryRequest(query)).catch(() => null),
          fetchConnectedConnectors(),
        ]);
        if (seq !== connectorRequestSeq.current) return;
        serverConnectedIds.current = connected.ids;
        connectorSetup.current = connected.setup;
        connectorsQueried.current = true;
        const previousStats = connectorPageRef.current.stats;
        connectorPageRef.current = page
          ? {
              records: page.entries,
              firstPageCount: page.entries.length,
              nextCursor: page.nextCursor,
              total: page.total,
              categories: page.categories ?? [],
              ...(page.stats ? { stats: page.stats } : {}),
            }
          : { ...EMPTY_CONNECTOR_PAGE, ...(previousStats ? { stats: previousStats } : {}) };
        connectorRegistryNotice.current = page ? null : CONNECTORS_FAILED_COPY;
        const nothingToShow = page === null && curatedRef.current.length === 0;
        publishConnectors({
          loading: false,
          loadingMore: false,
          ...(nothingToShow ? { error: CONNECTORS_FAILED_COPY } : {}),
        });
      } catch {
        if (seq !== connectorRequestSeq.current) return;
        setConnectors((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: CONNECTORS_FAILED_COPY,
          retry: retryConnectors,
        }));
      }
    },
    [publishConnectors, retryConnectors],
  );

  const queryConnectors = useCallback(
    (query: DirectoryQuery) => {
      connectorQueryRef.current = query;
      const href = connectorDirectoryHref(toDirectoryRequest(query));
      const inFlight = connectorInFlight.current;
      if (inFlight && inFlight.href === href) return inFlight.promise;
      const promise = runConnectorQuery(query).finally(() => {
        if (connectorInFlight.current?.promise === promise) connectorInFlight.current = null;
      });
      connectorInFlight.current = { href, promise };
      return promise;
    },
    [runConnectorQuery],
  );

  const loadConnectors = useCallback(
    () => queryConnectors(connectorQueryRef.current),
    [queryConnectors],
  );

  const loadMoreConnectors = useCallback(async () => {
    const page = connectorPageRef.current;
    if (!page.nextCursor || connectorLoadingMore.current) return;
    connectorLoadingMore.current = true;
    const seq = connectorRequestSeq.current;
    setConnectors((prev) => ({ ...prev, loadingMore: true }));
    try {
      const next = await fetchConnectorDirectoryPage(
        toDirectoryRequest(connectorQueryRef.current, page.nextCursor),
      );
      if (seq !== connectorRequestSeq.current) return;
      const stats = next.stats ?? page.stats;
      connectorPageRef.current = {
        records: [...page.records, ...next.entries],
        firstPageCount: page.firstPageCount,
        nextCursor: next.nextCursor,
        total: next.total,
        categories: next.categories ?? page.categories,
        ...(stats ? { stats } : {}),
      };
      publishConnectors({ loading: false, loadingMore: false });
    } catch {
      if (seq === connectorRequestSeq.current) {
        setConnectors((prev) => ({ ...prev, loadingMore: false }));
      }
    } finally {
      connectorLoadingMore.current = false;
    }
  }, [publishConnectors]);

  retryConnectorsRef.current = async () => {
    connectorErrors.current = {};
    await onRetryConnectors?.();
    await loadConnectors();
  };

  const retryPluginsRef = useRef<(() => Promise<void>) | null>(null);
  const retryPlugins = useCallback(async () => {
    await retryPluginsRef.current?.();
  }, []);

  const publishPlugins = useCallback(
    (patch: Partial<DirectorySection>) => {
      const page = pluginPageRef.current;
      const section = toPluginSection({
        query: pluginQueryRef.current,
        builtin: page.builtin,
        partner: page.partner,
        marketplace: page.marketplace,
        stats: page.stats,
        user: page.user,
        installs: page.installs,
      });
      const notice = [page.installs.notice, pluginRegistryNotice.current].filter(Boolean).join(' ');
      setPlugins({
        ...section,
        ...(notice ? { notice } : {}),
        ...(pluginRegistryNotice.current ? { noticeRetry: retryPlugins } : {}),
        retry: retryPlugins,
        ...patch,
      });
    },
    [retryPlugins],
  );

  const primePlugins = useCallback((): Promise<void> => {
    if (pluginPrime.current) return pluginPrime.current;
    const promise = (async () => {
      const [builtin, partner, installs, user] = await Promise.all([
        fetchPluginDirectoryPage(facetRequest(PLUGIN_SOURCE_BUILTIN)),
        fetchPluginDirectoryPage(facetRequest(PLUGIN_SOURCE_PARTNER)),
        fetchPluginInstallState(),
        fetchUserMarketplaces(),
      ]);
      pluginPageRef.current = {
        ...pluginPageRef.current,
        builtin: builtin.entries,
        partner: partner.entries,
        stats: builtin.stats,
        installs,
        user,
      };
    })().catch((error: unknown) => {
      pluginPrime.current = null;
      throw error;
    });
    pluginPrime.current = promise;
    return promise;
  }, []);

  const runPluginQuery = useCallback(
    async (query: DirectoryQuery) => {
      pluginRequestSeq.current += 1;
      const seq = pluginRequestSeq.current;
      setPlugins((prev) => ({ ...prev, loading: true, error: null }));
      const request = toPluginRequest(query);
      const remote =
        userMarketplaceSourceId(query) === null &&
        (request.source === null || request.source === PLUGIN_SOURCE_MARKETPLACE);
      try {
        const [, page] = await Promise.all([
          primePlugins(),
          remote
            ? fetchPluginDirectoryPage(marketplaceRequest(query)).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (seq !== pluginRequestSeq.current) return;
        const current = pluginPageRef.current;
        pluginPageRef.current = {
          ...current,
          marketplace: page
            ? { entries: page.entries, total: page.total, nextCursor: page.nextCursor }
            : remote
              ? null
              : current.marketplace,
          stats: page?.stats ?? current.stats,
        };
        pluginRegistryNotice.current = remote && page === null ? PLUGINS_FAILED_COPY : null;
        const nothingToShow =
          remote && page === null && current.builtin.length === 0 && current.partner.length === 0;
        publishPlugins({
          loading: false,
          loadingMore: false,
          ...(nothingToShow ? { error: PLUGINS_FAILED_COPY } : {}),
        });
      } catch {
        if (seq !== pluginRequestSeq.current) return;
        setPlugins((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: PLUGINS_FAILED_COPY,
          retry: retryPlugins,
        }));
      }
    },
    [primePlugins, publishPlugins, retryPlugins],
  );

  const queryPlugins = useCallback(
    (query: DirectoryQuery) => {
      pluginQueryRef.current = query;
      const key = pluginQueryKey(query);
      const inFlight = pluginInFlight.current;
      if (inFlight && inFlight.key === key) return inFlight.promise;
      const promise = runPluginQuery(query).finally(() => {
        if (pluginInFlight.current?.promise === promise) pluginInFlight.current = null;
      });
      pluginInFlight.current = { key, promise };
      return promise;
    },
    [runPluginQuery],
  );

  const loadPlugins = useCallback(() => queryPlugins(pluginQueryRef.current), [queryPlugins]);

  const loadMorePlugins = useCallback(async () => {
    const page = pluginPageRef.current.marketplace;
    if (!page?.nextCursor || pluginLoadingMore.current) return;
    pluginLoadingMore.current = true;
    const seq = pluginRequestSeq.current;
    setPlugins((prev) => ({ ...prev, loadingMore: true }));
    try {
      const next = await fetchPluginDirectoryPage(
        marketplaceRequest(pluginQueryRef.current, page.nextCursor),
      );
      if (seq !== pluginRequestSeq.current) return;
      pluginPageRef.current = {
        ...pluginPageRef.current,
        marketplace: {
          entries: [...page.entries, ...next.entries],
          total: next.total,
          nextCursor: next.nextCursor,
        },
        stats: next.stats ?? pluginPageRef.current.stats,
      };
      publishPlugins({ loading: false, loadingMore: false });
    } catch {
      if (seq === pluginRequestSeq.current) {
        setPlugins((prev) => ({ ...prev, loadingMore: false }));
      }
    } finally {
      pluginLoadingMore.current = false;
    }
  }, [publishPlugins]);

  retryPluginsRef.current = async () => {
    pluginPrime.current = null;
    await loadPlugins();
  };

  const refreshPluginInstalls = useCallback(async () => {
    const installs = await fetchPluginInstallState();
    pluginPageRef.current = { ...pluginPageRef.current, installs };
    publishPlugins({});
  }, [publishPlugins]);

  const refreshUserMarketplaces = useCallback(async () => {
    const user = await fetchUserMarketplaces();
    pluginPageRef.current = { ...pluginPageRef.current, user };
    publishPlugins({});
  }, [publishPlugins]);

  const findPluginRecord = useCallback((id: string): PluginDirectoryEntry | undefined => {
    const page = pluginPageRef.current;
    return (
      page.builtin.find((entry) => entry.id === id) ??
      page.partner.find((entry) => entry.id === id) ??
      page.marketplace?.entries.find((entry) => entry.id === id) ??
      pluginDetails.current.get(id)
    );
  }, []);

  const findUserEntry = useCallback(
    (id: string) => pluginPageRef.current.user.entries.find((entry) => entry.id === id),
    [],
  );

  const patchPluginRecord = useCallback(
    (next: PluginDirectoryEntry) => {
      const page = pluginPageRef.current;
      pluginPageRef.current = {
        ...page,
        builtin: swapPluginRecord(page.builtin, next),
        partner: swapPluginRecord(page.partner, next),
        marketplace: page.marketplace
          ? { ...page.marketplace, entries: swapPluginRecord(page.marketplace.entries, next) }
          : null,
      };
      if (pluginDetails.current.has(next.id)) pluginDetails.current.set(next.id, next);
      publishPlugins({});
    },
    [publishPlugins],
  );

  const loadPluginDetail = useCallback(
    async (id: string): Promise<DirectoryDetail | null> => {
      await primePlugins().catch(() => undefined);
      const page = pluginPageRef.current;
      const record = findPluginRecord(id);
      if (record) return toPluginDetail(record, page.installs);
      const userEntry = findUserEntry(id);
      if (userEntry) {
        return toUserMarketplaceDetail(
          userEntry,
          page.user.sources.find((source) => source.id === userEntry.sourceId),
          page.installs,
        );
      }
      const fetched = await fetchPluginDirectoryEntry(id);
      if (!fetched) return null;
      pluginDetails.current.set(id, fetched);
      return toPluginDetail(fetched, pluginPageRef.current.installs);
    },
    [primePlugins, findPluginRecord, findUserEntry],
  );

  const loadSection = useCallback(
    (section: DirectorySectionKey) => {
      if (section === 'skills') return loadSkills();
      if (section === 'connectors') return loadConnectors();
      return loadPlugins();
    },
    [loadSkills, loadConnectors, loadPlugins],
  );

  const queryEntries = useCallback(
    (section: DirectorySectionKey, query: DirectoryQuery) => {
      if (section === 'connectors') return queryConnectors(query);
      if (section === 'plugins') return queryPlugins(query);
      return loadSection(section);
    },
    [queryConnectors, queryPlugins, loadSection],
  );

  const loadMore = useCallback(
    (section: DirectorySectionKey) => {
      if (section === 'connectors') return loadMoreConnectors();
      if (section === 'plugins') return loadMorePlugins();
      return undefined;
    },
    [loadMoreConnectors, loadMorePlugins],
  );

  const withRelatedConnectors = useCallback(
    async (detail: DirectoryConnectorDetail): Promise<DirectoryConnectorDetail> => {
      const related = await fetchRelatedConnectors(
        detail.categories?.[0],
        detail.id,
        curatedRef.current,
        connectedIds(),
      );
      return related.length > 0 ? { ...detail, related } : detail;
    },
    [connectedIds],
  );

  const loadDetail = useCallback(
    async (section: DirectorySectionKey, id: string): Promise<DirectoryDetail | null> => {
      if (section === 'skills')
        return fetchSkillDetail(id, skillCache.current, installedSkills.current);
      if (section === 'connectors') {
        const curated = curatedRef.current.find((entry) => entry.id === id);
        if (curated) {
          return withRelatedConnectors(
            toCuratedConnectorDetail(curated, connectedIds(), connectorSetup.current[id]?.message),
          );
        }
        const cached = connectorPageRef.current.records.find((record) => record.id === id);
        const record = cached ?? (await fetchConnectorRecord(id));
        return record ? withRelatedConnectors(toConnectorDetail(record, connectedIds())) : null;
      }
      return loadPluginDetail(id);
    },
    [withRelatedConnectors, connectedIds, loadPluginDetail],
  );

  const connect = useCallback(
    async (id: string) => {
      const curated = curatedRef.current.some((entry) => entry.id === id);
      if (onConnectConnector && curated) {
        try {
          await onConnectConnector(id);
          delete connectorErrors.current[id];
        } catch (caught) {
          connectorErrors.current[id] =
            caught instanceof Error ? caught.message : CONNECT_FAILED_COPY;
        }
        await loadConnectors();
        return;
      }
      const response = await postJson(CONNECTORS_PATH, {
        connectorId: id,
        authType: DEFAULT_CONNECT_AUTH_TYPE,
      });
      if (response.ok) {
        await loadConnectors();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as ConnectStartBody;
      if (response.status === CREDENTIALS_STATUS && body.credentialsPath) {
        setCredentialFormId(id);
        return;
      }
      const start = body.oauthStartPath
        ? withConnectorReturnPath(body.oauthStartPath, currentConnectorReturnPath())
        : body.installStartPath;
      if (start && typeof window !== 'undefined') {
        window.location.href = start;
        return;
      }
      connectorErrors.current[id] = body.message ?? CONNECT_FAILED_COPY;
      await loadConnectors();
    },
    [loadConnectors, onConnectConnector],
  );

  const requestCredentials = useCallback((section: DirectorySectionKey, id: string) => {
    if (section === 'connectors') setCredentialFormId(id);
  }, []);

  const renderCredentialForm = useCallback(
    (section: DirectorySectionKey, id: string): ReactNode => {
      if (section !== 'connectors' || credentialFormId !== id) return null;
      return createElement(ConnectorApiKeyForm, {
        connectorId: id,
        onConnected: () => {
          setCredentialFormId(null);
          void loadConnectors();
        },
        onCancel: () => setCredentialFormId(null),
      });
    },
    [credentialFormId, loadConnectors],
  );

  const installPlugin = useCallback(
    async (id: string) => {
      const record = findPluginRecord(id);
      const target: PluginInstallTarget = record
        ? {
            kind: record.sourceFacet === PLUGIN_SOURCE_BUILTIN ? 'builtin' : 'directory',
            pluginId: id,
          }
        : findUserEntry(id)
          ? { kind: 'user', entryId: id }
          : { kind: 'directory', pluginId: id };
      let outcome: PluginInstallOutcome;
      try {
        outcome = await requestPluginInstall(target, await getCsrfToken());
      } catch (caught: unknown) {
        throw describeActionFailure(
          caught,
          caught instanceof DirectoryRequestError ? caught.message : PLUGIN_INSTALL_FAILED_COPY,
        );
      }
      if (outcome.status === 'disabled') throw new DirectoryActionNotice(outcome.message);
      if (outcome.status === 'blocked') {
        if (record)
          patchPluginRecord(withInstallBlock(record, outcome.message, outcome.installCommand));
        throw new DirectoryActionNotice(outcome.message);
      }
      invalidateSkillsCatalog();
      announceSkillCatalogChanged();
      await refreshPluginInstalls();
    },
    [findPluginRecord, findUserEntry, patchPluginRecord, refreshPluginInstalls],
  );

  const runSkillInstall = useCallback(
    async (id: string, installed: boolean) => {
      const csrfToken = await getCsrfToken();
      try {
        if (installed) await installSkill(id, csrfToken);
        else await uninstallSkill(id, csrfToken);
      } catch (caught: unknown) {
        throw describeActionFailure(
          caught,
          installed ? SKILL_INSTALL_FAILED_COPY : SKILL_UNINSTALL_FAILED_COPY,
        );
      }
      invalidateSkillsCatalog();
      announceSkillCatalogChanged();
      await loadSkills();
    },
    [loadSkills],
  );

  const install = useCallback(
    (section: DirectorySectionKey, id: string) => {
      if (section === 'connectors') return connect(id);
      if (section === 'plugins') return installPlugin(id);
      return runSkillInstall(id, true);
    },
    [connect, installPlugin, runSkillInstall],
  );

  const removePlugin = useCallback(
    async (id: string) => {
      const installs = pluginPageRef.current.installs;
      const record = findPluginRecord(id);
      const installation = record ? installs.byPluginKey.get(id) : installs.byEntryId.get(id);
      const target: PluginUninstallTarget | null =
        record?.sourceFacet === PLUGIN_SOURCE_BUILTIN
          ? { kind: 'builtin', pluginId: id }
          : installation
            ? { kind: 'installation', installationId: installation.id }
            : null;
      if (!target) throw new Error(PLUGIN_UNINSTALL_FAILED_COPY);
      let outcome: PluginUninstallOutcome;
      try {
        outcome = await requestPluginUninstall(target, await getCsrfToken());
      } catch (caught: unknown) {
        throw describeActionFailure(
          caught,
          caught instanceof DirectoryRequestError ? caught.message : PLUGIN_UNINSTALL_FAILED_COPY,
        );
      }
      if (outcome.status === 'disabled') throw new DirectoryActionNotice(outcome.message);
      invalidateSkillsCatalog();
      announceSkillCatalogChanged();
      await refreshPluginInstalls();
    },
    [findPluginRecord, refreshPluginInstalls],
  );

  const uninstall = useCallback(
    async (section: DirectorySectionKey, id: string) => {
      if (section === 'skills') return runSkillInstall(id, false);
      if (section === 'plugins') return removePlugin(id);
      if (section === 'connectors' && onDisconnectConnector) {
        await onDisconnectConnector(id);
        await loadConnectors();
      }
    },
    [runSkillInstall, removePlugin, onDisconnectConnector, loadConnectors],
  );

  const copyLink = useCallback(async (section: DirectorySectionKey, id: string) => {
    if (typeof window === 'undefined') return;
    const href = `${window.location.origin}${window.location.pathname}${buildSettingsBrowseHash(section, id)}`;
    await navigator.clipboard?.writeText(href);
  }, []);

  const copyValue = useCallback(async (value: string) => {
    if (typeof window === 'undefined') return;
    await navigator.clipboard?.writeText(value);
  }, []);

  const downloadSkillFile = useCallback((skillId: string, path: string) => {
    if (typeof window === 'undefined') return;
    window.open(skillFileDownloadHref(skillId, path), '_blank', 'noopener,noreferrer');
  }, []);

  const openHref = useCallback((href: string) => {
    if (typeof window === 'undefined') return;
    window.open(href, '_blank', 'noopener,noreferrer');
  }, []);

  const addMarketplace = useCallback(
    async (input: DirectoryMarketplaceInput): Promise<DirectoryMarketplaceResult> => {
      const response = await postJson(PLUGIN_MARKETPLACES_PATH, {
        repositoryUrl: input.repositoryUrl,
        ...(input.ref ? { ref: input.ref } : {}),
      });
      const body = (await response.json().catch(() => ({}))) as {
        source?: { id: string; name: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.source) {
        throw new Error(body.error?.message ?? MARKETPLACE_FAILED_COPY);
      }
      await refreshUserMarketplaces();
      const entries = pluginPageRef.current.user.entries
        .filter((entry) => entry.sourceId === body.source?.id)
        .map((entry) => ({ id: entry.id, name: entry.name, description: entry.description }));
      return { id: body.source.id, name: body.source.name, entries };
    },
    [refreshUserMarketplaces],
  );

  const removeMarketplace = useCallback(
    async (id: string) => {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`${PLUGIN_MARKETPLACES_PATH}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { [CSRF_HEADER]: csrfToken },
      });
      if (!response.ok) throw new Error(MARKETPLACE_FAILED_COPY);
      await refreshUserMarketplaces();
    },
    [refreshUserMarketplaces],
  );

  const openSettings = useCallback(
    (section: DirectorySectionKey, id: string) => {
      if (section === 'skills') onEditSkill?.(id);
    },
    [onEditSkill],
  );

  const createEntry = useCallback(
    (section: DirectorySectionKey) => {
      if (section === 'skills') onCreateSkill?.();
    },
    [onCreateSkill],
  );

  return useMemo(
    () => ({
      sections: SECTIONS,
      skills,
      connectors,
      plugins,
      loadSection,
      queryEntries,
      loadMore,
      loadDetail,
      install,
      uninstall,
      requestCredentials,
      renderCredentialForm,
      ...(onEditSkill ? { openSettings } : {}),
      ...(onCreateSkill ? { createEntry } : {}),
      ...(renderConnectorDetailFooter
        ? {
            renderDetailFooter: (
              section: DirectorySectionKey,
              id: string,
              detail: DirectoryDetail,
            ) =>
              section === 'connectors' && detail.kind === 'connector'
                ? renderConnectorDetailFooter(id, detail)
                : null,
          }
        : {}),
      copyLink,
      copyValue,
      downloadSkillFile,
      openHref,
      addMarketplace,
      removeMarketplace,
    }),
    [
      skills,
      connectors,
      plugins,
      loadSection,
      queryEntries,
      loadMore,
      loadDetail,
      install,
      uninstall,
      requestCredentials,
      renderCredentialForm,
      openSettings,
      createEntry,
      onEditSkill,
      onCreateSkill,
      renderConnectorDetailFooter,
      copyLink,
      copyValue,
      downloadSkillFile,
      openHref,
      addMarketplace,
      removeMarketplace,
    ],
  );
}
