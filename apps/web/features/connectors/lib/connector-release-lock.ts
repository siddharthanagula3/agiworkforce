import {
  CONNECTORS_COMING_SOON_DETAIL,
  CONNECTORS_COMING_SOON_LABEL,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorReleased,
  hasReleasedConnectors,
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
  if (connectorReleased(entry.id)) return entry;
  const locked: DirectoryEntry = { ...entry, connectableMode: 'coming-soon' };
  delete locked.statusLabel;
  delete locked.installNotice;
  return locked;
}

export function lockConnectorSection(section: DirectorySection): DirectorySection {
  return {
    ...section,
    entries: section.entries.map(lockConnectorEntry),
    ...(!hasReleasedConnectors()
      ? { locked: { label: CONNECTORS_COMING_SOON_LABEL, message: CONNECTORS_COMING_SOON_DETAIL } }
      : {}),
  };
}

function lockDetail(section: DirectorySectionKey, detail: DirectoryDetail): DirectoryDetail {
  if (detail.kind === 'connector') {
    const related = detail.related?.map(lockConnectorEntry);
    if (connectorReleased(detail.id)) {
      return { ...detail, ...(related ? { related } : {}) };
    }
    return {
      ...detail,
      connectableMode: 'coming-soon',
      setupNotice: CONNECTORS_COMING_SOON_DETAIL,
      ...(related ? { related } : {}),
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
  const install = adapter.install;
  if (install) {
    locked.install = (section, id) =>
      section === CONNECTORS_SECTION && !connectorReleased(id)
        ? Promise.resolve(CONNECTORS_COMING_SOON_MESSAGE)
        : install(section, id);
  }
  const requestCredentials = refuseConnectors(adapter.requestCredentials, () => undefined);
  const createEntry = refuseConnectors(adapter.createEntry, () => undefined);

  if (requestCredentials) locked.requestCredentials = requestCredentials;
  if (createEntry) locked.createEntry = createEntry;
  return locked;
}
