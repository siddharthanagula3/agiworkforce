import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  parsePluginDependencies,
  pluginLabel,
  type PluginDependencyRef,
} from '@/lib/services/plugin-dependencies';
import { isShadowSourceName, SHADOW_SOURCE_NAME_PREFIX } from './constants';
import { findPluginDirectoryRecord } from './memory-cache';

export interface InstalledPluginNode {
  id: string;
  pluginKey: string;
  name: string;
  marketplace: string | null;
  dependencies: readonly PluginDependencyRef[];
}

export interface PluginDependent {
  id: string;
  label: string;
  name: string;
}

function dependsOn(dependent: InstalledPluginNode, target: InstalledPluginNode): boolean {
  return dependent.dependencies.some(
    (reference) =>
      reference.name === target.pluginKey &&
      (reference.marketplace ?? dependent.marketplace) === target.marketplace,
  );
}

export function collectDependents(
  graph: readonly InstalledPluginNode[],
  targetId: string,
): PluginDependent[] {
  const target = graph.find((node) => node.id === targetId);
  if (!target) return [];
  const found: InstalledPluginNode[] = [];
  const queue = [target];
  const seen = new Set([target.id]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const candidate of graph) {
      if (seen.has(candidate.id) || !dependsOn(candidate, current)) continue;
      seen.add(candidate.id);
      found.push(candidate);
      queue.push(candidate);
    }
  }
  return found.reverse().map((node) => ({
    id: node.id,
    label: pluginLabel(node.pluginKey, node.marketplace),
    name: node.name,
  }));
}

export function dependentsRefusalMessage(
  action: 'remove' | 'turn off',
  targetName: string,
  dependents: readonly PluginDependent[],
): string {
  const names = dependents.map((dependent) => dependent.name);
  const list =
    names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'needs' : 'need';
  return `${targetName} cannot be ${action === 'remove' ? 'removed' : 'turned off'} yet because ${list} ${verb} it. ${action === 'remove' ? 'Remove' : 'Turn off'} ${names.length === 1 ? 'that plugin' : 'those plugins'} together with it, or first.`;
}

interface MarketplaceNodeRow {
  id: string;
  plugin_key: string;
  name: string;
  source_name: string;
  dependencies: unknown;
}

function marketplaceName(sourceName: string): string {
  return isShadowSourceName(sourceName)
    ? sourceName.slice(SHADOW_SOURCE_NAME_PREFIX.length)
    : sourceName;
}

export async function listMarketplaceDependents(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<PluginDependent[]> {
  const rows = await db.query<MarketplaceNodeRow>(
    `select installation.id, entries.plugin_key, entries.name, sources.name as source_name,
            entries.dependencies
       from public.plugin_marketplace_installations installation
       join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where installation.user_id = $1
        and sources.user_id = $1
        and installation.enabled = true`,
    [userId],
  );
  const graph = await Promise.all(
    rows.map(async (row): Promise<InstalledPluginNode> => {
      const stored = parsePluginDependencies(row.dependencies) ?? [];
      const listed =
        stored.length === 0 && isShadowSourceName(row.source_name)
          ? ((await findPluginDirectoryRecord(row.plugin_key))?.dependencies ?? [])
          : stored;
      return {
        id: row.id,
        pluginKey: row.plugin_key,
        name: row.name,
        marketplace: marketplaceName(row.source_name),
        dependencies: stored.length > 0 ? stored : listed,
      };
    }),
  );
  return collectDependents(graph, installationId);
}

interface RegistryNodeRow {
  plugin_id: string;
  name: string;
  dependencies: unknown;
}

export async function listRegistryDependents(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<PluginDependent[]> {
  const rows = await db.query<RegistryNodeRow>(
    `select installation.plugin_id, registry.name, registry.manifest -> 'dependencies' as dependencies
       from public.plugin_installations installation
       join public.plugin_registry_entries registry on registry.id = installation.plugin_id
      where installation.user_id = $1
        and installation.enabled = true`,
    [userId],
  );
  return collectDependents(
    rows.map((row) => ({
      id: row.plugin_id,
      pluginKey: row.plugin_id,
      name: row.name,
      marketplace: null,
      dependencies: parsePluginDependencies(row.dependencies) ?? [],
    })),
    pluginId,
  );
}
