import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type {
  PluginConnectorRequirementState,
  PluginInstallationSettings,
  PluginMarketplaceInstallation,
} from '@agiworkforce/cloud-contracts';

import { getMarketplaceEntryForUser } from '@/lib/services/plugin-marketplace-service';

interface PluginMarketplaceInstallationRow {
  id: string;
  entry_id: string;
  source_id: string;
  plugin_key: string;
  installed_version: string;
  enabled: boolean;
  enabled_skills: unknown;
  custom_example_prompts: unknown;
  installed_at: string | Date;
  updated_at: string | Date;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function mapInstallation(row: PluginMarketplaceInstallationRow): PluginMarketplaceInstallation {
  return {
    id: row.id,
    entryId: row.entry_id,
    sourceId: row.source_id,
    pluginKey: row.plugin_key,
    installedVersion: row.installed_version,
    enabled: row.enabled,
    enabledSkills: toStringArray(row.enabled_skills),
    customExamplePrompts:
      row.custom_example_prompts === null ? null : toStringArray(row.custom_example_prompts),
    installedAt: toIso(row.installed_at),
    updatedAt: toIso(row.updated_at),
  };
}

const INSTALLATION_SELECT = `
  select installation.id, installation.entry_id, entries.source_id, entries.plugin_key,
         installation.installed_version, installation.enabled, installation.enabled_skills,
         installation.custom_example_prompts, installation.installed_at, installation.updated_at
    from public.plugin_marketplace_installations installation
    join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
`;

export async function listMarketplaceInstallations(
  db: DatabaseAdapter,
  userId: string,
): Promise<PluginMarketplaceInstallation[]> {
  const rows = await db.query<PluginMarketplaceInstallationRow>(
    `${INSTALLATION_SELECT}
      where installation.user_id = $1
      order by installation.installed_at asc`,
    [userId],
  );
  return rows.map(mapInstallation);
}

export async function getMarketplaceInstallation(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<PluginMarketplaceInstallation | null> {
  const rows = await db.query<PluginMarketplaceInstallationRow>(
    `${INSTALLATION_SELECT} where installation.id = $1 and installation.user_id = $2`,
    [installationId, userId],
  );
  return rows[0] ? mapInstallation(rows[0]) : null;
}

export async function installMarketplaceEntry(
  db: DatabaseAdapter,
  userId: string,
  entryId: string,
): Promise<PluginMarketplaceInstallation | null> {
  const entry = await getMarketplaceEntryForUser(db, userId, entryId);
  if (!entry) return null;

  const rows = await db.query<{ id: string }>(
    `insert into public.plugin_marketplace_installations
       (user_id, entry_id, installed_version, enabled, enabled_skills, installed_at, updated_at)
     values ($1, $2, $3, true, $4::jsonb, now(), now())
     on conflict (user_id, entry_id) do update
       set installed_version = excluded.installed_version,
           enabled = true,
           updated_at = now()
     returning id`,
    [userId, entryId, entry.version, JSON.stringify(entry.declaredSkills)],
  );
  const inserted = rows[0];
  if (!inserted) return null;

  const installed = await db.query<PluginMarketplaceInstallationRow>(
    `${INSTALLATION_SELECT} where installation.id = $1`,
    [inserted.id],
  );
  return installed[0] ? mapInstallation(installed[0]) : null;
}

export async function setMarketplaceInstallationEnabled(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
  enabled: boolean,
): Promise<PluginMarketplaceInstallation | null> {
  await db.execute(
    `update public.plugin_marketplace_installations
        set enabled = $3, updated_at = now()
      where id = $1 and user_id = $2`,
    [installationId, userId, enabled],
  );
  const rows = await db.query<PluginMarketplaceInstallationRow>(
    `${INSTALLATION_SELECT} where installation.id = $1 and installation.user_id = $2`,
    [installationId, userId],
  );
  return rows[0] ? mapInstallation(rows[0]) : null;
}

export async function uninstallMarketplaceEntry(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.plugin_marketplace_installations
      where id = $1 and user_id = $2
      returning id`,
    [installationId, userId],
  );
  return rows.length > 0;
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

interface PluginMarketplaceInstallationSettingsRow {
  plugin_key: string;
  enabled_skills: unknown;
  custom_example_prompts: unknown;
  declared_skills: unknown;
  required_connectors: unknown;
  agents: unknown;
  example_prompts: unknown;
}

export async function getMarketplaceInstallationSettings(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<PluginInstallationSettings | null> {
  const rows = await db.query<PluginMarketplaceInstallationSettingsRow>(
    `select entries.plugin_key, installation.enabled_skills, installation.custom_example_prompts,
            entries.declared_skills, entries.required_connectors, entries.agents, entries.example_prompts
       from public.plugin_marketplace_installations installation
       join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
      where installation.id = $1 and installation.user_id = $2
      limit 1`,
    [installationId, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const requiredConnectors = toStringArray(row.required_connectors);
  const customExamplePrompts = toStringArray(row.custom_example_prompts);
  return {
    pluginId: row.plugin_key,
    enabledSkills: toStringArray(row.enabled_skills),
    examplePrompts:
      customExamplePrompts.length > 0 ? customExamplePrompts : toStringArray(row.example_prompts),
    connectors: await connectorRequirementStates(db, userId, requiredConnectors),
    agents: toStringArray(row.agents),
  };
}

export interface PluginMarketplaceInstallationSettingsUpdate {
  enabledSkills?: string[];
  customExamplePrompts?: string[] | null;
}

export async function updateMarketplaceInstallationSettings(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
  update: PluginMarketplaceInstallationSettingsUpdate,
): Promise<PluginInstallationSettings | null> {
  const rows = await db.query<{ declared_skills: unknown }>(
    `select entries.declared_skills
       from public.plugin_marketplace_installations installation
       join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
      where installation.id = $1 and installation.user_id = $2
      limit 1`,
    [installationId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const declaredSkills = new Set(toStringArray(row.declared_skills));

  if (update.enabledSkills !== undefined) {
    const nextEnabledSkills = update.enabledSkills.filter((skill) => declaredSkills.has(skill));
    await db.execute(
      `update public.plugin_marketplace_installations
          set enabled_skills = $3::jsonb, updated_at = now()
        where id = $1 and user_id = $2`,
      [installationId, userId, JSON.stringify(nextEnabledSkills)],
    );
  }

  if (update.customExamplePrompts !== undefined) {
    await db.execute(
      `update public.plugin_marketplace_installations
          set custom_example_prompts = $3::jsonb, updated_at = now()
        where id = $1 and user_id = $2`,
      [
        installationId,
        userId,
        update.customExamplePrompts === null ? null : JSON.stringify(update.customExamplePrompts),
      ],
    );
  }

  return getMarketplaceInstallationSettings(db, userId, installationId);
}
