import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { hashSkillContent, type Skill, type SkillWithFileAccess } from '@agiworkforce/skills';

import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import {
  isMissingOrganizationPluginSchema,
  listMemberOrganizationPlugins,
  listOrganizationPluginSkillFiles,
} from '@/lib/services/organization-plugin-service';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import {
  isMissingPluginSubmissionSchema,
  listCommunitySkillFiles,
  listInstalledCommunityPlugins,
} from '@/lib/services/plugin-submission-service';
import {
  listOwnedEntryFiles,
  type OwnedEntryFile,
} from '@/lib/services/plugin-owned-source-service';
import { shaFromInstalledVersion } from './entries';
import { findPluginDirectoryRecord } from './memory-cache';
import type { DirectoryFetch } from './official-marketplace';
import { fetchPluginSkillFiles, parseSkillFile, pluginContentPaths } from './skill-files';
import {
  communitySkillFileAccess,
  organizationSkillFileAccess,
  ownedSkillFileAccess,
  repositorySkillFileAccess,
} from './skill-companions';
import {
  installedSkillsCacheParams,
  readInstalledSkills,
  writeInstalledSkills,
} from './snapshot-cache';
import { CLAUDE_PLUGIN_SKILLS_DIRECTORY } from './constants';
import type { InstalledDirectorySkill, PluginSourceLocation } from './types';
import { workspacePluginFrontmatter } from './workspace-skill';

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

export function toSkill(
  pluginKey: string,
  skill: InstalledDirectorySkill,
  workspacePluginName?: string,
): Skill {
  return {
    name: skill.name,
    description: skill.description,
    body: skill.body,
    contentHash: hashSkillContent(Buffer.from(skill.body, 'utf8')),
    filePath: `${SKILL_FILE_PATH_PREFIX}/${pluginKey}/${skill.path}`,
    source: SKILL_SOURCE_EXTRA,
    metadata: {},
    frontmatter: {
      [FRONTMATTER_PLUGIN_KEY]: pluginKey,
      ...(workspacePluginName ? workspacePluginFrontmatter(workspacePluginName) : {}),
    },
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

interface OrganizationSkill {
  organizationId: string;
  pluginId: string;
  pluginKey: string;
  pluginName: string;
  skill: InstalledDirectorySkill;
}

async function listOrganizationSkills(
  db: DatabaseAdapter,
  userId: string,
): Promise<OrganizationSkill[]> {
  try {
    const organizationId = await resolveActiveOrganizationId(db, userId);
    if (!organizationId) return [];
    const plugins = (await listMemberOrganizationPlugins(db, userId, organizationId)).filter(
      (plugin) => plugin.enabled,
    );
    const files = await listOrganizationPluginSkillFiles(
      db,
      organizationId,
      plugins.map((plugin) => plugin.id),
    );
    return files.flatMap((file) => {
      const plugin = plugins.find((candidate) => candidate.id === file.pluginId);
      const skill = plugin ? parseSkillFile(file.path, file.content) : null;
      if (!plugin || !skill) return [];
      if (plugin.enabledSkills && !plugin.enabledSkills.includes(skill.name)) return [];
      return [
        {
          organizationId,
          pluginId: plugin.id,
          pluginKey: plugin.pluginKey,
          pluginName: plugin.name,
          skill,
        },
      ];
    });
  } catch (error) {
    if (isMissingOrganizationPluginSchema(error)) return [];
    throw error;
  }
}

interface CommunitySkill {
  submissionId: string;
  pluginKey: string;
  skill: InstalledDirectorySkill;
}

async function listCommunitySkills(db: DatabaseAdapter, userId: string): Promise<CommunitySkill[]> {
  try {
    const plugins = await listInstalledCommunityPlugins(db, userId);
    const files = await listCommunitySkillFiles(
      db,
      plugins.map((plugin) => plugin.id),
    );
    return files.flatMap((file) => {
      const plugin = plugins.find((candidate) => candidate.id === file.submissionId);
      const skill = plugin ? parseSkillFile(file.path, file.content) : null;
      if (!plugin || !skill) return [];
      if (plugin.enabledSkills && !plugin.enabledSkills.includes(skill.name)) return [];
      return [{ submissionId: plugin.id, pluginKey: plugin.pluginKey, skill }];
    });
  } catch (error) {
    if (isMissingPluginSubmissionSchema(error)) return [];
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
      skillPaths: pluginContentPaths(record.runtime.components),
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
    skillPaths: pluginContentPaths(record.runtime.components),
  };
}

interface SkillFetchPlan {
  revision: string;
  location: PluginSourceLocation;
  skillPaths: readonly string[];
}

interface PlannedSkills {
  plan: SkillFetchPlan;
  skills: readonly InstalledDirectorySkill[];
}

export interface InstalledSkillsReadOptions {
  cachedOnly?: boolean;
}

async function plannedSkillsForRow(
  row: InstalledEntryRow,
  repositoryUrl: string,
  fetchImpl: DirectoryFetch | undefined,
  options: InstalledSkillsReadOptions = {},
): Promise<PlannedSkills | null> {
  const sha = shaFromInstalledVersion(row.installed_version);
  const plan = sha ? await directorySourcePlan(row, sha) : await ownSourcePlan(row, repositoryUrl);
  if (!plan) return null;
  const params = installedSkillsCacheParams(
    repositoryUrl,
    row.plugin_key,
    plan.revision,
    plan.location.sha ?? plan.location.ref,
  );
  let cached = await readInstalledSkills(params);
  if (!cached && options.cachedOnly) return null;
  if (!cached) {
    const fetched = await fetchPluginSkillFiles(plan.location, plan.skillPaths, fetchImpl);
    if (fetched.length > 0) await writeInstalledSkills(params, fetched);
    cached = fetched;
  }
  const enabled = new Set(toStringArray(row.enabled_skills));
  return { plan, skills: cached.filter((skill) => enabled.has(skill.name)) };
}

async function skillsForRow(
  row: InstalledEntryRow,
  repositoryUrl: string,
  fetchImpl: DirectoryFetch | undefined,
  options: InstalledSkillsReadOptions,
): Promise<Skill[]> {
  const planned = await plannedSkillsForRow(row, repositoryUrl, fetchImpl, options);
  return planned ? planned.skills.map((skill) => toSkill(row.plugin_key, skill)) : [];
}

function storedDirectorySkills(
  row: InstalledEntryRow,
  files: readonly OwnedEntryFile[],
): InstalledDirectorySkill[] {
  const enabled = new Set(toStringArray(row.enabled_skills));
  const skills: InstalledDirectorySkill[] = [];
  for (const file of files) {
    const parsed = parseSkillFile(file.path, file.content);
    if (!parsed || !enabled.has(parsed.name)) continue;
    skills.push(parsed);
  }
  return skills;
}

function storedSkills(row: InstalledEntryRow, files: readonly OwnedEntryFile[]): Skill[] {
  return storedDirectorySkills(row, files).map((skill) => toSkill(row.plugin_key, skill));
}

export async function listInstalledDirectorySkills(
  db: DatabaseAdapter,
  userId: string,
  fetchImpl?: DirectoryFetch,
  options: InstalledSkillsReadOptions = {},
): Promise<Skill[]> {
  const [organizationSkills, communitySkills, rows] = await Promise.all([
    listOrganizationSkills(db, userId),
    listCommunitySkills(db, userId),
    listInstalledEntries(db, userId),
  ]);
  const stored = await listOwnedEntryFiles(
    db,
    userId,
    rows.filter((row) => row.repository_url === null).map((row) => row.entry_id),
  );
  const seen = new Set<string>();
  const skills: Skill[] = [];
  for (const { pluginKey, pluginName, skill } of organizationSkills) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    skills.push(toSkill(pluginKey, skill, pluginName));
  }
  for (const row of rows) {
    const repositoryUrl = row.repository_url;
    const rowSkills =
      repositoryUrl === null
        ? storedSkills(row, stored.get(row.entry_id) ?? [])
        : await skillsForRow(row, repositoryUrl, fetchImpl, options);
    for (const skill of rowSkills) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      skills.push(skill);
    }
  }
  for (const { pluginKey, skill } of communitySkills) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    skills.push(toSkill(pluginKey, skill));
  }
  return skills;
}

export async function findInstalledDirectorySkillWithFiles(
  db: DatabaseAdapter,
  userId: string,
  name: string,
  fetchImpl?: DirectoryFetch,
): Promise<SkillWithFileAccess | null> {
  const organizationSkill = (await listOrganizationSkills(db, userId)).find(
    (candidate) => candidate.skill.name === name,
  );
  if (organizationSkill) {
    return {
      skill: toSkill(
        organizationSkill.pluginKey,
        organizationSkill.skill,
        organizationSkill.pluginName,
      ),
      access: organizationSkillFileAccess(
        db,
        organizationSkill.organizationId,
        organizationSkill.pluginId,
        organizationSkill.skill.path,
      ),
    };
  }
  const rows = await listInstalledEntries(db, userId);
  const stored = await listOwnedEntryFiles(
    db,
    userId,
    rows.filter((row) => row.repository_url === null).map((row) => row.entry_id),
  );
  for (const row of rows) {
    const repositoryUrl = row.repository_url;
    if (repositoryUrl === null) {
      const found = storedDirectorySkills(row, stored.get(row.entry_id) ?? []).find(
        (skill) => skill.name === name,
      );
      if (found) {
        return {
          skill: toSkill(row.plugin_key, found),
          access: ownedSkillFileAccess(db, userId, row.entry_id, found.path),
        };
      }
      continue;
    }
    const planned = await plannedSkillsForRow(row, repositoryUrl, fetchImpl);
    const found = planned?.skills.find((skill) => skill.name === name);
    if (planned && found) {
      return {
        skill: toSkill(row.plugin_key, found),
        access: repositorySkillFileAccess(
          planned.plan.location,
          planned.plan.revision,
          found.path,
          fetchImpl,
        ),
      };
    }
  }
  const communitySkill = (await listCommunitySkills(db, userId)).find(
    (candidate) => candidate.skill.name === name,
  );
  if (communitySkill) {
    return {
      skill: toSkill(communitySkill.pluginKey, communitySkill.skill),
      access: communitySkillFileAccess(db, communitySkill.submissionId, communitySkill.skill.path),
    };
  }
  return null;
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

export type InstalledPluginMatch = { entryId: string } | { pluginKey: string };

function matchesInstalledPlugin(row: InstalledEntryRow, match: InstalledPluginMatch): boolean {
  return 'entryId' in match ? row.entry_id === match.entryId : row.plugin_key === match.pluginKey;
}

export async function listInstalledPluginSkillsWithFiles(
  db: DatabaseAdapter,
  userId: string,
  match: InstalledPluginMatch,
  fetchImpl?: DirectoryFetch,
): Promise<SkillWithFileAccess[]> {
  const row = (await listInstalledEntries(db, userId)).find((candidate) =>
    matchesInstalledPlugin(candidate, match),
  );
  if (!row) return [];
  const repositoryUrl = row.repository_url;
  if (repositoryUrl === null) {
    const stored = await listOwnedEntryFiles(db, userId, [row.entry_id]);
    return storedDirectorySkills(row, stored.get(row.entry_id) ?? []).map((skill) => ({
      skill: toSkill(row.plugin_key, skill),
      access: ownedSkillFileAccess(db, userId, row.entry_id, skill.path),
    }));
  }
  const planned = await plannedSkillsForRow(row, repositoryUrl, fetchImpl);
  if (!planned) return [];
  return planned.skills.map((skill) => ({
    skill: toSkill(row.plugin_key, skill),
    access: repositorySkillFileAccess(
      planned.plan.location,
      planned.plan.revision,
      skill.path,
      fetchImpl,
    ),
  }));
}
