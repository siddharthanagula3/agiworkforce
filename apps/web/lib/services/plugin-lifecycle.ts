import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { z } from 'zod';
import { isPluginSemver } from '@agiworkforce/types';

import { toIsoTimestamp } from '@/lib/server/iso-timestamps';
import { AppError, ErrorCode } from '@/lib/errors';

export const PLUGIN_VERSION_STATUSES = [
  'draft',
  'in_review',
  'published',
  'deprecated',
  'suspended',
] as const;

export type PluginVersionStatus = (typeof PLUGIN_VERSION_STATUSES)[number];

export const PLUGIN_LIFECYCLE_ACTIONS = [
  'submit',
  'publish',
  'deprecate',
  'suspend',
  'restore',
  'rollback',
] as const;

export type PluginLifecycleAction = (typeof PLUGIN_LIFECYCLE_ACTIONS)[number];

const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

const VersionSchema = z.string().refine(isPluginSemver, 'Invalid semantic version');
const PluginIdSchema = z.string().regex(PLUGIN_ID);
const ReasonSchema = z.string().trim().min(1).max(2000);
const StatusSchema = z.enum(PLUGIN_VERSION_STATUSES);

/**
 * What a version may become. A stopped version is restored by republishing
 * rather than by deletion, so nothing in this table is ever removed and the
 * history a rollback reads stays complete.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<PluginVersionStatus, readonly PluginVersionStatus[]>> =
  Object.freeze({
    draft: ['in_review', 'published'],
    in_review: ['draft', 'published'],
    published: ['deprecated', 'suspended'],
    deprecated: ['published', 'suspended'],
    suspended: ['published'],
  });

export class PluginLifecycleError extends AppError {
  constructor(message: string) {
    super(ErrorCode.CONFLICT, message, 409);
    Object.setPrototypeOf(this, PluginLifecycleError.prototype);
    this.name = 'PluginLifecycleError';
    this.asUserSafe();
  }
}

export interface PluginVersionRecord {
  pluginId: string;
  version: string;
  status: PluginVersionStatus;
  manifestUrl: string | null;
  sha256: string | null;
  declaredSkills: string[];
  permissions: string[];
  changelog: string;
  lifecycleReason: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface PluginVersionRow extends Record<string, unknown> {
  plugin_id: string;
  version: string;
  status: string;
  manifest_url: string | null;
  sha256: string | null;
  declared_skills: unknown;
  permissions: unknown;
  changelog: string;
  lifecycle_reason: string | null;
  published_at: string | Date | null;
  created_at: string | Date;
}

const VERSION_COLUMNS = `plugin_id, version, status, manifest_url, sha256,
   declared_skills, permissions, changelog, lifecycle_reason, published_at, created_at`;

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function mapVersion(row: PluginVersionRow): PluginVersionRecord {
  return {
    pluginId: row.plugin_id,
    version: row.version,
    status: StatusSchema.parse(row.status),
    manifestUrl: row.manifest_url,
    sha256: row.sha256,
    declaredSkills: stringArray(row.declared_skills),
    permissions: stringArray(row.permissions),
    changelog: row.changelog,
    lifecycleReason: row.lifecycle_reason,
    publishedAt: toIsoTimestamp(row.published_at),
    createdAt: z.string().datetime().parse(toIsoTimestamp(row.created_at)),
  };
}

export async function listPluginVersions(
  db: DatabaseAdapter,
  pluginId: string,
): Promise<PluginVersionRecord[]> {
  const rows = await db.query<PluginVersionRow>(
    `select ${VERSION_COLUMNS} from public.plugin_registry_versions
      where plugin_id = $1
      order by coalesce(published_at, created_at) desc, version desc`,
    [PluginIdSchema.parse(pluginId)],
  );
  return rows.map(mapVersion);
}

async function readVersion(
  db: DatabaseAdapter,
  pluginId: string,
  version: string,
): Promise<PluginVersionRecord | null> {
  const rows = await db.query<PluginVersionRow>(
    `select ${VERSION_COLUMNS} from public.plugin_registry_versions
      where plugin_id = $1 and version = $2`,
    [pluginId, version],
  );
  return rows[0] ? mapVersion(rows[0]) : null;
}

export interface PluginVersionDiff {
  pluginId: string;
  from: string | null;
  to: string;
  changelog: string;
  addedSkills: string[];
  removedSkills: string[];
  addedPermissions: string[];
  removedPermissions: string[];
  /** A member must approve before the update applies, never silently. */
  requiresPermissionReview: boolean;
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const held = new Set(right);
  return left.filter((item) => !held.has(item)).sort();
}

/**
 * What changes between two versions, in the terms a member decides on: the
 * skills they gain or lose and, above all, the permissions the new version asks
 * for that the old one did not.
 */
export function diffPluginVersionRecords(
  from: PluginVersionRecord | null,
  to: PluginVersionRecord,
): PluginVersionDiff {
  const addedPermissions = difference(to.permissions, from?.permissions ?? to.permissions);
  return {
    pluginId: to.pluginId,
    from: from?.version ?? null,
    to: to.version,
    changelog: to.changelog,
    addedSkills: difference(to.declaredSkills, from?.declaredSkills ?? to.declaredSkills),
    removedSkills: difference(from?.declaredSkills ?? to.declaredSkills, to.declaredSkills),
    addedPermissions,
    removedPermissions: difference(from?.permissions ?? to.permissions, to.permissions),
    requiresPermissionReview: addedPermissions.length > 0,
  };
}

export async function diffPluginVersions(
  db: DatabaseAdapter,
  input: { pluginId: string; from: string | null; to: string },
): Promise<PluginVersionDiff | null> {
  const pluginId = PluginIdSchema.parse(input.pluginId);
  const to = await readVersion(db, pluginId, VersionSchema.parse(input.to));
  if (!to) return null;
  const from = input.from ? await readVersion(db, pluginId, VersionSchema.parse(input.from)) : null;
  return diffPluginVersionRecords(from, to);
}

async function recordLifecycleEvent(
  db: DatabaseAdapter,
  input: {
    pluginId: string;
    version: string;
    action: PluginLifecycleAction;
    fromStatus: string | null;
    toStatus: PluginVersionStatus;
    reason: string | null;
    actorUserId: string;
  },
): Promise<void> {
  await db.execute(
    `insert into public.plugin_registry_lifecycle_events
       (plugin_id, version, action, from_status, to_status, reason, actor_user_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.pluginId,
      input.version,
      input.action,
      input.fromStatus,
      input.toStatus,
      input.reason,
      z.string().min(1).max(255).parse(input.actorUserId),
    ],
  );
}

function assertTransition(from: PluginVersionStatus, to: PluginVersionStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new PluginLifecycleError(
      `A ${from} plugin version cannot become ${to}. Allowed from ${from}: ${ALLOWED_TRANSITIONS[from].join(', ')}.`,
    );
  }
}

/**
 * Repoint the entry at one of its versions. The entry's own columns stay the
 * single thing every existing reader consults, so publishing and rollback are
 * the same write with a different target.
 */
async function pointEntryAtVersion(
  db: DatabaseAdapter,
  target: PluginVersionRecord,
  entryStatus: 'published' | 'deprecated',
): Promise<void> {
  await db.execute(
    `update public.plugin_registry_entries
        set version = $2,
            status = $3,
            manifest_url = $4,
            sha256 = $5,
            declared_skills = $6::jsonb,
            permissions = $7::jsonb,
            updated_at = now()
      where id = $1`,
    [
      target.pluginId,
      target.version,
      entryStatus,
      target.manifestUrl,
      target.sha256,
      JSON.stringify(target.declaredSkills),
      JSON.stringify(target.permissions),
    ],
  );
}

export interface PublishPluginVersionInput {
  pluginId: string;
  version: string;
  actorUserId: string;
  manifestUrl?: string | null;
  sha256?: string | null;
  declaredSkills?: string[];
  permissions?: string[];
  changelog?: string;
}

/**
 * Publish a version and make it the one the catalogue offers. A version that
 * was never drafted is created here, so a first publish needs no migration.
 */
export async function publishPluginVersion(
  db: DatabaseAdapter,
  input: PublishPluginVersionInput,
): Promise<PluginVersionRecord> {
  const pluginId = PluginIdSchema.parse(input.pluginId);
  const version = VersionSchema.parse(input.version);
  const existing = await readVersion(db, pluginId, version);
  if (existing) assertTransition(existing.status, 'published');

  const rows = await db.query<PluginVersionRow>(
    `insert into public.plugin_registry_versions
       (plugin_id, version, status, manifest_url, sha256, declared_skills,
        permissions, changelog, lifecycle_reason, published_at)
     values ($1, $2, 'published', $3, $4, $5::jsonb, $6::jsonb, $7, null, now())
     on conflict (plugin_id, version) do update
       set status = 'published',
           manifest_url = coalesce(excluded.manifest_url, plugin_registry_versions.manifest_url),
           sha256 = coalesce(excluded.sha256, plugin_registry_versions.sha256),
           declared_skills = excluded.declared_skills,
           permissions = excluded.permissions,
           changelog = excluded.changelog,
           lifecycle_reason = null,
           published_at = coalesce(plugin_registry_versions.published_at, now()),
           updated_at = now()
     returning ${VERSION_COLUMNS}`,
    [
      pluginId,
      version,
      input.manifestUrl ?? existing?.manifestUrl ?? null,
      input.sha256 ?? existing?.sha256 ?? null,
      JSON.stringify(input.declaredSkills ?? existing?.declaredSkills ?? []),
      JSON.stringify(input.permissions ?? existing?.permissions ?? []),
      input.changelog ?? existing?.changelog ?? '',
    ],
  );
  const published = mapVersion(rows[0] as PluginVersionRow);
  await pointEntryAtVersion(db, published, 'published');
  await recordLifecycleEvent(db, {
    pluginId,
    version,
    action: 'publish',
    fromStatus: existing?.status ?? null,
    toStatus: 'published',
    reason: null,
    actorUserId: input.actorUserId,
  });
  return published;
}

export async function submitPluginVersionForReview(
  db: DatabaseAdapter,
  input: { pluginId: string; version: string; actorUserId: string },
): Promise<PluginVersionRecord> {
  return moveVersion(db, { ...input, action: 'submit', toStatus: 'in_review', reason: null });
}

export async function deprecatePluginVersion(
  db: DatabaseAdapter,
  input: { pluginId: string; version: string; reason: string; actorUserId: string },
): Promise<PluginVersionRecord> {
  return moveVersion(db, {
    ...input,
    action: 'deprecate',
    toStatus: 'deprecated',
    reason: ReasonSchema.parse(input.reason),
  });
}

/**
 * Stop one version fleet-wide. Installations pinned to it are disabled and told
 * why; they are not deleted, so an admin who suspends by mistake can restore
 * the version and the install comes back with its settings intact.
 */
export async function suspendPluginVersion(
  db: DatabaseAdapter,
  input: { pluginId: string; version: string; reason: string; actorUserId: string },
): Promise<{ version: PluginVersionRecord; installationsStopped: number }> {
  const reason = ReasonSchema.parse(input.reason);
  const version = await moveVersion(db, {
    ...input,
    action: 'suspend',
    toStatus: 'suspended',
    reason,
  });
  const stopped = await db.query<{ id: string }>(
    `update public.plugin_installations
        set enabled = false, updated_at = now()
      where plugin_id = $1 and installed_version = $2 and enabled = true
      returning id`,
    [version.pluginId, version.version],
  );
  return { version, installationsStopped: stopped.length };
}

async function moveVersion(
  db: DatabaseAdapter,
  input: {
    pluginId: string;
    version: string;
    action: PluginLifecycleAction;
    toStatus: PluginVersionStatus;
    reason: string | null;
    actorUserId: string;
  },
): Promise<PluginVersionRecord> {
  const pluginId = PluginIdSchema.parse(input.pluginId);
  const version = VersionSchema.parse(input.version);
  const existing = await readVersion(db, pluginId, version);
  if (!existing) throw new PluginLifecycleError(`${pluginId} has no version ${version}.`);
  assertTransition(existing.status, input.toStatus);

  const rows = await db.query<PluginVersionRow>(
    `update public.plugin_registry_versions
        set status = $3, lifecycle_reason = $4, updated_at = now()
      where plugin_id = $1 and version = $2
      returning ${VERSION_COLUMNS}`,
    [pluginId, version, input.toStatus, input.reason],
  );
  const moved = mapVersion(rows[0] as PluginVersionRow);

  // `PluginRegistryStatus` has no `suspended`, so an entry whose current
  // version is stopped reads as `deprecated`: the existing value that already
  // means do not install. Rollback is what moves it off that.
  const current = await currentEntryVersion(db, pluginId);
  if (current === version && (input.toStatus === 'deprecated' || input.toStatus === 'suspended')) {
    await pointEntryAtVersion(db, moved, 'deprecated');
  }

  await recordLifecycleEvent(db, {
    pluginId,
    version,
    action: input.action,
    fromStatus: existing.status,
    toStatus: input.toStatus,
    reason: input.reason,
    actorUserId: input.actorUserId,
  });
  return moved;
}

async function currentEntryVersion(db: DatabaseAdapter, pluginId: string): Promise<string | null> {
  const rows = await db.query<{ version: string }>(
    `select version from public.plugin_registry_entries where id = $1`,
    [pluginId],
  );
  return rows[0]?.version ?? null;
}

export interface PluginRollbackResult {
  restored: PluginVersionRecord;
  from: string | null;
  installationsMoved: number;
}

/**
 * Restore the last known-good pin: the newest version still published, other
 * than the one the entry currently points at. Installations sitting on the
 * withdrawn version are moved back to it, because leaving them pinned to a
 * version nobody may install is the state rollback exists to end.
 */
export async function rollbackPlugin(
  db: DatabaseAdapter,
  input: { pluginId: string; actorUserId: string },
): Promise<PluginRollbackResult> {
  const pluginId = PluginIdSchema.parse(input.pluginId);
  const current = await currentEntryVersion(db, pluginId);
  if (current === null) throw new PluginLifecycleError(`${pluginId} is not in the registry.`);

  const rows = await db.query<PluginVersionRow>(
    `select ${VERSION_COLUMNS} from public.plugin_registry_versions
      where plugin_id = $1 and status = 'published' and version <> $2
      order by published_at desc
      limit 1`,
    [pluginId, current],
  );
  const target = rows[0] ? mapVersion(rows[0]) : null;
  if (!target) {
    throw new PluginLifecycleError(
      `${pluginId} has no earlier published version to roll back to, so ${current} cannot be withdrawn this way.`,
    );
  }

  await pointEntryAtVersion(db, target, 'published');
  const moved = await db.query<{ id: string }>(
    `update public.plugin_installations
        set installed_version = $3, updated_at = now()
      where plugin_id = $1 and installed_version = $2
      returning id`,
    [pluginId, current, target.version],
  );
  await recordLifecycleEvent(db, {
    pluginId,
    version: target.version,
    action: 'rollback',
    fromStatus: current,
    toStatus: 'published',
    reason: `Rolled back from ${current}.`,
    actorUserId: input.actorUserId,
  });
  return { restored: target, from: current, installationsMoved: moved.length };
}

export interface PluginUpdateOffer {
  pluginId: string;
  installedVersion: string;
  latestVersion: string;
  diff: PluginVersionDiff;
  /** The installed version was stopped, so this is a repair, not an upgrade. */
  installedVersionStopped: boolean;
}

/**
 * Every installation of this member that has a newer published version to move
 * to, with the diff they decide on. An installation pinned to a suspended or
 * deprecated version is listed even when nothing newer exists, because that one
 * needs attention most.
 */
export async function listPluginUpdateOffers(
  db: DatabaseAdapter,
  userId: string,
): Promise<PluginUpdateOffer[]> {
  const rows = await db.query<{
    plugin_id: string;
    installed_version: string;
    installed_status: string | null;
    latest_version: string;
  }>(
    `select installation.plugin_id,
            installation.installed_version,
            pinned.status as installed_status,
            entry.version as latest_version
       from public.plugin_installations installation
       join public.plugin_registry_entries entry on entry.id = installation.plugin_id
       left join public.plugin_registry_versions pinned
              on pinned.plugin_id = installation.plugin_id
             and pinned.version = installation.installed_version
      where installation.user_id = $1
        and (
          entry.version <> installation.installed_version
          or pinned.status in ('deprecated', 'suspended')
        )
      order by installation.plugin_id asc`,
    [userId],
  );

  const offers: PluginUpdateOffer[] = [];
  for (const row of rows) {
    const diff = await diffPluginVersions(db, {
      pluginId: row.plugin_id,
      from: row.installed_version,
      to: row.latest_version,
    });
    if (!diff) continue;
    offers.push({
      pluginId: row.plugin_id,
      installedVersion: row.installed_version,
      latestVersion: row.latest_version,
      diff,
      installedVersionStopped:
        row.installed_status === 'suspended' || row.installed_status === 'deprecated',
    });
  }
  return offers;
}

export interface AppliedPluginUpdate {
  pluginId: string;
  fromVersion: string;
  toVersion: string;
  diff: PluginVersionDiff;
  /** The pin was stopped, so applying this update is what puts the pack back. */
  reEnabled: boolean;
}

/**
 * Move one installation onto a newer published version. A version that asks for
 * a permission the installed one did not have never applies on its own: the
 * caller has to name each added permission, which is what the diff screen asks
 * the member to approve.
 */
export async function applyPluginUpdate(
  db: DatabaseAdapter,
  input: {
    userId: string;
    pluginId: string;
    toVersion: string;
    acknowledgedPermissions?: readonly string[];
  },
): Promise<AppliedPluginUpdate> {
  const pluginId = PluginIdSchema.parse(input.pluginId);
  const toVersion = VersionSchema.parse(input.toVersion);

  const installed = await db.query<{ installed_version: string }>(
    `select installed_version from public.plugin_installations
      where user_id = $1 and plugin_id = $2`,
    [input.userId, pluginId],
  );
  const fromVersion = installed[0]?.installed_version;
  if (!fromVersion) throw new PluginLifecycleError(`${pluginId} is not installed.`);
  if (fromVersion === toVersion) {
    throw new PluginLifecycleError(`${pluginId} is already on ${toVersion}.`);
  }

  const target = await readVersion(db, pluginId, toVersion);
  if (!target) throw new PluginLifecycleError(`${pluginId} has no version ${toVersion}.`);
  if (target.status !== 'published') {
    throw new PluginLifecycleError(
      `${pluginId} ${toVersion} is ${target.status}, so it cannot be installed.`,
    );
  }

  const current = await readVersion(db, pluginId, fromVersion);
  const diff = diffPluginVersionRecords(current, target);
  const acknowledged = new Set(input.acknowledgedPermissions ?? []);
  const unapproved = diff.addedPermissions.filter((permission) => !acknowledged.has(permission));
  if (unapproved.length > 0) {
    throw new PluginLifecycleError(
      `${pluginId} ${toVersion} asks for ${unapproved.join(', ')}, which you have not approved yet.`,
    );
  }

  const reEnabled = current?.status === 'suspended';
  await db.execute(
    `update public.plugin_installations
        set installed_version = $3,
            enabled = enabled or $4,
            updated_at = now()
      where user_id = $1 and plugin_id = $2`,
    [input.userId, pluginId, toVersion, reEnabled],
  );

  return { pluginId, fromVersion, toVersion, diff, reEnabled };
}

export interface PluginLifecycleEvent {
  pluginId: string;
  version: string;
  action: PluginLifecycleAction;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  actorUserId: string;
  createdAt: string;
}

export async function listPluginLifecycleEvents(
  db: DatabaseAdapter,
  pluginId: string,
  limit = 50,
): Promise<PluginLifecycleEvent[]> {
  const rows = await db.query<{
    plugin_id: string;
    version: string;
    action: string;
    from_status: string | null;
    to_status: string;
    reason: string | null;
    actor_user_id: string;
    created_at: string | Date;
  }>(
    `select plugin_id, version, action, from_status, to_status, reason, actor_user_id, created_at
       from public.plugin_registry_lifecycle_events
      where plugin_id = $1
      order by created_at desc
      limit $2`,
    [PluginIdSchema.parse(pluginId), z.number().int().positive().max(200).parse(limit)],
  );
  return rows.map((row) => ({
    pluginId: row.plugin_id,
    version: row.version,
    action: z.enum(PLUGIN_LIFECYCLE_ACTIONS).parse(row.action),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    actorUserId: row.actor_user_id,
    createdAt: z.string().datetime().parse(toIsoTimestamp(row.created_at)),
  }));
}
