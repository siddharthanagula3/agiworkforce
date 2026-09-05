import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isPluginEntryWebInstallable, type PluginInstallation } from '@agiworkforce/types';
import type {
  PluginConnectorRequirementState,
  PluginInstallationSettings,
} from '@agiworkforce/cloud-contracts';

import { getPluginRegistryEntry } from './plugin-registry-service';

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

export async function installWebPlugin(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
): Promise<PluginInstallation | null> {
  const found = await getPluginRegistryEntry(db, pluginId);
  if (!found || !isPluginEntryWebInstallable(found.entry) || !found.manifest) return null;

  const rows = await db.query<PluginInstallationRow>(
    `insert into public.plugin_installations
       (user_id, plugin_id, installed_version, enabled, enabled_skills, installed_at, updated_at)
     values ($1, $2, $3, true, $4::jsonb, now(), now())
     on conflict (user_id, plugin_id) do update
       set installed_version = excluded.installed_version,
           enabled = true,
           updated_at = now()
     returning plugin_id, installed_version, enabled, installed_at, updated_at`,
    [userId, pluginId, found.entry.version, JSON.stringify(found.entry.declaredSkills)],
  );
  return rows[0] ? mapInstallation(rows[0]) : null;
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
  const rows = await db.query<{ plugin_id: string }>(
    `select installation.plugin_id
       from public.plugin_installations installation
       join public.plugin_registry_entries registry on registry.id = installation.plugin_id
      where installation.user_id = $1
        and installation.enabled = true
        and registry.status = 'published'
        and registry.web_installable = true`,
    [userId],
  );
  return new Set(rows.map((row) => row.plugin_id));
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
