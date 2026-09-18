export interface PluginPermissionDiff {
  added: string[];
  removed: string[];
  /** True when the new set grants something the approved set did not. */
  expands: boolean;
}

export function normalizePluginPermissions(values: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().toLowerCase();
    if (normalized) seen.add(normalized);
  }
  return [...seen].sort();
}

/** Only additions gate a review; giving up a permission surprises nobody. */
export function diffPluginPermissions(
  approved: readonly string[] | null | undefined,
  next: readonly string[] | null | undefined,
): PluginPermissionDiff {
  const before = new Set(normalizePluginPermissions(approved));
  const after = new Set(normalizePluginPermissions(next));
  const added = [...after].filter((permission) => !before.has(permission));
  const removed = [...before].filter((permission) => !after.has(permission));
  return { added, removed, expands: added.length > 0 };
}

export function pluginPermissionsExpand(
  approved: readonly string[] | null | undefined,
  next: readonly string[] | null | undefined,
): boolean {
  return diffPluginPermissions(approved, next).expands;
}

export function describePluginPermissionExpansion(diff: PluginPermissionDiff): string {
  if (!diff.expands) return 'This update does not ask for anything new.';
  return `This update asks for permissions you have not approved: ${diff.added.join(', ')}.`;
}
