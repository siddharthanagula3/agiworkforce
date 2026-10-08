import 'server-only';

import type { ManagedSkillOrigin } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { Skill } from '@agiworkforce/skills';

import {
  isShadowSourceName,
  SHADOW_SOURCE_NAME_PREFIX,
} from '@/features/plugins/server/directory/constants';
import { workspacePluginNameOf } from '@/features/plugins/server/directory/workspace-skill';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';

const PLUGIN_SKILL_SOURCE = 'extra';
const OWNED_SOURCE_KINDS = new Set(['upload', 'authored']);

interface CatalogOriginRow {
  id: string;
  name: string;
  installed_at: string | Date | null;
}

interface MarketplaceOriginRow {
  plugin_key: string;
  name: string;
  source_name: string;
  kind: string | null;
  installed_at: string | Date | null;
}

export type SkillOriginLookup = (skill: Skill) => ManagedSkillOrigin | undefined;

function skillPluginId(skill: Skill): string | null {
  const owner = skill.frontmatter['plugin'];
  return typeof owner === 'string' && owner.trim().length > 0 ? owner.trim() : null;
}

export function isoTimestamp(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function marketplaceLabel(name: string): string {
  return isShadowSourceName(name) ? name.slice(SHADOW_SOURCE_NAME_PREFIX.length) : name;
}

async function catalogOrigins(
  db: DatabaseAdapter,
  userId: string,
  pluginIds: readonly string[],
): Promise<Map<string, ManagedSkillOrigin>> {
  if (pluginIds.length === 0) return new Map();
  const rows = await db.query<CatalogOriginRow>(
    `select entry.id, entry.name, installation.installed_at
       from public.plugin_registry_entries entry
       left join public.plugin_installations installation
         on installation.plugin_id = entry.id and installation.user_id = $1
      where entry.id = any($2::text[])`,
    [userId, pluginIds],
  );
  const origins = new Map<string, ManagedSkillOrigin>();
  for (const row of rows) {
    const addedAt = isoTimestamp(row.installed_at);
    origins.set(row.id, {
      kind: 'catalog',
      pluginId: row.id,
      pluginName: row.name,
      ...(addedAt ? { addedAt } : {}),
    });
  }
  return origins;
}

async function marketplaceOrigins(
  db: DatabaseAdapter,
  userId: string,
  pluginKeys: readonly string[],
): Promise<Map<string, ManagedSkillOrigin>> {
  if (pluginKeys.length === 0) return new Map();
  let rows: MarketplaceOriginRow[];
  try {
    rows = await db.query<MarketplaceOriginRow>(
      `select entries.plugin_key, entries.name, sources.name as source_name, sources.kind,
              installation.installed_at
         from public.plugin_marketplace_installations installation
         join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
         join public.plugin_marketplace_sources sources on sources.id = entries.source_id
        where installation.user_id = $1
          and installation.enabled = true
          and sources.user_id = $1
          and entries.plugin_key = any($2::text[])
        order by installation.installed_at asc`,
      [userId, pluginKeys],
    );
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return new Map();
    throw error;
  }
  const origins = new Map<string, ManagedSkillOrigin>();
  for (const row of rows) {
    if (origins.has(row.plugin_key)) continue;
    const addedAt = isoTimestamp(row.installed_at);
    const owned = row.kind !== null && OWNED_SOURCE_KINDS.has(row.kind);
    origins.set(row.plugin_key, {
      kind: owned ? (row.kind as 'upload' | 'authored') : 'repository',
      pluginId: row.plugin_key,
      pluginName: row.name,
      ...(owned ? {} : { marketplace: marketplaceLabel(row.source_name) }),
      ...(addedAt ? { addedAt } : {}),
    });
  }
  return origins;
}

export async function loadSkillOrigins(
  db: DatabaseAdapter,
  userId: string,
  skills: readonly Skill[],
): Promise<SkillOriginLookup> {
  const catalogIds = new Set<string>();
  const marketplaceKeys = new Set<string>();
  for (const skill of skills) {
    const pluginId = skillPluginId(skill);
    if (!pluginId || workspacePluginNameOf(skill)) continue;
    if (skill.source === PLUGIN_SKILL_SOURCE) marketplaceKeys.add(pluginId);
    else catalogIds.add(pluginId);
  }
  const [catalog, marketplace] = await Promise.all([
    catalogOrigins(db, userId, [...catalogIds]),
    marketplaceOrigins(db, userId, [...marketplaceKeys]),
  ]);
  return (skill) => {
    const pluginId = skillPluginId(skill);
    if (!pluginId) return undefined;
    const workspacePlugin = workspacePluginNameOf(skill);
    if (workspacePlugin) return { kind: 'workspace', pluginId, pluginName: workspacePlugin };
    return skill.source === PLUGIN_SKILL_SOURCE ? marketplace.get(pluginId) : catalog.get(pluginId);
  };
}
