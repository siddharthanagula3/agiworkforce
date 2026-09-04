'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { ManagedSkillSummary } from '@agiworkforce/cloud-contracts';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

import {
  MARKETPLACE_UNAVAILABLE_COPY,
  type ConnectedConnector,
  type DirectoryAdapter,
  type DirectoryDetail,
  type DirectoryMarketplaceInput,
  type DirectoryMarketplaceResult,
  type DirectorySection,
  type DirectorySectionKey,
  type SettingsConnector,
} from '@agiworkforce/ui';

import {
  currentConnectorReturnPath,
  withConnectorReturnPath,
} from '@features/connectors/hooks/use-connectors';
import { invalidateSkillsCatalog } from '@features/skills/services/skills-catalog';
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
  PLUGIN_INSTALLATIONS_PATH,
  PLUGIN_MARKETPLACES_PATH,
  PLUGIN_MARKETPLACE_INSTALLATIONS_PATH,
  SKILLS_FAILED_COPY,
} from '../constants';
import {
  connectedConnectorIds,
  fetchConnectedConnectorIds,
  fetchConnectorRecord,
  fetchConnectorRecords,
  toConnectorDetail,
  toConnectorSection,
  toCuratedConnectorDetail,
  withConnectorErrors,
} from '../services/connectors-directory';
import {
  fetchPluginSnapshot,
  toMarketplaceDetail,
  toPluginSection,
  toRegistryDetail,
  type PluginDirectorySnapshot,
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

interface ConnectStartBody {
  message?: string;
  oauthStartPath?: string;
  installStartPath?: string;
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
  renderConnectorDetailFooter?: (id: string) => ReactNode;
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
  const [connectors, setConnectors] = useState<DirectorySection>(EMPTY);
  const [plugins, setPlugins] = useState<DirectorySection>(EMPTY);
  const skillCache = useRef<readonly ManagedSkillSummary[]>([]);
  const installedSkills = useRef<ReadonlySet<string>>(new Set<string>());
  const connectedIds = useRef<ReadonlySet<string>>(new Set<string>());
  const connectorErrors = useRef<Record<string, string>>({});
  const connectorsErrorRef = useRef<string | null>(null);
  const connectorsNoticeRef = useRef<string | null>(null);
  connectorsErrorRef.current = connectorsError ?? null;
  connectorsNoticeRef.current = connectorsNotice ?? null;
  const curatedRef = useRef<readonly SettingsConnector[]>([]);
  const connectedRef = useRef<readonly ConnectedConnector[]>([]);
  curatedRef.current = curatedConnectors ?? [];
  connectedRef.current = connectedConnectors ?? [];
  const pluginCache = useRef<PluginDirectorySnapshot | null>(null);

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
      setSkills((prev) => ({ ...prev, loading: false, error: SKILLS_FAILED_COPY, retry: loadSkills }));
    }
  }, [createSkillLabel]);

  const retryConnectorsRef = useRef<(() => Promise<void>) | null>(null);
  const retryConnectors = useCallback(async () => {
    await retryConnectorsRef.current?.();
  }, []);

  const loadConnectors = useCallback(async () => {
    setConnectors((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [records, connected] = await Promise.all([
        fetchConnectorRecords().catch(() => [] as DirectoryRecord[]),
        fetchConnectedConnectorIds(),
      ]);
      const merged = new Set([...connected, ...connectedConnectorIds(connectedRef.current)]);
      connectedIds.current = merged;
      const section = toConnectorSection(records, merged, curatedRef.current);
      setConnectors({
        ...section,
        entries: withConnectorErrors(section.entries, connectorErrors.current),
        ...(connectorsErrorRef.current ? { error: connectorsErrorRef.current } : {}),
        ...(connectorsNoticeRef.current ? { notice: connectorsNoticeRef.current } : {}),
        retry: retryConnectors,
      });
    } catch {
      setConnectors((prev) => ({ ...prev, loading: false, error: CONNECTORS_FAILED_COPY, retry: loadConnectors }));
    }
  }, [retryConnectors]);

  retryConnectorsRef.current = async () => {
    connectorErrors.current = {};
    await onRetryConnectors?.();
    await loadConnectors();
  };

  const loadPlugins = useCallback(async () => {
    setPlugins((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await fetchPluginSnapshot();
      pluginCache.current = snapshot;
      setPlugins({
        ...toPluginSection(snapshot, Date.now()),
        ...(snapshot.marketplacesAvailable ? {} : { notice: MARKETPLACE_UNAVAILABLE_COPY }),
        retry: loadPlugins,
      });
    } catch {
      setPlugins((prev) => ({ ...prev, loading: false, error: PLUGINS_FAILED_COPY, retry: loadPlugins }));
    }
  }, []);

  const loadSection = useCallback(
    (section: DirectorySectionKey) => {
      if (section === 'skills') return loadSkills();
      if (section === 'connectors') return loadConnectors();
      return loadPlugins();
    },
    [loadSkills, loadConnectors, loadPlugins],
  );

  const loadDetail = useCallback(
    async (section: DirectorySectionKey, id: string): Promise<DirectoryDetail | null> => {
      if (section === 'skills')
        return fetchSkillDetail(id, skillCache.current, installedSkills.current);
      if (section === 'connectors') {
        const curated = curatedRef.current.find((entry) => entry.id === id);
        if (curated) return toCuratedConnectorDetail(curated, connectedIds.current);
        const record = await fetchConnectorRecord(id);
        return record ? toConnectorDetail(record, connectedIds.current) : null;
      }
      const snapshot = pluginCache.current;
      if (!snapshot) return null;
      const registry = snapshot.registry.find((plugin) => plugin.id === id);
      if (registry) return toRegistryDetail(registry, snapshot.installedPluginIds);
      const entry = snapshot.marketplaceEntries.find((candidate) => candidate.id === id);
      if (!entry) return null;
      const source = snapshot.marketplaceSources.find(
        (candidate) => candidate.id === entry.sourceId,
      );
      return toMarketplaceDetail(entry, source, snapshot.installedEntryIds);
    },
    [],
  );

  const connect = useCallback(
    async (id: string) => {
      if (onConnectConnector) {
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
      const response = await postJson(CONNECTORS_PATH, { connectorId: id, authType: 'oauth2' });
      if (response.ok) {
        await loadConnectors();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as ConnectStartBody;
      const start = body.oauthStartPath
        ? withConnectorReturnPath(body.oauthStartPath, currentConnectorReturnPath())
        : body.installStartPath;
      if (start && typeof window !== 'undefined') {
        window.location.href = start;
        return;
      }
      throw new Error(body.message ?? CONNECT_FAILED_COPY);
    },
    [loadConnectors, onConnectConnector],
  );

  const installPlugin = useCallback(
    async (id: string) => {
      const snapshot = pluginCache.current;
      const isMarketplace = snapshot?.marketplaceEntries.some((entry) => entry.id === id) === true;
      const response = isMarketplace
        ? await postJson(PLUGIN_MARKETPLACE_INSTALLATIONS_PATH, { entryId: id })
        : await postJson(PLUGIN_INSTALLATIONS_PATH, { pluginId: id });
      if (!response.ok) throw new Error(PLUGINS_FAILED_COPY);
      await loadPlugins();
    },
    [loadPlugins],
  );

  const runSkillInstall = useCallback(
    async (id: string, installed: boolean) => {
      const csrfToken = await getCsrfToken();
      if (installed) await installSkill(id, csrfToken);
      else await uninstallSkill(id, csrfToken);
      invalidateSkillsCatalog();
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

  const uninstall = useCallback(
    async (section: DirectorySectionKey, id: string) => {
      if (section === 'skills') return runSkillInstall(id, false);
      if (section === 'connectors' && onDisconnectConnector) {
        await onDisconnectConnector(id);
        await loadConnectors();
      }
    },
    [runSkillInstall, onDisconnectConnector, loadConnectors],
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
      await loadPlugins();
      const entries = (pluginCache.current?.marketplaceEntries ?? [])
        .filter((entry) => entry.sourceId === body.source?.id)
        .map((entry) => ({ id: entry.id, name: entry.name, description: entry.description }));
      return { id: body.source.id, name: body.source.name, entries };
    },
    [loadPlugins],
  );

  const removeMarketplace = useCallback(
    async (id: string) => {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`${PLUGIN_MARKETPLACES_PATH}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { [CSRF_HEADER]: csrfToken },
      });
      if (!response.ok) throw new Error(MARKETPLACE_FAILED_COPY);
      await loadPlugins();
    },
    [loadPlugins],
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
      loadDetail,
      install,
      uninstall,
      ...(onEditSkill ? { openSettings } : {}),
      ...(onCreateSkill ? { createEntry } : {}),
      ...(renderConnectorDetailFooter
        ? {
            renderDetailFooter: (section: DirectorySectionKey, id: string) =>
              section === 'connectors' ? renderConnectorDetailFooter(id) : null,
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
      loadDetail,
      install,
      uninstall,
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
