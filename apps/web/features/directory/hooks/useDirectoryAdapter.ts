'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import type { ManagedSkillSummary } from '@agiworkforce/cloud-contracts';
import {
  buildDirectoryHash,
  type DirectoryAdapter,
  type DirectoryDetail,
  type DirectoryMarketplaceInput,
  type DirectoryMarketplaceResult,
  type DirectorySection,
  type DirectorySectionKey,
} from '@agiworkforce/ui';

import {
  currentConnectorReturnPath,
  withConnectorReturnPath,
} from '@features/connectors/hooks/use-connectors';
import { loadSkillsCatalog } from '@features/skills/services/skills-catalog';
import { getCsrfToken } from '@/lib/client/csrf';

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
  fetchConnectedConnectorIds,
  fetchConnectorRecord,
  fetchConnectorRecords,
  toConnectorDetail,
  toConnectorSection,
} from '../services/connectors-directory';
import {
  fetchPluginSnapshot,
  toMarketplaceDetail,
  toPluginSection,
  toRegistryDetail,
  type PluginDirectorySnapshot,
} from '../services/plugins-directory';
import { fetchSkillDetail, toSkillSection } from '../services/skills-directory';

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

export function useDirectoryAdapter(): DirectoryAdapter {
  const [skills, setSkills] = useState<DirectorySection>(EMPTY);
  const [connectors, setConnectors] = useState<DirectorySection>(EMPTY);
  const [plugins, setPlugins] = useState<DirectorySection>(EMPTY);
  const skillCache = useRef<readonly ManagedSkillSummary[]>([]);
  const connectedIds = useRef<ReadonlySet<string>>(new Set<string>());
  const pluginCache = useRef<PluginDirectorySnapshot | null>(null);

  const loadSkills = useCallback(async () => {
    setSkills((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const catalog = await loadSkillsCatalog();
      skillCache.current = catalog;
      setSkills({ ...toSkillSection(catalog), retry: loadSkills });
    } catch {
      setSkills((prev) => ({ ...prev, loading: false, error: SKILLS_FAILED_COPY }));
    }
  }, []);

  const loadConnectors = useCallback(async () => {
    setConnectors((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [records, connected] = await Promise.all([
        fetchConnectorRecords(),
        fetchConnectedConnectorIds(),
      ]);
      connectedIds.current = connected;
      setConnectors({ ...toConnectorSection(records, connected), retry: loadConnectors });
    } catch {
      setConnectors((prev) => ({ ...prev, loading: false, error: CONNECTORS_FAILED_COPY }));
    }
  }, []);

  const loadPlugins = useCallback(async () => {
    setPlugins((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const snapshot = await fetchPluginSnapshot();
      pluginCache.current = snapshot;
      setPlugins({ ...toPluginSection(snapshot, Date.now()), retry: loadPlugins });
    } catch {
      setPlugins((prev) => ({ ...prev, loading: false, error: PLUGINS_FAILED_COPY }));
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
      if (section === 'skills') return fetchSkillDetail(id, skillCache.current);
      if (section === 'connectors') {
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
    [loadConnectors],
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

  const install = useCallback(
    (section: DirectorySectionKey, id: string) => {
      if (section === 'connectors') return connect(id);
      if (section === 'plugins') return installPlugin(id);
      return Promise.resolve();
    },
    [connect, installPlugin],
  );

  const copyLink = useCallback(async (section: DirectorySectionKey, id: string) => {
    if (typeof window === 'undefined') return;
    const href = `${window.location.origin}${window.location.pathname}${buildDirectoryHash(section, id)}`;
    await navigator.clipboard?.writeText(href);
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

  return useMemo(
    () => ({
      sections: SECTIONS,
      skills,
      connectors,
      plugins,
      loadSection,
      loadDetail,
      install,
      copyLink,
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
      copyLink,
      openHref,
      addMarketplace,
      removeMarketplace,
    ],
  );
}
