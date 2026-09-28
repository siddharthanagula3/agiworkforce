import { isPluginId } from '@agiworkforce/types';
import { intersects, satisfies, valid, validRange } from 'semver';

import { AppError, ErrorCode } from '@/lib/errors';

export const MAX_PLUGIN_DEPENDENCY_DEPTH = 8;
export const MAX_RESOLVED_PLUGINS = 32;

const MARKETPLACE_NAME_PATTERN = /^[^\s@/]{1,200}$/;

export interface PluginDependencyRef {
  name: string;
  marketplace: string | null;
  version: string | null;
}

export interface PluginDependencyNode<T> {
  name: string;
  marketplace: string | null;
  plugin: T;
  dependencies: readonly PluginDependencyRef[];
}

export interface PluginVersionConstraint {
  range: string;
  requiredBy: string;
}

export interface ResolvedPluginDependency<T> {
  plugin: T;
  label: string;
  requiredBy: string;
  constraints: PluginVersionConstraint[];
}

export class PluginDependencyError extends AppError {
  constructor(message: string) {
    super(ErrorCode.CONFLICT, message, 409);
    Object.setPrototypeOf(this, PluginDependencyError.prototype);
    this.name = 'PluginDependencyError';
    this.asUserSafe();
  }
}

function dependencyRef(
  name: string,
  marketplace: string | null,
  version: string | null,
): PluginDependencyRef | null {
  if (!isPluginId(name)) return null;
  if (marketplace !== null && !MARKETPLACE_NAME_PATTERN.test(marketplace)) return null;
  if (version !== null && validRange(version) === null) return null;
  return { name, marketplace, version };
}

function parseDependency(value: unknown): PluginDependencyRef | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const at = trimmed.indexOf('@');
    if (at === -1) return dependencyRef(trimmed, null, null);
    return dependencyRef(trimmed.slice(0, at).trim(), trimmed.slice(at + 1).trim(), null);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { name, marketplace, version } = record;
  if (typeof name !== 'string') return null;
  if (marketplace !== undefined && typeof marketplace !== 'string') return null;
  if (version !== undefined && typeof version !== 'string') return null;
  return dependencyRef(name.trim(), marketplace?.trim() ?? null, version?.trim() ?? null);
}

export function parsePluginDependencies(value: unknown): PluginDependencyRef[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const references: PluginDependencyRef[] = [];
  for (const item of value) {
    const reference = parseDependency(item);
    if (!reference) return null;
    references.push(reference);
  }
  return references;
}

export function parseMarketplaceAllowlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && MARKETPLACE_NAME_PATTERN.test(item),
  );
}

export function pluginLabel(name: string, marketplace: string | null): string {
  return marketplace ? `${name}@${marketplace}` : name;
}

export function pluginDependencyLabel(reference: PluginDependencyRef): string {
  return pluginLabel(reference.name, reference.marketplace);
}

export function mergePluginDependencies(
  ...lists: ReadonlyArray<readonly PluginDependencyRef[] | null>
): PluginDependencyRef[] | null {
  const merged = new Map<string, PluginDependencyRef>();
  for (const list of lists) {
    if (list === null) return null;
    for (const reference of list) {
      const label = pluginDependencyLabel(reference);
      if (!merged.has(label)) merged.set(label, reference);
    }
  }
  return [...merged.values()];
}

export async function resolvePluginDependencies<T>(
  root: PluginDependencyNode<T>,
  lookup: (
    reference: PluginDependencyRef,
    declaredBy: PluginDependencyNode<T>,
  ) => Promise<PluginDependencyNode<T> | null>,
): Promise<ResolvedPluginDependency<T>[]> {
  const rootLabel = pluginLabel(root.name, root.marketplace);
  const seen = new Set<string>([rootLabel]);
  const constraints = new Map<string, PluginVersionConstraint[]>();
  const resolved: ResolvedPluginDependency<T>[] = [];
  const queue = root.dependencies.map((reference) => ({ reference, declaredBy: root, depth: 1 }));

  for (let next = queue.shift(); next; next = queue.shift()) {
    const { reference, declaredBy, depth } = next;
    const label = pluginLabel(reference.name, reference.marketplace ?? declaredBy.marketplace);
    const requiredBy = pluginLabel(declaredBy.name, declaredBy.marketplace);
    const labelConstraints = constraints.get(label) ?? [];
    constraints.set(label, labelConstraints);
    if (reference.version !== null) labelConstraints.push({ range: reference.version, requiredBy });
    if (seen.has(label)) continue;
    seen.add(label);
    if (depth > MAX_PLUGIN_DEPENDENCY_DEPTH) {
      throw new PluginDependencyError(
        `Dependency "${label}" (required by ${requiredBy}) sits more than ${MAX_PLUGIN_DEPENDENCY_DEPTH} levels below ${rootLabel}, so ${rootLabel} was not installed.`,
      );
    }
    if (resolved.length + 1 >= MAX_RESOLVED_PLUGINS) {
      throw new PluginDependencyError(
        `${rootLabel} needs more than ${MAX_RESOLVED_PLUGINS} plugins in total, so it was not installed.`,
      );
    }
    const node = await lookup(reference, declaredBy);
    if (!node) continue;
    resolved.push({ plugin: node.plugin, label, requiredBy, constraints: labelConstraints });
    for (const dependency of node.dependencies) {
      queue.push({ reference: dependency, declaredBy: node, depth: depth + 1 });
    }
  }
  return resolved;
}

export function conflictingConstraints(
  constraints: readonly PluginVersionConstraint[],
): [PluginVersionConstraint, PluginVersionConstraint] | null {
  for (const [index, first] of constraints.entries()) {
    for (const second of constraints.slice(index + 1)) {
      if (!intersects(first.range, second.range)) return [first, second];
    }
  }
  return null;
}

export function unmetConstraint(
  version: string | null,
  constraints: readonly PluginVersionConstraint[],
): PluginVersionConstraint | null {
  const parsed = version === null ? null : valid(version);
  return (
    constraints.find((constraint) => parsed === null || !satisfies(parsed, constraint.range)) ??
    null
  );
}

export function conflictingConstraintsMessage(
  label: string,
  [first, second]: [PluginVersionConstraint, PluginVersionConstraint],
  rootLabel: string,
): string {
  return `Dependency "${label}" has conflicting version requirements: ${first.requiredBy} requires ${first.range} and ${second.requiredBy} requires ${second.range}, so ${rootLabel} was not installed.`;
}

export function installedOutsideRangeMessage(
  label: string,
  constraint: PluginVersionConstraint,
  installed: string,
  rootLabel: string,
): string {
  return `Dependency "${label}" (required by ${constraint.requiredBy}) requires ${constraint.range}, and ${installed} is installed, so ${rootLabel} was not installed. Update ${label} or uninstall it, then install ${rootLabel} again.`;
}

export function listedOutsideRangeMessage(
  label: string,
  constraint: PluginVersionConstraint,
  listed: string,
  rootLabel: string,
): string {
  return `Dependency "${label}" (required by ${constraint.requiredBy}) requires ${constraint.range}, and its marketplace lists ${listed}, so ${rootLabel} was not installed.`;
}
