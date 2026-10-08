import {
  CONNECTORS_COMING_SOON_DETAIL,
  CONNECTORS_COMING_SOON_LABEL,
  CONNECTORS_COMING_SOON_MESSAGE,
} from '@agiworkforce/types';
import type {
  DirectoryAdapter,
  DirectoryDetail,
  DirectoryEntry,
  DirectorySection,
  DirectorySectionKey,
} from '@agiworkforce/ui';

const CONNECTORS_SECTION: DirectorySectionKey = 'connectors';

export const PLUGIN_CONNECTORS_COMING_SOON_NOTE =
  'Connectors are coming soon, so these servers are not added when you install it.';

export function lockConnectorEntry(entry: DirectoryEntry): DirectoryEntry {
  const locked: DirectoryEntry = { ...entry, connectableMode: 'coming-soon' };
  delete locked.statusLabel;
  delete locked.installNotice;
  return locked;
}

export function lockConnectorSection(section: DirectorySection): DirectorySection {
  return {
    ...section,
    entries: section.entries.map(lockConnectorEntry),
    locked: { label: CONNECTORS_COMING_SOON_LABEL, message: CONNECTORS_COMING_SOON_DETAIL },
  };
}

function lockDetail(section: DirectorySectionKey, detail: DirectoryDetail): DirectoryDetail {
  if (detail.kind === 'connector') {
    return {
      ...detail,
      connectableMode: 'coming-soon',
      setupNotice: CONNECTORS_COMING_SOON_DETAIL,
      ...(detail.related ? { related: detail.related.map(lockConnectorEntry) } : {}),
    };
  }
  if (section !== 'plugins' || detail.kind !== 'plugin') return detail;
  const bundlesServers = (detail.components?.mcpServers.length ?? 0) > 0;
  if (!bundlesServers && (detail.connectors?.length ?? 0) === 0) return detail;
  return {
    ...detail,
    connectorsLocked: {
      label: CONNECTORS_COMING_SOON_LABEL,
      message: CONNECTORS_COMING_SOON_DETAIL,
    },
    ...(bundlesServers ? { connectorsNote: PLUGIN_CONNECTORS_COMING_SOON_NOTE } : {}),
  };
}

type DetailLoader = NonNullable<DirectoryAdapter['loadDetail']>;

/*
 * The directory reloads a detail whenever its loader changes identity, and the
 * adapter is re-wrapped on every state change. A fresh wrapper each time turns
 * one detail load into an endless reload, so each loader keeps one wrapper.
 */
const lockedDetailLoaders = new WeakMap<DetailLoader, DetailLoader>();

function lockedDetailLoader(loadDetail: DetailLoader): DetailLoader {
  const cached = lockedDetailLoaders.get(loadDetail);
  if (cached) return cached;
  const locked: DetailLoader = async (section, id) => {
    const detail = await loadDetail(section, id);
    return detail ? lockDetail(section, detail) : detail;
  };
  lockedDetailLoaders.set(loadDetail, locked);
  return locked;
}

function refuseConnectors<Args extends unknown[], Result>(
  action: ((section: DirectorySectionKey, ...args: Args) => Result) | undefined,
  refusal: (section: DirectorySectionKey, ...args: Args) => Result,
): ((section: DirectorySectionKey, ...args: Args) => Result) | undefined {
  if (!action) return undefined;
  return (section, ...args) =>
    section === CONNECTORS_SECTION ? refusal(section, ...args) : action(section, ...args);
}

export function lockConnectorDirectory(adapter: DirectoryAdapter): DirectoryAdapter {
  const { loadDetail, connectors } = adapter;
  const locked: DirectoryAdapter = {
    ...adapter,
    ...(connectors ? { connectors: lockConnectorSection(connectors) } : {}),
    ...(loadDetail ? { loadDetail: lockedDetailLoader(loadDetail) } : {}),
  };
  const install = refuseConnectors(adapter.install, async () => CONNECTORS_COMING_SOON_MESSAGE);
  const requestCredentials = refuseConnectors(adapter.requestCredentials, () => undefined);
  const createEntry = refuseConnectors(adapter.createEntry, () => undefined);
  if (install) locked.install = install;
  if (requestCredentials) locked.requestCredentials = requestCredentials;
  if (createEntry) locked.createEntry = createEntry;
  return locked;
}
