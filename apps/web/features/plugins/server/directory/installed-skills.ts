import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { hashSkillContent, type Skill } from '@agiworkforce/skills';

import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import {
  listOwnedEntryFiles,
  type OwnedEntryFile,
} from '@/lib/services/plugin-owned-source-service';
import { shaFromInstalledVersion } from './entries';
import { findPluginDirectoryRecord } from './memory-cache';
import type { DirectoryFetch } from './official-marketplace';
import { fetchPluginSkillFiles, parseSkillFile } from './skill-files';
import {
  installedSkillsCacheParams,
  readInstalledSkills,
  writeInstalledSkills,
} from './snapshot-cache';
import { CLAUDE_PLUGIN_SKILLS_DIRECTORY } from './constants';
import type { InstalledDirectorySkill, PluginSourceLocation } from './types';

const SKILL_SOURCE_EXTRA = 'extra';
const SKILL_FILE_PATH_PREFIX = 'plugins';
const FRONTMATTER_PLUGIN_KEY = 'plugin';

interface InstalledEntryRow {
  entry_id: string;
  plugin_key: string;
  installed_version: string;
  enabled_skills: unknown;
  declared_skills: unknown;
  repository_url: string | null;
  ref: string | null;
  content_hash: string | null;
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
      `select entries.id as entry_id, entries.plugin_key, installation.installed_version,
              installation.enabled_skills, entries.declared_skills, entries.content_hash,
              sources.repository_url, sources.ref
         from public.plugin_marketplace_installations installation
         join public.plugin_marketplace_entries entries on entries.id = installation.entry_id
         join public.plugin_marketplace_sources sources on sources.id = entries.source_id
        where installation.user_id = $1
          and installation.enabled = true
          and sources.user_id = $1
        order by installation.installed_at asc`,
      [userId],
    );
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return [];
    throw error;
  }
}

function sameRepository(left: string | null | undefined, right: string): boolean {
  return typeof left === 'string' && left.toLowerCase() === right.toLowerCase();
}

async function ownSourcePlan(
  row: InstalledEntryRow,
  repositoryUrl: string,
): Promise<SkillFetchPlan | null> {
  const revision = row.content_hash;
  if (!revision) return null;

  const record = await findPluginDirectoryRecord(row.plugin_key);
  if (record?.sourceLocation && sameRepository(record.marketplace?.repositoryUrl, repositoryUrl)) {
    return {
      revision,
      location: record.sourceLocation,
      skillPaths: record.runtime.components.skillPaths,
    };
  }

  const declared = toStringArray(row.declared_skills);
  if (declared.length === 0) return null;
  return {
    revision,
    location: { repositoryUrl, ref: row.ref, sha: null, path: null },
    skillPaths: declared.map((name) => `${CLAUDE_PLUGIN_SKILLS_DIRECTORY}/${name}/SKILL.md`),
  };
}

async function directorySourcePlan(
  row: InstalledEntryRow,
  sha: string,
): Promise<SkillFetchPlan | null> {
  const record = await findPluginDirectoryRecord(row.plugin_key);
  const location = record?.sourceLocation;
  if (!record || !location) return null;
  return {
    revision: sha,
    location: { ...location, sha },
    skillPaths: record.runtime.components.skillPaths,
  };
}

interface SkillFetchPlan {
  revision: string;
  location: PluginSourceLocation;
  skillPaths: readonly string[];
}

async function skillsForRow(
  row: InstalledEntryRow,
  repositoryUrl: string,
  fetchImpl: DirectoryFetch | undefined,
): Promise<Skill[]> {
  const sha = shaFromInstalledVersion(row.installed_version);
  const plan = sha ? await directorySourcePlan(row, sha) : await ownSourcePlan(row, repositoryUrl);
  if (!plan) return [];
  const params = installedSkillsCacheParams(
    repositoryUrl,
    row.plugin_key,
    plan.revision,
    plan.location.sha ?? plan.location.ref,
  );
  let cached = await readInstalledSkills(params);
  if (!cached) {
    const fetched = await fetchPluginSkillFiles(plan.location, plan.skillPaths, fetchImpl);
    if (fetched.length > 0) await writeInstalledSkills(params, fetched);
    cached = fetched;
  }
  const enabled = new Set(toStringArray(row.enabled_skills));
  return cached
    .filter((skill) => enabled.has(skill.name))
    .map((skill) => toSkill(row.plugin_key, skill));
}

function storedSkills(row: InstalledEntryRow, files: readonly OwnedEntryFile[]): Skill[] {
  const enabled = new Set(toStringArray(row.enabled_skills));
  const skills: Skill[] = [];
  for (const file of files) {
    const parsed = parseSkillFile(file.path, file.content);
    if (!parsed || !enabled.has(parsed.name)) continue;
    skills.push(toSkill(row.plugin_key, parsed));
  }
  return skills;
}

export async function listInstalledDirectorySkills(
  db: DatabaseAdapter,
  userId: string,
  fetchImpl?: DirectoryFetch,
): Promise<Skill[]> {
  const rows = await listInstalledEntries(db, userId);
  const stored = await listOwnedEntryFiles(
    db,
    userId,
    rows.filter((row) => row.repository_url === null).map((row) => row.entry_id),
  );
  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const row of rows) {
    const repositoryUrl = row.repository_url;
    const rowSkills =
      repositoryUrl === null
        ? storedSkills(row, stored.get(row.entry_id) ?? [])
        : await skillsForRow(row, repositoryUrl, fetchImpl);
    for (const skill of rowSkills) {
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
