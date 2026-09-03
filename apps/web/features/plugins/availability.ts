import {
  isPluginEntryInstallable,
  isPluginEntryWebInstallable,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import type { PluginCatalogResult } from './server/registry-source';

export function countInstallablePlugins(entries: readonly PluginRegistryEntry[]): number {
  return entries.filter(
    (entry) => isPluginEntryWebInstallable(entry) || isPluginEntryInstallable(entry),
  ).length;
}

// Every page that states a plugin launch status reads it from here, so
// /plugins and /features/plugins cannot drift into contradicting each other.
export function pluginAvailabilityClaim(catalog: PluginCatalogResult): string {
  if (catalog.status !== 'ok') {
    return 'The registry is unreachable right now, so this page cannot say which packs are installable.';
  }
  if (catalog.entries.length === 0) {
    return 'The registry holds no packs yet.';
  }
  const installable = countInstallablePlugins(catalog.entries);
  if (installable === 0) {
    return 'No pack is installable in this environment yet.';
  }
  const total = catalog.entries.length;
  if (installable === total) {
    return total === 1
      ? 'The 1 pack in the registry is installable today.'
      : `All ${total} packs in the registry are installable today.`;
  }
  return `${installable} of ${total} packs are installable today; the rest are declared and not yet published.`;
}
