import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ORGANIZATION_PLUGIN_INSTALL_PREFERENCES,
  type MemberOrganizationPlugin,
  type MemberOrganizationPluginPatch,
  type MemberOrganizationPluginPreference,
  type OrganizationPluginGroup,
  type OrganizationPluginGroupSetting,
  type OrganizationPluginInstallPreference,
  type OrganizationPluginPatch,
  type OrganizationPluginSummary,
  type PluginScanFindingSummary,
} from '@agiworkforce/cloud-contracts';

import { createError } from '@/lib/errors';
import {
  assertOwnedPluginsScanned,
  entryFilesOf,
  ownedPluginContentHash,
  type OwnedCompanionFile,
  type OwnedEntryFile,
  type OwnedPluginInput,
} from '@/lib/services/plugin-owned-source-service';

const HASH_ALGORITHM = 'sha256';
const SKILL_FILE_NAME = 'SKILL.md';
const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_FUNCTION = '42883';
const STATUS_PUBLISHED = 'published';
const STATUS_RETIRED = 'retired';
const PREFERENCE_REQUIRED = 'required';
const PREFERENCE_BY_DEFAULT = 'installed_by_default';
const PREFERENCE_AVAILABLE = 'available';
const PREFERENCE_HIDDEN = 'not_available';

const PLUGIN_COLUMNS = `id, plugin_key, name, description, version, skills, scan_verdict,
  scan_findings, status, install_preference, published_at, updated_at`;

interface OrganizationPluginRow {
  id: string;
  plugin_key: string;
  name: string;
  description: string;
  version: string;
  skills: unknown;
  scan_verdict: string;
  scan_findings: unknown;
  status: string;
  install_preference: string;
  published_at: string | Date;
  updated_at: string | Date;
}

interface GroupSettingRow {
  plugin_id: string;
  group_id: string;
  install_preference: string;
}

interface MemberPluginRow {
  id: string;
  plugin_key: string;
  name: string;
  description: string;
  version: string;
  skills: unknown;
  updated_at: string | Date;
  preference: string;
  installed: boolean | null;
  enabled: boolean | null;
  enabled_skills: unknown;
}

export function isMissingOrganizationPluginSchema(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_FUNCTION;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function installPreference(value: string): OrganizationPluginInstallPreference {
  return (ORGANIZATION_PLUGIN_INSTALL_PREFERENCES as readonly string[]).includes(value)
    ? (value as OrganizationPluginInstallPreference)
    : PREFERENCE_AVAILABLE;
}

function scanFindings(value: unknown): PluginScanFindingSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const severity = record['severity'];
    if (severity !== 'block' && severity !== 'review') return [];
    return [
      {
        path: typeof record['path'] === 'string' ? record['path'] : '',
        line: typeof record['line'] === 'number' ? record['line'] : 0,
        message: typeof record['message'] === 'string' ? record['message'] : '',
        severity,
      },
    ];
  });
}

function toSummary(
  row: OrganizationPluginRow,
  settings: readonly GroupSettingRow[],
): OrganizationPluginSummary {
  return {
    id: row.id,
    pluginKey: row.plugin_key,
    name: row.name,
    description: row.description,
    version: row.version,
    skills: stringList(row.skills),
    scanVerdict: row.scan_verdict === 'review' ? 'review' : 'pass',
    scanFindings: scanFindings(row.scan_findings),
    status: row.status === STATUS_RETIRED ? STATUS_RETIRED : STATUS_PUBLISHED,
    installPreference: installPreference(row.install_preference),
    groupSettings: settings
      .filter((setting) => setting.plugin_id === row.id)
      .map((setting) => ({
        groupId: setting.group_id,
        installPreference: installPreference(setting.install_preference),
      })),
    publishedAt: iso(row.published_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function listOrganizationPlugins(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationPluginSummary[]> {
  const [rows, settings] = await Promise.all([
    db.query<OrganizationPluginRow>(
      `select ${PLUGIN_COLUMNS}
         from public.organization_plugins
        where organization_id = $1
        order by (status = '${STATUS_RETIRED}') asc, lower(name) asc`,
      [organizationId],
    ),
    db.query<GroupSettingRow>(
      `select plugin_id, group_id, install_preference
         from public.organization_plugin_group_settings
        where organization_id = $1`,
      [organizationId],
    ),
  ]);
  return rows.map((row) => toSummary(row, settings));
}

export async function listOrganizationPluginGroups(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<OrganizationPluginGroup[]> {
  const rows = await db.query<{ id: string; display_name: string }>(
    `select id, display_name
       from public.scim_groups
      where organization_id = $1
      order by lower(display_name) asc`,
    [organizationId],
  );
  return rows.map((row) => ({ id: row.id, name: row.display_name }));
}

async function replacePluginFiles(
  tx: DatabaseAdapter,
  organizationId: string,
  pluginId: string,
  files: readonly OwnedEntryFile[],
  actorUserId: string,
): Promise<void> {
  for (const file of files) {
    await tx.execute(
      `insert into public.organization_plugin_files
         (plugin_id, organization_id, path, content, content_hash, byte_size, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (plugin_id, path) do update
         set content = excluded.content,
             content_hash = excluded.content_hash,
             byte_size = excluded.byte_size`,
      [
        pluginId,
        organizationId,
        file.path,
        file.content,
        createHash(HASH_ALGORITHM).update(file.content, 'utf8').digest('hex'),
        Buffer.byteLength(file.content, 'utf8'),
        actorUserId,
      ],
    );
  }
  await tx.execute(
    `delete from public.organization_plugin_files
      where plugin_id = $1 and organization_id = $2 and path <> all($3::text[])`,
    [pluginId, organizationId, files.map((file) => file.path)],
  );
}

export interface PublishOrganizationPluginsInput {
  organizationId: string;
  actorUserId: string;
  plugins: readonly OwnedPluginInput[];
  acknowledgedScans: readonly string[];
  initialPreference: OrganizationPluginInstallPreference;
}

export async function publishOrganizationPlugins(
  db: DatabaseAdapter,
  input: PublishOrganizationPluginsInput,
): Promise<OrganizationPluginSummary[]> {
  const hashes = input.plugins.map(ownedPluginContentHash);
  const scans = await assertOwnedPluginsScanned(
    db,
    input.plugins,
    hashes,
    new Set(input.acknowledgedScans),
  );
  const published = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const [index, plugin] of input.plugins.entries()) {
      const scan = scans[index];
      const rows = await tx.query<{ id: string }>(
        `insert into public.organization_plugins
           (organization_id, plugin_key, name, description, version, skills, content_hash,
            scan_verdict, scan_findings, status, install_preference, published_by,
            published_at, retired_at, created_by)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $12, $11, now(), null, $11)
         on conflict (organization_id, plugin_key) do update
           set name = excluded.name,
               description = excluded.description,
               version = excluded.version,
               skills = excluded.skills,
               content_hash = excluded.content_hash,
               scan_verdict = excluded.scan_verdict,
               scan_findings = excluded.scan_findings,
               status = excluded.status,
               published_by = excluded.published_by,
               published_at = now(),
               retired_at = null
         returning id`,
        [
          input.organizationId,
          plugin.key,
          plugin.name,
          plugin.description,
          plugin.version,
          JSON.stringify(plugin.skills.map((skill) => skill.name)),
          hashes[index],
          scan?.verdict === 'review' ? 'review' : 'pass',
          JSON.stringify(
            (scan?.findings ?? []).map(({ path, line, message, severity }) => ({
              path,
              line,
              message,
              severity,
            })),
          ),
          STATUS_PUBLISHED,
          input.actorUserId,
          input.initialPreference,
        ],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('Could not publish the workspace plugin.');
      await replacePluginFiles(
        tx,
        input.organizationId,
        id,
        entryFilesOf(plugin.skills),
        input.actorUserId,
      );
      ids.push(id);
    }
    return ids;
  });
  const plugins = await listOrganizationPlugins(db, input.organizationId);
  return plugins.filter((plugin) => published.includes(plugin.id));
}

async function assertGroupsInOrganization(
  db: DatabaseAdapter,
  organizationId: string,
  settings: readonly OrganizationPluginGroupSetting[],
): Promise<void> {
  const groupIds = [...new Set(settings.map((setting) => setting.groupId))];
  if (groupIds.length !== settings.length) {
    throw createError.validation('Set each group once.').asUserSafe();
  }
  if (groupIds.length === 0) return;
  const rows = await db.query<{ id: string }>(
    `select id from public.scim_groups where organization_id = $1 and id = any($2::uuid[])`,
    [organizationId, groupIds],
  );
  if (rows.length !== groupIds.length) {
    throw createError.validation('One of those groups is not in this workspace.').asUserSafe();
  }
}

export async function updateOrganizationPlugin(
  db: DatabaseAdapter,
  organizationId: string,
  patch: OrganizationPluginPatch,
  actorUserId: string,
): Promise<OrganizationPluginSummary | null> {
  if (patch.groupSettings) {
    await assertGroupsInOrganization(db, organizationId, patch.groupSettings);
  }
  const found = await db.transaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `update public.organization_plugins
          set status = coalesce($3, status),
              retired_at = case
                when $3 = '${STATUS_RETIRED}' then coalesce(retired_at, now())
                when $3 = '${STATUS_PUBLISHED}' then null
                else retired_at
              end,
              install_preference = coalesce($4, install_preference)
        where id = $1 and organization_id = $2
        returning id`,
      [patch.pluginId, organizationId, patch.status ?? null, patch.installPreference ?? null],
    );
    if (!rows[0]) return false;
    if (patch.groupSettings) {
      await tx.execute(
        `delete from public.organization_plugin_group_settings
          where plugin_id = $1 and organization_id = $2`,
        [patch.pluginId, organizationId],
      );
      for (const setting of patch.groupSettings) {
        await tx.execute(
          `insert into public.organization_plugin_group_settings
             (plugin_id, organization_id, group_id, install_preference, created_by)
           values ($1, $2, $3, $4, $5)`,
          [patch.pluginId, organizationId, setting.groupId, setting.installPreference, actorUserId],
        );
      }
    }
    return true;
  });
  if (!found) return null;
  const plugins = await listOrganizationPlugins(db, organizationId);
  return plugins.find((plugin) => plugin.id === patch.pluginId) ?? null;
}

function memberPreference(value: string): MemberOrganizationPluginPreference | null {
  if (value === PREFERENCE_REQUIRED || value === PREFERENCE_BY_DEFAULT) return value;
  return value === PREFERENCE_AVAILABLE ? PREFERENCE_AVAILABLE : null;
}

function toMemberPlugin(row: MemberPluginRow): MemberOrganizationPlugin | null {
  const preference = memberPreference(row.preference);
  if (!preference) return null;
  const skills = stringList(row.skills);
  const chosenSkills = Array.isArray(row.enabled_skills) ? stringList(row.enabled_skills) : null;
  const base = {
    id: row.id,
    pluginKey: row.plugin_key,
    name: row.name,
    description: row.description,
    version: row.version,
    skills,
    updatedAt: iso(row.updated_at),
    installPreference: preference,
  };
  if (preference === PREFERENCE_REQUIRED) {
    return { ...base, installed: true, enabled: true, enabledSkills: null };
  }
  const installed = preference === PREFERENCE_BY_DEFAULT || row.installed === true;
  return {
    ...base,
    installed,
    enabled: installed && row.enabled !== false,
    enabledSkills: chosenSkills,
  };
}

export async function listMemberOrganizationPlugins(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
): Promise<MemberOrganizationPlugin[]> {
  const rows = await db.query<MemberPluginRow>(
    `select p.id, p.plugin_key, p.name, p.description, p.version, p.skills, p.updated_at,
            prefs.install_preference as preference,
            state.installed, state.enabled, state.enabled_skills
       from public.organization_plugin_member_preferences($1, $2) prefs
       join public.organization_plugins p
         on p.id = prefs.plugin_id and p.organization_id = $1
       left join public.organization_plugin_members state
         on state.plugin_id = p.id and state.organization_id = $1 and state.user_id = $2
      where prefs.install_preference <> '${PREFERENCE_HIDDEN}'
      order by lower(p.name) asc`,
    [organizationId, userId],
  );
  return rows.flatMap((row) => {
    const plugin = toMemberPlugin(row);
    return plugin ? [plugin] : [];
  });
}

export async function updateMemberOrganizationPlugin(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
  pluginId: string,
  patch: MemberOrganizationPluginPatch,
): Promise<MemberOrganizationPlugin | null> {
  const plugins = await listMemberOrganizationPlugins(db, userId, organizationId);
  const current = plugins.find((plugin) => plugin.id === pluginId);
  if (!current) return null;
  if (current.installPreference === PREFERENCE_REQUIRED) {
    throw createError
      .forbidden('Your workspace requires this plugin, so it stays on with all its skills.')
      .asUserSafe();
  }
  if (patch.installed !== undefined && current.installPreference !== PREFERENCE_AVAILABLE) {
    throw createError
      .validation('Your workspace installs this plugin for everyone. Turn it off instead.')
      .asUserSafe();
  }
  const unknownSkill = patch.enabledSkills?.find((skill) => !current.skills.includes(skill));
  if (unknownSkill) {
    throw createError.validation(`"${unknownSkill}" is not a skill of this plugin.`).asUserSafe();
  }
  if (patch.installed === false) {
    await db.execute(
      `delete from public.organization_plugin_members
        where plugin_id = $1 and organization_id = $2 and user_id = $3`,
      [pluginId, organizationId, userId],
    );
  } else {
    await db.execute(
      `insert into public.organization_plugin_members
         (plugin_id, organization_id, user_id, installed, enabled, enabled_skills, created_by)
       values ($1, $2, $3, coalesce($4, false), coalesce($5, true), $6::jsonb, $3)
       on conflict (plugin_id, user_id) do update
         set installed = coalesce($4, organization_plugin_members.installed),
             enabled = coalesce($5, organization_plugin_members.enabled),
             enabled_skills = case
               when $7 then $6::jsonb
               else organization_plugin_members.enabled_skills
             end`,
      [
        pluginId,
        organizationId,
        userId,
        patch.installed ?? null,
        patch.enabled ?? null,
        patch.enabledSkills === undefined || patch.enabledSkills === null
          ? null
          : JSON.stringify(patch.enabledSkills),
        patch.enabledSkills !== undefined,
      ],
    );
  }
  const updated = await listMemberOrganizationPlugins(db, userId, organizationId);
  return updated.find((plugin) => plugin.id === pluginId) ?? null;
}

export interface OrganizationPluginSkillFile extends OwnedEntryFile {
  pluginId: string;
}

export async function listOrganizationPluginSkillFiles(
  db: DatabaseAdapter,
  organizationId: string,
  pluginIds: readonly string[],
): Promise<OrganizationPluginSkillFile[]> {
  if (pluginIds.length === 0) return [];
  const rows = await db.query<{ plugin_id: string; path: string; content: string }>(
    `select files.plugin_id, files.path, files.content
       from public.organization_plugin_files files
       join public.organization_plugins plugins on plugins.id = files.plugin_id
      where files.organization_id = $1
        and plugins.organization_id = $1
        and plugins.status = '${STATUS_PUBLISHED}'
        and files.plugin_id = any($2::uuid[])
        and (files.path = $3 or files.path like $4)
      order by files.path asc`,
    [organizationId, pluginIds, SKILL_FILE_NAME, `%/${SKILL_FILE_NAME}`],
  );
  return rows.map((row) => ({ pluginId: row.plugin_id, path: row.path, content: row.content }));
}

export async function listOrganizationSkillCompanions(
  db: DatabaseAdapter,
  organizationId: string,
  pluginId: string,
  skillDirectory: string,
  limit: number,
): Promise<OwnedCompanionFile[]> {
  const prefix = `${skillDirectory}/`;
  const rows = await db.query<{ path: string; byte_size: number | string }>(
    `select path, byte_size
       from public.organization_plugin_files
      where organization_id = $1 and plugin_id = $2
        and starts_with(path, $3) and path <> $4
      order by path asc
      limit $5`,
    [organizationId, pluginId, prefix, `${prefix}${SKILL_FILE_NAME}`, limit],
  );
  return rows.map((row) => ({ path: row.path.slice(prefix.length), size: Number(row.byte_size) }));
}

export async function readOrganizationPluginFile(
  db: DatabaseAdapter,
  organizationId: string,
  pluginId: string,
  path: string,
): Promise<string | null> {
  const rows = await db.query<{ content: string }>(
    `select content
       from public.organization_plugin_files
      where organization_id = $1 and plugin_id = $2 and path = $3`,
    [organizationId, pluginId, path],
  );
  return rows[0]?.content ?? null;
}
