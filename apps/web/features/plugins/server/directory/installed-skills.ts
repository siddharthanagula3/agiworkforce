import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { hashSkillContent, type Skill } from '@agiworkforce/skills';

import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import { shaFromInstalledVersion } from './entries';
import { findPluginDirectoryRecord } from './memory-cache';
import { DIRECTORY_MARKETPLACES, type DirectoryFetch } from './official-marketplace';
import { fetchPluginSkillFiles } from './skill-files';
import {
  installedSkillsCacheParams,
  readInstalledSkills,
  writeInstalledSkills,
} from './snapshot-cache';
import type { InstalledDirectorySkill } from './types';

const SKILL_SOURCE_EXTRA = 'extra';
const SKILL_FILE_PATH_PREFIX = 'plugins';
const FRONTMATTER_PLUGIN_KEY = 'plugin';

interface InstalledEntryRow {
  plugin_key: string;
  installed_version: string;
  enabled_skills: unknown;
  repository_url: string;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function toSkill(pluginKey: string, skill: InstalledDirectorySkill): Skill {
  return {
    name: skill.name,
    description: skill.description,
    body: skill.body,
    contentHash: hashSkillContent(Buffer.from(skill.body, 'utf8')),
    filePath: `${SKILL_FILE_PATH_PREFIX}/${pluginKey}/${skill.path}`,
    source: SKILL_SOURCE_EXTRA,
    metadata: {},
    frontmatter: { [FRONTMATTER_PLUGIN_KEY]: pluginKey },
  };
}

async function listInstalledEntries(
  db: DatabaseAdapter,
  userId: string,
): Promise<InstalledEntryRow[]> {
  try {
    return await db.query<InstalledEntryRow>(
      `select entries.plugin_key, installation.installed_version, installation.enabled_skills,
              sources.repository_url
         from public.plugin_marketplace_installations installation
         join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
         join public.plugin_marketplace_sources sources on sources.id = entries.source_id
        where installation.user_id = $1
          and installation.enabled = true
          and sources.repository_url = any($2::text[])
        order by installation.installed_at asc`,
      [userId, DIRECTORY_MARKETPLACES.map((marketplace) => marketplace.repositoryUrl)],
    );
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return [];
    throw error;
  }
}

async function refetchSkills(
  row: InstalledEntryRow,
  sha: string,
  fetchImpl: DirectoryFetch | undefined,
): Promise<readonly InstalledDirectorySkill[]> {
  const record = await findPluginDirectoryRecord(row.plugin_key);
  const location = record?.sourceLocation;
  if (!record || !location) return [];
  const skills = await fetchPluginSkillFiles(
    { ...location, sha },
    record.runtime.components.skillPaths,
    fetchImpl,
  );
  if (skills.length > 0) {
    await writeInstalledSkills(
      installedSkillsCacheParams(row.repository_url, row.plugin_key, sha),
      skills,
    );
  }
  return skills;
}

async function skillsForRow(
  row: InstalledEntryRow,
  fetchImpl: DirectoryFetch | undefined,
): Promise<Skill[]> {
  const sha = shaFromInstalledVersion(row.installed_version);
  if (!sha) return [];
  const params = installedSkillsCacheParams(row.repository_url, row.plugin_key, sha);
  const cached = (await readInstalledSkills(params)) ?? (await refetchSkills(row, sha, fetchImpl));
  const enabled = new Set(toStringArray(row.enabled_skills));
  return cached
    .filter((skill) => enabled.has(skill.name))
    .map((skill) => toSkill(row.plugin_key, skill));
}

export async function listInstalledDirectorySkills(
  db: DatabaseAdapter,
  userId: string,
  fetchImpl?: DirectoryFetch,
): Promise<Skill[]> {
  const rows = await listInstalledEntries(db, userId);
  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const row of rows) {
    for (const skill of await skillsForRow(row, fetchImpl)) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      skills.push(skill);
    }
  }
  return skills;
}

export async function findInstalledDirectorySkill(
  db: DatabaseAdapter,
  userId: string,
  name: string,
  fetchImpl?: DirectoryFetch,
): Promise<Skill | null> {
  const skills = await listInstalledDirectorySkills(db, userId, fetchImpl);
  return skills.find((skill) => skill.name === name) ?? null;
}
