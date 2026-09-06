import { isPluginEntryWebInstallable, type PluginRegistryEntry } from '@agiworkforce/types';
import { SOURCE_FACET_BUILTIN, WORKS_WITH_WEB } from './constants';
import { EMPTY_COMPONENTS } from './inspection';
import type { PluginDirectoryEntry, PluginSourceLocation } from './types';

export function sourceKey(location: PluginSourceLocation | null): string | null {
  if (!location) return null;
  return `${location.repositoryUrl.toLowerCase()}#${(location.path ?? '').toLowerCase()}`;
}

export function builtInDirectoryEntry(
  entry: PluginRegistryEntry,
  installCount: number | undefined,
): PluginDirectoryEntry {
  const webInstallable = isPluginEntryWebInstallable(entry);
  return {
    ...entry,
    ...(installCount === undefined ? {} : { installCount }),
    slug: entry.id,
    sourceFacet: SOURCE_FACET_BUILTIN,
    verified: entry.publisher.kind === 'first-party',
    installs: installCount ?? null,
    worksWith: webInstallable ? [WORKS_WITH_WEB] : [],
    repositoryUrl: null,
    marketplace: null,
    installCommand: null,
    runtime: {
      webInstallable,
      inspected: true,
      components: { ...EMPTY_COMPONENTS, skills: [...entry.declaredSkills] },
      note: null,
    },
    sourceLocation: null,
  };
}

export interface MergedDirectory {
  entries: PluginDirectoryEntry[];
  duplicatesDropped: number;
}

export function mergeDirectoryEntries(
  ...layers: ReadonlyArray<readonly PluginDirectoryEntry[]>
): MergedDirectory {
  const ids = new Set<string>();
  const sources = new Set<string>();
  const entries: PluginDirectoryEntry[] = [];
  let duplicatesDropped = 0;
  for (const layer of layers) {
    for (const entry of layer) {
      const key = sourceKey(entry.sourceLocation);
      if (ids.has(entry.id) || (key !== null && sources.has(key))) {
        duplicatesDropped += 1;
        continue;
      }
      ids.add(entry.id);
      if (key !== null) sources.add(key);
      entries.push(entry);
    }
  }
  return { entries, duplicatesDropped };
}
