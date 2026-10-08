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
  if (
    section === 'plugins' &&
    detail.kind === 'plugin' &&
    (detail.components?.mcpServers.length ?? 0) > 0
  ) {
    return { ...detail, connectorsNote: PLUGIN_CONNECTORS_COMING_SOON_NOTE };
  }
  return detail;
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
    ...(loadDetail
      ? {
          loadDetail: async (section: DirectorySectionKey, id: string) => {
            const detail = await loadDetail(section, id);
            return detail ? lockDetail(section, detail) : detail;
          },
        }
      : {}),
  };
  const install = refuseConnectors(adapter.install, async () => CONNECTORS_COMING_SOON_MESSAGE);
  const requestCredentials = refuseConnectors(adapter.requestCredentials, () => undefined);
  const createEntry = refuseConnectors(adapter.createEntry, () => undefined);
  if (install) locked.install = install;
  if (requestCredentials) locked.requestCredentials = requestCredentials;
  if (createEntry) locked.createEntry = createEntry;
  return locked;
}
