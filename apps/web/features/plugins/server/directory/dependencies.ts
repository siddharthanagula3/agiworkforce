import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { valid } from 'semver';
import {
  PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES,
  type PluginInstalledDependency,
} from '@agiworkforce/cloud-contracts';

import {
  conflictingConstraints,
  conflictingConstraintsMessage,
  installedOutsideRangeMessage,
  listedOutsideRangeMessage,
  mergePluginDependencies,
  parsePluginDependencies,
  pluginLabel,
  PluginDependencyError,
  resolvePluginDependencies,
  unmetConstraint,
  type PluginDependencyNode,
  type PluginDependencyRef,
  type PluginVersionConstraint,
  type ResolvedPluginDependency,
} from '@/lib/services/plugin-dependencies';
import {
  assertMarketplaceEntryInstallable,
  findMarketplaceSourceEntry,
  hasMarketplaceSourceNamed,
  PluginPackageRefusedError,
  type MarketplaceSourceEntry,
} from '@/lib/services/plugin-marketplace-service';
import {
  CLAUDE_PLUGIN_METADATA_PATH,
  GITHUB_API_USER_AGENT,
  PLUGIN_DIRECTORY_FALLBACK_VERSION,
  PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS,
  PLUGIN_DIRECTORY_SHA_VERSION_PREFIX,
  RUNTIME_NOTE_NOT_INSPECTED,
  RUNTIME_NOTE_SOURCE_UNKNOWN,
  SOURCE_FACET_BUILTIN,
  shadowSourceName,
} from './constants';
import { rawFileUrl } from './inspection';
import { DIRECTORY_MARKETPLACES, type DirectoryFetch } from './official-marketplace';
import { releaseTagSatisfying } from './release-tags';
import { fetchPluginSkillFiles, pluginContentPaths } from './skill-files';
import type { InstalledDirectorySkill, PluginDirectoryEntry, PluginSourceLocation } from './types';

const HTTP_NOT_FOUND = 404;
const UNDECLARED_VERSION_PREFIX = `${PLUGIN_DIRECTORY_FALLBACK_VERSION}+${PLUGIN_DIRECTORY_SHA_VERSION_PREFIX}`;
const UNVERSIONED_COPY = 'a copy with no version';

export interface InstallableSource {
  record: PluginDirectoryEntry;
  location: PluginSourceLocation;
  sha: string;
  marketplaceName: string;
  repositoryUrl: string;
}

export type SourceCheck = { ok: true; source: InstallableSource } | { ok: false; note: string };

export type DependencyPlugin =
  | { kind: 'directory'; source: InstallableSource; dependencies: readonly PluginDependencyRef[] }
  | { kind: 'entry'; found: MarketplaceSourceEntry };

export interface DependencyRoot {
  name: string;
  marketplace: string;
  allowlist: readonly string[];
  dependencies: readonly PluginDependencyRef[];
  bundled?: ReadonlySet<string>;
}

export interface DependencyContext {
  db: DatabaseAdapter;
  userId: string;
  fetchImpl: DirectoryFetch;
  findRecord: (idOrSlug: string) => Promise<PluginDirectoryEntry | null>;
}

type ResolvedDependency = ResolvedPluginDependency<DependencyPlugin>;

export interface DependencyPlan {
  resolved: ResolvedDependency[];
  directory: {
    resolved: ResolvedDependency;
    source: InstallableSource;
    skills: InstalledDirectorySkill[];
    dependencies: readonly PluginDependencyRef[];
  }[];
  entries: { resolved: ResolvedDependency; found: MarketplaceSourceEntry }[];
  enable: { resolved: ResolvedDependency; installationId: string }[];
}

export interface InstalledDependency extends PluginInstalledDependency {
  installationId: string;
}

export class DirectorySourceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectorySourceUnavailableError';
  }
}

export class DependencySkillsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependencySkillsUnavailableError';
  }
}

type ManifestRead =
  { status: 'read'; dependencies: PluginDependencyRef[] | null } | { status: 'unavailable' };

interface ExistingInstallation {
  id: string;
  enabled: boolean;
  review_required: boolean;
  installed_version: string;
}

export function installableSource(record: PluginDirectoryEntry): SourceCheck {
  const location = record.sourceLocation;
  if (!record.runtime.webInstallable || !location || !record.marketplace?.repositoryUrl) {
    return { ok: false, note: record.runtime.note ?? RUNTIME_NOTE_SOURCE_UNKNOWN };
  }
  if (!location.sha) return { ok: false, note: RUNTIME_NOTE_NOT_INSPECTED };
  return {
    ok: true,
    source: {
      record,
      location,
      sha: location.sha,
      marketplaceName: record.marketplace.name,
      repositoryUrl: record.marketplace.repositoryUrl,
    },
  };
}

async function readManifestDependencies(
  source: InstallableSource,
  fetchImpl: DirectoryFetch,
): Promise<ManifestRead> {
  const url = rawFileUrl({ ...source.location, sha: source.sha }, CLAUDE_PLUGIN_METADATA_PATH);
  if (!url) return { status: 'unavailable' };
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': GITHUB_API_USER_AGENT },
      signal: AbortSignal.timeout(PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS),
    });
    if (response.status === HTTP_NOT_FOUND) return { status: 'read', dependencies: [] };
    if (!response.ok) return { status: 'unavailable' };
    const declaredBytes = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredBytes) && declaredBytes > PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES) {
      return { status: 'read', dependencies: null };
    }
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES) {
      return { status: 'read', dependencies: null };
    }
    let manifest: unknown;
    try {
      manifest = JSON.parse(body) as unknown;
    } catch {
      return { status: 'read', dependencies: null };
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return { status: 'read', dependencies: null };
    }
    return {
      status: 'read',
      dependencies: parsePluginDependencies((manifest as Record<string, unknown>)['dependencies']),
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function directoryDependencies(
  source: InstallableSource,
  fetchImpl: DirectoryFetch,
  unreadable: string,
  unavailable: string,
): Promise<PluginDependencyRef[]> {
  const manifest = await readManifestDependencies(source, fetchImpl);
  if (manifest.status === 'unavailable') throw new DirectorySourceUnavailableError(unavailable);
  const declared = source.record.dependencies === undefined ? [] : source.record.dependencies;
  const dependencies = mergePluginDependencies(declared, manifest.dependencies);
  if (!dependencies) throw new PluginDependencyError(unreadable);
  return dependencies;
}

function isDirectoryMarketplace(name: string): boolean {
  return DIRECTORY_MARKETPLACES.some((marketplace) => marketplace.name === name);
}

async function enabledVersionInMarketplace(
  db: DatabaseAdapter,
  userId: string,
  marketplace: string,
  pluginKey: string,
): Promise<string | null> {
  const rows = await db.query<{ installed_version: string }>(
    `select installation.installed_version
       from public.plugin_marketplace_installations installation
       join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where installation.user_id = $1
        and sources.user_id = $1
        and installation.enabled = true
        and entries.plugin_key = $2
        and sources.name = any($3::text[])
      limit 1`,
    [userId, pluginKey, [marketplace, shadowSourceName(marketplace)]],
  );
  return rows[0]?.installed_version ?? null;
}

function declaredVersion(version: string): string | null {
  return version.startsWith(UNDECLARED_VERSION_PREFIX) ? null : version;
}

function shownVersion(version: string): string {
  const declared = declaredVersion(version);
  return declared === null ? UNVERSIONED_COPY : (valid(declared) ?? declared);
}

interface DependencyTarget {
  name: string;
  marketplace: string;
  label: string;
  requiredBy: string;
  rootLabel: string;
}

async function directoryNode(
  context: DependencyContext,
  target: DependencyTarget,
): Promise<PluginDependencyNode<DependencyPlugin>> {
  const { name, marketplace, label, requiredBy, rootLabel } = target;
  const record = await context.findRecord(name);
  if (
    !record ||
    record.id !== name ||
    record.sourceFacet === SOURCE_FACET_BUILTIN ||
    record.marketplace?.name !== marketplace
  ) {
    throw new PluginDependencyError(
      `Dependency "${label}" (required by ${requiredBy}) is not in marketplace "${marketplace}", so ${rootLabel} was not installed.`,
    );
  }
  const checked = installableSource(record);
  if (!checked.ok) {
    throw new PluginDependencyError(
      `Dependency "${label}" (required by ${requiredBy}) cannot be installed in the web app, so install ${rootLabel} from the released CLI.`,
    );
  }
  const dependencies = await directoryDependencies(
    checked.source,
    context.fetchImpl,
    `Dependency "${label}" (required by ${requiredBy}) declares dependencies that cannot be read, so ${rootLabel} was not installed.`,
    `The manifest of dependency "${label}" could not be read from its repository right now, so ${rootLabel} was not installed.`,
  );
  return {
    name,
    marketplace,
    plugin: { kind: 'directory', source: checked.source, dependencies },
    dependencies,
  };
}

async function entryNode(
  context: DependencyContext,
  target: DependencyTarget,
): Promise<PluginDependencyNode<DependencyPlugin>> {
  const { name, marketplace, label, requiredBy, rootLabel } = target;
  const found = await findMarketplaceSourceEntry(context.db, context.userId, marketplace, name);
  if (!found) {
    const added = await hasMarketplaceSourceNamed(context.db, context.userId, marketplace);
    throw new PluginDependencyError(
      added
        ? `Dependency "${label}" (required by ${requiredBy}) is not in marketplace "${marketplace}", so ${rootLabel} was not installed.`
        : `Dependency "${label}" (required by ${requiredBy}) is in marketplace "${marketplace}", which you have not added. Add that marketplace, then install ${rootLabel} again.`,
    );
  }
  if (!found.dependencies) {
    throw new PluginDependencyError(
      `Dependency "${label}" (required by ${requiredBy}) declares dependencies that cannot be read, so ${rootLabel} was not installed.`,
    );
  }
  return { name, marketplace, plugin: { kind: 'entry', found }, dependencies: found.dependencies };
}

async function resolveMarketplaceDependencies(
  context: DependencyContext,
  root: DependencyRoot,
): Promise<ResolvedDependency[]> {
  const rootLabel = pluginLabel(root.name, root.marketplace);
  return resolvePluginDependencies<DependencyPlugin>(
    { name: root.name, marketplace: root.marketplace, dependencies: root.dependencies },
    async (reference, declaredBy) => {
      const declaringMarketplace = declaredBy.marketplace ?? root.marketplace;
      const marketplace = reference.marketplace ?? declaringMarketplace;
      const target: DependencyTarget = {
        name: reference.name,
        marketplace,
        label: pluginLabel(reference.name, marketplace),
        requiredBy: pluginLabel(declaredBy.name, declaringMarketplace),
        rootLabel,
      };
      if (root.bundled && marketplace === root.marketplace) {
        if (root.bundled.has(reference.name)) return null;
        throw new PluginDependencyError(
          `Dependency "${target.label}" (required by ${target.requiredBy}) is not in this upload, so ${rootLabel} was not installed. Add it to the same zip, or name the marketplace it comes from as ${reference.name}@<marketplace>.`,
        );
      }
      if (marketplace !== declaringMarketplace) {
        const enabled = await enabledVersionInMarketplace(
          context.db,
          context.userId,
          marketplace,
          reference.name,
        );
        if (enabled !== null) {
          const constraint: PluginVersionConstraint | null =
            reference.version === null
              ? null
              : { range: reference.version, requiredBy: target.requiredBy };
          if (constraint && unmetConstraint(declaredVersion(enabled), [constraint])) {
            throw new PluginDependencyError(
              installedOutsideRangeMessage(
                target.label,
                constraint,
                shownVersion(enabled),
                rootLabel,
              ),
            );
          }
          return null;
        }
        if (!root.allowlist.includes(marketplace)) {
          throw new PluginDependencyError(
            `Dependency "${target.label}" (required by ${target.requiredBy}) is in marketplace "${marketplace}", which is not in the allowlist. The ${root.marketplace} marketplace can list it in allowCrossMarketplaceDependenciesOn, or you can install ${target.label} yourself first and then install ${rootLabel} again.`,
          );
        }
      }
      return isDirectoryMarketplace(marketplace)
        ? directoryNode(context, target)
        : entryNode(context, target);
    },
  );
}

async function existingDirectoryInstallations(
  db: DatabaseAdapter,
  userId: string,
  sources: readonly InstallableSource[],
): Promise<Map<InstallableSource, ExistingInstallation>> {
  const existing = new Map<InstallableSource, ExistingInstallation>();
  if (sources.length === 0) return existing;
  const rows = await db.query<
    ExistingInstallation & { repository_url: string; plugin_key: string }
  >(
    `select installation.id, installation.enabled, installation.review_required,
            installation.installed_version, sources.repository_url, entries.plugin_key
       from public.plugin_marketplace_installations installation
       join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
       join public.plugin_marketplace_sources sources on sources.id = entries.source_id
      where installation.user_id = $1
        and sources.user_id = $1
        and sources.repository_url = any($2::text[])
        and entries.plugin_key = any($3::text[])`,
    [
      userId,
      [...new Set(sources.map((source) => source.repositoryUrl))],
      sources.map((source) => source.record.id),
    ],
  );
  for (const source of sources) {
    const row = rows.find(
      (candidate) =>
        candidate.repository_url === source.repositoryUrl &&
        candidate.plugin_key === source.record.id,
    );
    if (row) existing.set(source, row);
  }
  return existing;
}

async function existingEntryInstallations(
  db: DatabaseAdapter,
  userId: string,
  entryIds: readonly string[],
): Promise<Map<string, ExistingInstallation>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db.query<ExistingInstallation & { entry_id: string }>(
    `select id, enabled, review_required, installed_version, entry_id
       from public.plugin_marketplace_installations
      where user_id = $1 and entry_id = any($2::uuid[])`,
    [userId, entryIds],
  );
  return new Map(rows.map((row) => [row.entry_id, row]));
}

function listedVersion(plugin: DependencyPlugin): string {
  return plugin.kind === 'directory' ? plugin.source.record.version : plugin.found.entry.version;
}

async function listedOutsideRange(
  context: DependencyContext,
  dependency: ResolvedDependency,
  constraint: PluginVersionConstraint,
  rootLabel: string,
): Promise<string> {
  const listed = shownVersion(listedVersion(dependency.plugin));
  if (dependency.plugin.kind !== 'directory') {
    return listedOutsideRangeMessage(dependency.label, constraint, listed, rootLabel);
  }
  const { record, location } = dependency.plugin.source;
  const release = await releaseTagSatisfying(
    location.repositoryUrl,
    record.id,
    dependency.constraints,
    context.fetchImpl,
  );
  if (release.status === 'none') {
    return `Dependency "${dependency.label}" has no git tag satisfying ${constraint.range} (required by ${constraint.requiredBy}), so ${rootLabel} was not installed.`;
  }
  if (release.status === 'found') {
    return `Dependency "${dependency.label}" (required by ${constraint.requiredBy}) requires ${constraint.range}, and its marketplace lists ${listed}. The web app installs only the version its marketplace lists, so install ${rootLabel} from the released CLI, which installs ${release.tag}.`;
  }
  return listedOutsideRangeMessage(dependency.label, constraint, listed, rootLabel);
}

async function assertVersionConstraints(
  context: DependencyContext,
  dependency: ResolvedDependency,
  existing: ExistingInstallation | undefined,
  rootLabel: string,
): Promise<void> {
  if (dependency.constraints.length === 0) return;
  const conflict = conflictingConstraints(dependency.constraints);
  if (conflict) {
    throw new PluginDependencyError(
      conflictingConstraintsMessage(dependency.label, conflict, rootLabel),
    );
  }
  if (existing?.enabled) {
    const unmet = unmetConstraint(
      declaredVersion(existing.installed_version),
      dependency.constraints,
    );
    if (unmet) {
      throw new PluginDependencyError(
        installedOutsideRangeMessage(
          dependency.label,
          unmet,
          shownVersion(existing.installed_version),
          rootLabel,
        ),
      );
    }
    return;
  }
  const unmet = unmetConstraint(
    declaredVersion(listedVersion(dependency.plugin)),
    dependency.constraints,
  );
  if (unmet) {
    throw new PluginDependencyError(
      await listedOutsideRange(context, dependency, unmet, rootLabel),
    );
  }
}

export async function planMarketplaceDependencies(
  context: DependencyContext,
  root: DependencyRoot,
): Promise<DependencyPlan> {
  const rootLabel = pluginLabel(root.name, root.marketplace);
  const resolved = await resolveMarketplaceDependencies(context, root);
  const plan: DependencyPlan = { resolved, directory: [], entries: [], enable: [] };
  if (resolved.length === 0) return plan;

  const directorySources = resolved.flatMap((dependency) =>
    dependency.plugin.kind === 'directory' ? [dependency.plugin.source] : [],
  );
  const entryIds = resolved.flatMap((dependency) =>
    dependency.plugin.kind === 'entry' ? [dependency.plugin.found.entry.id] : [],
  );
  const [directoryInstalled, entryInstalled] = await Promise.all([
    existingDirectoryInstallations(context.db, context.userId, directorySources),
    existingEntryInstallations(context.db, context.userId, entryIds),
  ]);

  for (const dependency of resolved) {
    const { plugin } = dependency;
    const existing =
      plugin.kind === 'directory'
        ? directoryInstalled.get(plugin.source)
        : entryInstalled.get(plugin.found.entry.id);
    await assertVersionConstraints(context, dependency, existing, rootLabel);
    if (existing?.enabled) continue;
    if (existing?.review_required) {
      throw new PluginDependencyError(
        `Dependency "${dependency.label}" (required by ${dependency.requiredBy}) is turned off until you review the permissions it now asks for. Review it, then install ${rootLabel} again.`,
      );
    }
    if (existing) {
      plan.enable.push({ resolved: dependency, installationId: existing.id });
      continue;
    }
    if (plugin.kind === 'entry') {
      try {
        await assertMarketplaceEntryInstallable(context.db, plugin.found.entry);
      } catch (error) {
        if (!(error instanceof PluginPackageRefusedError)) throw error;
        throw new PluginDependencyError(
          `Dependency "${dependency.label}" (required by ${dependency.requiredBy}) cannot be installed, so ${rootLabel} was not installed. ${error.message}`,
        );
      }
      plan.entries.push({ resolved: dependency, found: plugin.found });
      continue;
    }
    const skills = await fetchPluginSkillFiles(
      { ...plugin.source.location, sha: plugin.source.sha },
      pluginContentPaths(plugin.source.record.runtime.components),
      context.fetchImpl,
    );
    if (skills.length === 0) {
      throw new DependencySkillsUnavailableError(
        `None of the skills of dependency "${dependency.label}" could be fetched from its repository right now, so ${rootLabel} was not installed.`,
      );
    }
    plan.directory.push({
      resolved: dependency,
      source: plugin.source,
      skills,
      dependencies: plugin.dependencies,
    });
  }
  return plan;
}

export function dependencyAdmissions(
  plan: DependencyPlan,
): { pluginKey: string; requiredBy: string }[] {
  return plan.resolved.map((dependency) => ({
    pluginKey: describeDependency(dependency.plugin).pluginId,
    requiredBy: dependency.requiredBy,
  }));
}

function describeDependency(
  plugin: DependencyPlugin,
): Omit<PluginInstalledDependency, 'requiredBy'> {
  if (plugin.kind === 'directory') {
    const { record } = plugin.source;
    return { pluginId: record.id, name: record.name, version: record.version };
  }
  const { entry } = plugin.found;
  return { pluginId: entry.pluginKey, name: entry.name, version: entry.version };
}

export function installedDependencies(
  plan: DependencyPlan,
  installationIds: ReadonlyMap<string, string>,
): InstalledDependency[] {
  const changed = [...plan.entries, ...plan.directory, ...plan.enable].map((item) => item.resolved);
  return plan.resolved
    .filter((dependency) => changed.includes(dependency))
    .flatMap((dependency) => {
      const installationId = installationIds.get(dependency.label);
      if (!installationId) return [];
      return [
        {
          ...describeDependency(dependency.plugin),
          requiredBy: dependency.requiredBy,
          installationId,
        },
      ];
    });
}
