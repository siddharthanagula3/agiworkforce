import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  isPluginEntryWebInstallable,
  type PluginInstallation,
  type PluginManifest,
  type PluginRegistryEntry,
} from '@agiworkforce/types';
import type {
  PluginConnectorRequirementState,
  PluginInstallationSettings,
} from '@agiworkforce/cloud-contracts';

import {
  diffPluginPermissions,
  normalizePluginPermissions,
} from '@agiworkforce/client-runtime/plugins';

import { AppError, ErrorCode } from '@/lib/errors';

import { withDisabledPluginSkills } from './enabled-plugin-ids';
import { getPluginRegistryEntry } from './plugin-registry-service';
import {
  assertPluginPackageInstallable,
  PluginPackageRefusedError,
} from './plugin-marketplace-service';
import {
  conflictingConstraints,
  conflictingConstraintsMessage,
  installedOutsideRangeMessage,
  listedOutsideRangeMessage,
  parsePluginDependencies,
  pluginDependencyLabel,
  PluginDependencyError,
  resolvePluginDependencies,
  unmetConstraint,
  type PluginDependencyNode,
  type ResolvedPluginDependency,
} from './plugin-dependencies';

interface PluginInstallationRow {
  plugin_id: string;
  installed_version: string;
  enabled: boolean;
  installed_at: string | Date;
  updated_at: string | Date;
}

interface PluginInstallationSettingsRow {
  plugin_id: string;
  enabled_skills: unknown;
  custom_example_prompts: unknown;
  declared_skills: unknown;
  required_connectors: unknown;
  example_prompts: unknown;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function mapInstallation(row: PluginInstallationRow): PluginInstallation {
  return {
    pluginId: row.plugin_id,
    installedVersion: row.installed_version,
    enabled: row.enabled,
    installedAt: toIso(row.installed_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listPluginInstallations(
  db: DatabaseAdapter,
  userId: string,
): Promise<PluginInstallation[]> {
  const rows = await db.query<PluginInstallationRow>(
    `select plugin_id, installed_version, enabled, installed_at, updated_at
       from public.plugin_installations
      where user_id = $1
      order by installed_at asc, plugin_id asc`,
    [userId],
  );
  return rows.map(mapInstallation);
}

export { PluginPackageRefusedError };

export class PluginPermissionReviewRequiredError extends AppError {
  readonly pluginId: string;
  readonly added: string[];
  readonly approved: string[];

  constructor(pluginId: string, added: string[], approved: string[]) {
    super(
      ErrorCode.CONFLICT,
      `${pluginId} now asks for permissions you have not approved: ${added.join(', ')}. Review them before it runs again.`,
      409,
    );
    Object.setPrototypeOf(this, PluginPermissionReviewRequiredError.prototype);
    this.name = 'PluginPermissionReviewRequiredError';
    this.pluginId = pluginId;
    this.added = added;
    this.approved = approved;
    this.asUserSafe();
  }
}

async function readApprovedPermissions(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<string[] | null> {
  const rows = await db.query<{ approved_permissions: unknown }>(
    `select approved_permissions
       from public.plugin_installations
      where user_id = $1 and plugin_id = $2
      limit 1`,
    [userId, pluginId],
  );
  return rows[0] ? toStringArray(rows[0].approved_permissions) : null;
}

/**
 * Fails closed before any row is written: signed digest, passing scan verdict,
 * and no permission beyond what this member approved.
 */
export class PluginVersionSuspendedError extends AppError {
  constructor(pluginId: string, version: string, reason: string) {
    super(
      ErrorCode.CONFLICT,
      `${pluginId} ${version} was suspended and cannot be installed: ${reason}`,
      409,
    );
    Object.setPrototypeOf(this, PluginVersionSuspendedError.prototype);
    this.name = 'PluginVersionSuspendedError';
    this.asUserSafe();
  }
}

async function assertVersionNotSuspended(
  db: DatabaseAdapter,
  pluginId: string,
  version: string,
): Promise<void> {
  const rows = await db.query<{ status: string; lifecycle_reason: string | null }>(
    `select status, lifecycle_reason from public.plugin_registry_versions
      where plugin_id = $1 and version = $2`,
    [pluginId, version],
  );
  const pinned = rows[0];
  if (pinned?.status !== 'suspended') return;
  throw new PluginVersionSuspendedError(
    pluginId,
    version,
    pinned.lifecycle_reason ?? 'no reason was recorded',
  );
}

export interface RegistryPlugin {
  entry: PluginRegistryEntry;
  manifest: PluginManifest;
}

export interface WebPluginInstallDependency {
  plugin: RegistryPlugin;
  requiredBy: string;
  satisfied: boolean;
}

export interface WebPluginInstallPlan {
  root: RegistryPlugin;
  dependencies: WebPluginInstallDependency[];
}

interface PreparedInstallation {
  pluginId: string;
  version: string;
  declaredSkills: string[];
  permissions: string[];
}

async function findWebInstallablePlugin(
  db: DatabaseAdapter,
  pluginId: string,
): Promise<RegistryPlugin | null> {
  const found = await getPluginRegistryEntry(db, pluginId);
  if (!found || !isPluginEntryWebInstallable(found.entry) || !found.manifest) return null;
  return { entry: found.entry, manifest: found.manifest };
}

function registryDependencyNode(
  plugin: RegistryPlugin,
  rootId: string,
): PluginDependencyNode<RegistryPlugin> {
  const dependencies = parsePluginDependencies(plugin.manifest.dependencies);
  if (!dependencies) {
    throw new PluginDependencyError(
      `${plugin.entry.id} declares dependencies that cannot be read, so ${rootId} was not installed.`,
    );
  }
  return { name: plugin.entry.id, marketplace: null, plugin, dependencies };
}

async function satisfiedRegistryPlugins(
  db: DatabaseAdapter,
  userId: string,
  pluginIds: readonly string[],
): Promise<Map<string, string>> {
  const rows = await db.query<{ plugin_id: string; installed_version: string }>(
    `select installation.plugin_id, installation.installed_version
       from public.plugin_installations installation
       left join public.plugin_registry_versions pinned
              on pinned.plugin_id = installation.plugin_id
             and pinned.version = installation.installed_version
      where installation.user_id = $1
        and installation.plugin_id = any($2::text[])
        and installation.enabled = true
        and installation.review_required = false
        and coalesce(pinned.status, 'published') <> 'suspended'`,
    [userId, pluginIds],
  );
  return new Map(rows.map((row) => [row.plugin_id, row.installed_version]));
}

function assertRegistryVersionConstraints(
  dependency: ResolvedPluginDependency<RegistryPlugin>,
  installedVersion: string | undefined,
  rootId: string,
): void {
  if (dependency.constraints.length === 0) return;
  const conflict = conflictingConstraints(dependency.constraints);
  if (conflict) {
    throw new PluginDependencyError(
      conflictingConstraintsMessage(dependency.label, conflict, rootId),
    );
  }
  const version = installedVersion ?? dependency.plugin.entry.version;
  const unmet = unmetConstraint(version, dependency.constraints);
  if (!unmet) return;
  throw new PluginDependencyError(
    installedVersion === undefined
      ? listedOutsideRangeMessage(dependency.label, unmet, version, rootId)
      : installedOutsideRangeMessage(dependency.label, unmet, version, rootId),
  );
}

export async function planWebPluginInstall(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<WebPluginInstallPlan | null> {
  const root = await findWebInstallablePlugin(db, pluginId);
  if (!root) return null;

  const rootId = root.entry.id;
  const resolved = await resolvePluginDependencies(
    registryDependencyNode(root, rootId),
    async (reference, declaredBy) => {
      const label = pluginDependencyLabel(reference);
      const requiredBy = declaredBy.name;
      if (reference.marketplace !== null) {
        throw new PluginDependencyError(
          `Dependency "${label}" (required by ${requiredBy}) is in marketplace "${reference.marketplace}", which is not in the allowlist. A built-in plugin depends on built-in plugins only, so ${rootId} was not installed.`,
        );
      }
      const found = await findWebInstallablePlugin(db, reference.name);
      if (!found) {
        throw new PluginDependencyError(
          `Dependency "${label}" (required by ${requiredBy}) is not available to install here, so ${rootId} was not installed.`,
        );
      }
      return registryDependencyNode(found, rootId);
    },
  );
  if (resolved.length === 0) return { root, dependencies: [] };

  const satisfied = await satisfiedRegistryPlugins(
    db,
    userId,
    resolved.map((dependency) => dependency.plugin.entry.id),
  );
  for (const dependency of resolved) {
    assertRegistryVersionConstraints(dependency, satisfied.get(dependency.plugin.entry.id), rootId);
  }
  return {
    root,
    dependencies: resolved.map(({ plugin, requiredBy }) => ({
      plugin,
      requiredBy,
      satisfied: satisfied.has(plugin.entry.id),
    })),
  };
}

async function prepareInstallation(
  db: DatabaseAdapter,
  userId: string,
  plugin: RegistryPlugin,
): Promise<PreparedInstallation> {
  const { entry } = plugin;
  await assertVersionNotSuspended(db, entry.id, entry.version);

  await assertPluginPackageInstallable(db, {
    pluginId: entry.id,
    version: entry.version,
    source: entry.source,
    publisherKind: entry.publisher.kind,
    sha256: entry.integrity.sha256,
    signature: entry.integrity.signature,
    signatureAlgorithm: entry.integrity.signatureAlgorithm,
  });

  const declared = normalizePluginPermissions(entry.permissions);
  const previouslyApproved = await readApprovedPermissions(db, userId, entry.id);
  const diff = diffPluginPermissions(previouslyApproved ?? declared, declared);

  if (previouslyApproved !== null && diff.expands) {
    await db.execute(
      `update public.plugin_installations
          set enabled = false,
              review_required = true,
              pending_permissions = $3::jsonb,
              updated_at = now()
        where user_id = $1 and plugin_id = $2`,
      [userId, entry.id, JSON.stringify(declared)],
    );
    throw new PluginPermissionReviewRequiredError(entry.id, diff.added, previouslyApproved);
  }

  return {
    pluginId: entry.id,
    version: entry.version,
    declaredSkills: entry.declaredSkills,
    permissions: declared,
  };
}

export async function installWebPlugin(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
  plan?: WebPluginInstallPlan,
): Promise<PluginInstallation | null> {
  const resolved = plan ?? (await planWebPluginInstall(db, userId, pluginId));
  if (!resolved) return null;

  const dependencies: PreparedInstallation[] = [];
  for (const dependency of resolved.dependencies) {
    if (!dependency.satisfied) {
      dependencies.push(await prepareInstallation(db, userId, dependency.plugin));
    }
  }
  const root = await prepareInstallation(db, userId, resolved.root);

  for (const dependency of dependencies.reverse()) {
    await writeInstallation(db, userId, dependency);
  }
  return writeInstallation(db, userId, root);
}

async function writeInstallation(
  db: DatabaseAdapter,
  userId: string,
  prepared: PreparedInstallation,
): Promise<PluginInstallation | null> {
  const rows = await db.query<PluginInstallationRow>(
    `insert into public.plugin_installations
       (user_id, plugin_id, installed_version, enabled, enabled_skills,
        approved_permissions, pending_permissions, review_required, installed_at, updated_at)
     values ($1, $2, $3, true, $4::jsonb, $5::jsonb, null, false, now(), now())
     on conflict (user_id, plugin_id) do update
       set installed_version = excluded.installed_version,
           enabled = true,
           approved_permissions = excluded.approved_permissions,
           pending_permissions = null,
           review_required = false,
           updated_at = now()
     returning plugin_id, installed_version, enabled, installed_at, updated_at`,
    [
      userId,
      prepared.pluginId,
      prepared.version,
      JSON.stringify(prepared.declaredSkills),
      JSON.stringify(prepared.permissions),
    ],
  );
  return rows[0] ? mapInstallation(rows[0]) : null;
}

/**
 * The only way out of review, and an explicit member act: the expanded set is
 * written as approved, never inferred from the registry.
 */
export async function approvePendingPluginPermissions(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<PluginInstallation | null> {
  const rows = await db.query<PluginInstallationRow>(
    `update public.plugin_installations
        set approved_permissions = coalesce(pending_permissions, approved_permissions),
            pending_permissions = null,
            review_required = false,
            enabled = true,
            updated_at = now()
      where user_id = $1 and plugin_id = $2 and review_required = true
      returning plugin_id, installed_version, enabled, installed_at, updated_at`,
    [userId, pluginId],
  );
  return rows[0] ? mapInstallation(rows[0]) : null;
}

export interface PluginPermissionReview {
  pluginId: string;
  approved: string[];
  pending: string[];
  added: string[];
  removed: string[];
}

export async function listPluginPermissionReviews(
  db: DatabaseAdapter,
  userId: string,
): Promise<PluginPermissionReview[]> {
  const rows = await db.query<{
    plugin_id: string;
    approved_permissions: unknown;
    pending_permissions: unknown;
  }>(
    `select plugin_id, approved_permissions, pending_permissions
       from public.plugin_installations
      where user_id = $1 and review_required = true
      order by plugin_id asc`,
    [userId],
  );
  return rows.map((row) => {
    const approved = toStringArray(row.approved_permissions);
    const pending = toStringArray(row.pending_permissions);
    const diff = diffPluginPermissions(approved, pending);
    return {
      pluginId: row.plugin_id,
      approved,
      pending,
      added: diff.added,
      removed: diff.removed,
    };
  });
}

export async function setWebPluginEnabled(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
  enabled: boolean,
): Promise<PluginInstallation | null> {
  const rows = await db.query<PluginInstallationRow>(
    `update public.plugin_installations
        set enabled = $3, updated_at = now()
      where user_id = $1 and plugin_id = $2
      returning plugin_id, installed_version, enabled, installed_at, updated_at`,
    [userId, pluginId, enabled],
  );
  return rows[0] ? mapInstallation(rows[0]) : null;
}

export async function uninstallWebPlugin(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<boolean> {
  const rows = await db.query<{ plugin_id: string }>(
    `delete from public.plugin_installations
      where user_id = $1 and plugin_id = $2
      returning plugin_id`,
    [userId, pluginId],
  );
  return rows.length > 0;
}

export async function listEnabledPluginIds(
  db: DatabaseAdapter,
  userId: string,
): Promise<Set<string>> {
  const rows = await db.query<{
    plugin_id: string;
    enabled_skills: unknown;
    declared_skills: unknown;
  }>(
    `select installation.plugin_id, installation.enabled_skills, registry.declared_skills
       from public.plugin_installations installation
       join public.plugin_registry_entries registry on registry.id = installation.plugin_id
       left join public.plugin_registry_versions pinned
              on pinned.plugin_id = installation.plugin_id
             and pinned.version = installation.installed_version
      where installation.user_id = $1
        and installation.enabled = true
        and installation.review_required = false
        and registry.status = 'published'
        and registry.web_installable = true
        and coalesce(pinned.status, 'published') <> 'suspended'`,
    [userId],
  );
  const disabledSkillNames = rows.flatMap((row) => {
    const enabled = new Set(toStringArray(row.enabled_skills));
    return toStringArray(row.declared_skills).filter((skill) => !enabled.has(skill));
  });
  return withDisabledPluginSkills(
    rows.map((row) => row.plugin_id),
    disabledSkillNames,
  );
}

/**
 * Real install counts, grouped by plugin, for the public catalogue.
 *
 * `db` must be the privileged connection (`getNeonDb()`, never a
 * `.withUser()`-scoped one), `plugin_installations` has FORCE ROW LEVEL
 * SECURITY, so a caller-scoped connection would only ever see its own row and
 * every count would collapse to 0 or 1 (the same shape of bug
 * `resolveOrganizationEntitlementPlan` in `org-entitlements.ts` was fixed for).
 * The query selects only `plugin_id` and a count, never `user_id`, so who
 * installed a plugin is never observable from the result.
 */
export async function countPluginInstallations(db: DatabaseAdapter): Promise<Map<string, number>> {
  const rows = await db.query<{ plugin_id: string; install_count: string | number }>(
    `select plugin_id, count(*) as install_count
       from public.plugin_installations
      group by plugin_id`,
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = Number(row.install_count);
    counts.set(row.plugin_id, Number.isFinite(value) ? value : 0);
  }
  return counts;
}

async function connectorRequirementStates(
  db: DatabaseAdapter,
  userId: string,
  connectorIds: readonly string[],
): Promise<PluginConnectorRequirementState[]> {
  if (connectorIds.length === 0) return [];
  const rows = await db.query<{ connector_id: string }>(
    `select connector_id
       from public.user_connectors
      where user_id = $1 and connector_id = any($2::text[]) and is_active = true`,
    [userId, connectorIds],
  );
  const connected = new Set(rows.map((row) => row.connector_id));
  return connectorIds.map((connectorId) => ({
    connectorId,
    connected: connected.has(connectorId),
  }));
}

export async function getPluginInstallationSettings(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<PluginInstallationSettings | null> {
  const rows = await db.query<PluginInstallationSettingsRow>(
    `select installation.plugin_id, installation.enabled_skills, installation.custom_example_prompts,
            registry.declared_skills, registry.required_connectors, registry.example_prompts
       from public.plugin_installations installation
       join public.plugin_registry_entries registry on registry.id = installation.plugin_id
      where installation.user_id = $1 and installation.plugin_id = $2
      limit 1`,
    [userId, pluginId],
  );
  const row = rows[0];
  if (!row) return null;

  const requiredConnectors = toStringArray(row.required_connectors);
  const customExamplePrompts = toStringArray(row.custom_example_prompts);
  return {
    pluginId: row.plugin_id,
    enabledSkills: toStringArray(row.enabled_skills),
    examplePrompts:
      customExamplePrompts.length > 0 ? customExamplePrompts : toStringArray(row.example_prompts),
    connectors: await connectorRequirementStates(db, userId, requiredConnectors),
    agents: [],
  };
}

export interface PluginInstallationSettingsUpdate {
  enabledSkills?: string[];
  customExamplePrompts?: string[] | null;
}

export async function updatePluginInstallationSettings(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
  update: PluginInstallationSettingsUpdate,
): Promise<PluginInstallationSettings | null> {
  const rows = await db.query<{ declared_skills: unknown }>(
    `select declared_skills from public.plugin_registry_entries where id = $1 limit 1`,
    [pluginId],
  );
  const declaredSkills = new Set(toStringArray(rows[0]?.declared_skills));

  if (update.enabledSkills !== undefined) {
    const nextEnabledSkills = update.enabledSkills.filter((skill) => declaredSkills.has(skill));
    await db.execute(
      `update public.plugin_installations
          set enabled_skills = $3::jsonb, updated_at = now()
        where user_id = $1 and plugin_id = $2`,
      [userId, pluginId, JSON.stringify(nextEnabledSkills)],
    );
  }

  if (update.customExamplePrompts !== undefined) {
    await db.execute(
      `update public.plugin_installations
          set custom_example_prompts = $3::jsonb, updated_at = now()
        where user_id = $1 and plugin_id = $2`,
      [
        userId,
        pluginId,
        update.customExamplePrompts === null ? null : JSON.stringify(update.customExamplePrompts),
      ],
    );
  }

  return getPluginInstallationSettings(db, userId, pluginId);
}
