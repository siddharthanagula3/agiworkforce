import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  parsePluginDependencies,
  pluginLabel,
  unmetConstraint,
  type PluginDependencyRef,
} from '@/lib/services/plugin-dependencies';
import { isShadowSourceName, SHADOW_SOURCE_NAME_PREFIX } from './constants';
import { declaredVersion } from './entries';
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

type DependencyState = 'ready' | 'off' | 'review' | 'suspended';

interface ReadinessNode extends InstalledPluginNode {
  state: DependencyState;
  version: string | null;
}

export interface UnmetDependency {
  name: string;
  problem: string;
}

interface InstallationStateRow {
  enabled: boolean;
  review_required: boolean;
  installed_version: string;
}

const STATE_PROBLEMS: Record<Exclude<DependencyState, 'ready'>, string> = {
  off: 'is turned off',
  review: 'is waiting for a permission review',
  suspended: 'is suspended',
};

function readinessState(row: InstallationStateRow, suspended: boolean): DependencyState {
  if (!row.enabled) return 'off';
  if (row.review_required) return 'review';
  return suspended ? 'suspended' : 'ready';
}

function dependencyProblem(
  target: ReadinessNode | undefined,
  reference: PluginDependencyRef,
): string | null {
  if (!target) return 'is not installed';
  if (target.state !== 'ready') return STATE_PROBLEMS[target.state];
  if (reference.version === null) return null;
  const unmet = unmetConstraint(target.version, [{ range: reference.version, requiredBy: '' }]);
  if (!unmet) return null;
  return `is ${target.version === null ? 'a copy with no version' : `installed at ${target.version}`} but needs ${reference.version}`;
}

function findUnmetDependencies(graph: readonly ReadinessNode[], rootId: string): UnmetDependency[] {
  const root = graph.find((node) => node.id === rootId);
  if (!root) return [];
  const unmet = new Map<string, UnmetDependency>();
  const seen = new Set([root.id]);
  const queue = [root];
  for (let current = queue.shift(); current; current = queue.shift()) {
    for (const reference of current.dependencies) {
      const marketplace = reference.marketplace ?? current.marketplace;
      const target = graph.find(
        (candidate) =>
          candidate.pluginKey === reference.name && candidate.marketplace === marketplace,
      );
      const problem = dependencyProblem(target, reference);
      const label = pluginLabel(reference.name, marketplace);
      if (problem) {
        if (!unmet.has(label)) unmet.set(label, { name: target?.name ?? label, problem });
        continue;
      }
      if (target && !seen.has(target.id)) {
        seen.add(target.id);
        queue.push(target);
      }
    }
  }
  return [...unmet.values()];
}

export function dependenciesUnavailableMessage(
  targetName: string,
  unmet: readonly UnmetDependency[],
): string {
  const needs = unmet.map((dependency) => `${dependency.name}, which ${dependency.problem}`);
  return `${targetName} cannot be turned on yet because it needs ${needs.join('; ')}. Fix ${unmet.length === 1 ? 'that plugin' : 'those plugins'} first, then turn ${targetName} on again.`;
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

async function marketplaceNode(row: MarketplaceNodeRow): Promise<InstalledPluginNode> {
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
  const graph = await Promise.all(rows.map(marketplaceNode));
  return collectDependents(graph, installationId);
}

export async function listUnmetMarketplaceDependencies(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<UnmetDependency[]> {
  const rows = await db.query<MarketplaceNodeRow & InstallationStateRow>(
    `select installation.id, entries.plugin_key, entries.name, sources.name as source_name,
            entries.dependencies, installation.enabled, installation.review_required,
            installation.installed_version
       from public.plugin_marketplace_installations installation
       join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where installation.user_id = $1
        and sources.user_id = $1`,
    [userId],
  );
  const graph = await Promise.all(
    rows.map(async (row): Promise<ReadinessNode> => ({
      ...(await marketplaceNode(row)),
      state: readinessState(row, false),
      version: declaredVersion(row.installed_version),
    })),
  );
  return findUnmetDependencies(graph, installationId);
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

interface RegistryReadinessRow extends RegistryNodeRow, InstallationStateRow {
  version_status: string;
}

export async function listUnmetRegistryDependencies(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<UnmetDependency[]> {
  const rows = await db.query<RegistryReadinessRow>(
    `select installation.plugin_id, registry.name, registry.manifest -> 'dependencies' as dependencies,
            installation.enabled, installation.review_required, installation.installed_version,
            coalesce(pinned.status, 'published') as version_status
       from public.plugin_installations installation
       join public.plugin_registry_entries registry on registry.id = installation.plugin_id
       left join public.plugin_registry_versions pinned
              on pinned.plugin_id = installation.plugin_id
             and pinned.version = installation.installed_version
      where installation.user_id = $1`,
    [userId],
  );
  return findUnmetDependencies(
    rows.map((row) => ({
      id: row.plugin_id,
      pluginKey: row.plugin_id,
      name: row.name,
      marketplace: null,
      dependencies: parsePluginDependencies(row.dependencies) ?? [],
      state: readinessState(row, row.version_status === 'suspended'),
      version: row.installed_version,
    })),
    pluginId,
  );
}
