import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { PluginMarketplaceInstallation } from '@agiworkforce/cloud-contracts';

import { getMarketplaceInstallation } from '@/lib/services/plugin-marketplace-installation-service';
import {
  INSTALL_BUILTIN_MESSAGE,
  INSTALL_SKILLS_UNAVAILABLE_MESSAGE,
  INSTALL_UNKNOWN_MESSAGE,
  RUNTIME_NOTE_NOT_INSPECTED,
  RUNTIME_NOTE_SOURCE_UNKNOWN,
  SOURCE_FACET_BUILTIN,
} from './constants';
import { installedVersion } from './entries';
import { findPluginDirectoryRecord } from './memory-cache';
import { isDirectoryMarketplaceRepository, type DirectoryFetch } from './official-marketplace';
import { fetchPluginSkillFiles } from './skill-files';
import { installedSkillsCacheParams, writeInstalledSkills } from './snapshot-cache';
import type { InstalledDirectorySkill, PluginDirectoryEntry } from './types';

const SOURCE_STATUS_ACTIVE = 'active';
const HASH_ALGORITHM = 'sha256';

export type DirectoryInstallResult =
  | { status: 'installed'; installation: PluginMarketplaceInstallation; skills: string[] }
  | { status: 'missing'; message: string }
  | { status: 'builtin'; message: string }
  | { status: 'blocked'; message: string; installCommand: string | null }
  | { status: 'skills-unavailable'; message: string };

export interface DirectoryInstallDependencies {
  fetchImpl?: DirectoryFetch;
  findRecord?: (idOrSlug: string) => Promise<PluginDirectoryEntry | null>;
}

function contentHashFor(record: PluginDirectoryEntry, sha: string): string {
  return (
    record.marketplace?.contentHash ??
    createHash(HASH_ALGORITHM).update(`${record.id}@${sha}`).digest('hex')
  );
}

async function ensureShadowSource(
  tx: DatabaseAdapter,
  userId: string,
  record: PluginDirectoryEntry,
  contentHash: string,
): Promise<string> {
  const marketplace = record.marketplace!;
  const repositoryUrl = marketplace.repositoryUrl!;
  const ref =
    record.sourceLocation?.repositoryUrl === repositoryUrl ? record.sourceLocation.ref : null;
  const existing = await tx.query<{ id: string }>(
    `select id from public.plugin_marketplace_sources
      where user_id = $1 and repository_url = $2
      order by created_at asc
      limit 1`,
    [userId, repositoryUrl],
  );
  if (existing[0]) return existing[0].id;
  const inserted = await tx.query<{ id: string }>(
    `insert into public.plugin_marketplace_sources
       (user_id, name, repository_url, ref, status, content_hash, last_synced_at)
     values ($1, $2, $3, $4, $5, $6, now())
     returning id`,
    [userId, marketplace.name, repositoryUrl, ref, SOURCE_STATUS_ACTIVE, contentHash],
  );
  return inserted[0]!.id;
}

async function upsertShadowEntry(
  tx: DatabaseAdapter,
  sourceId: string,
  record: PluginDirectoryEntry,
  sha: string,
  skills: readonly InstalledDirectorySkill[],
  contentHash: string,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `insert into public.plugin_marketplace_entries
       (source_id, plugin_key, name, description, version,
        declared_skills, required_connectors, agents, example_prompts, permissions,
        content_hash, updated_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $7, now())
     on conflict (source_id, plugin_key) do update
       set name = excluded.name,
           description = excluded.description,
           version = excluded.version,
           declared_skills = excluded.declared_skills,
           content_hash = excluded.content_hash,
           updated_at = now()
     returning id`,
    [
      sourceId,
      record.id,
      record.name,
      record.description.length > 0 ? record.description : record.name,
      installedVersion(record.version, sha),
      JSON.stringify(skills.map((skill) => skill.name)),
      contentHash,
    ],
  );
  return rows[0]!.id;
}

async function upsertInstallation(
  tx: DatabaseAdapter,
  userId: string,
  entryId: string,
  version: string,
  skills: readonly InstalledDirectorySkill[],
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `insert into public.plugin_marketplace_installations
       (user_id, entry_id, installed_version, enabled, enabled_skills, installed_at, updated_at)
     values ($1, $2, $3, true, $4::jsonb, now(), now())
     on conflict (user_id, entry_id) do update
       set installed_version = excluded.installed_version,
           enabled = true,
           enabled_skills = excluded.enabled_skills,
           updated_at = now()
     returning id`,
    [userId, entryId, version, JSON.stringify(skills.map((skill) => skill.name))],
  );
  return rows[0]!.id;
}

export async function installDirectoryPlugin(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
  deps: DirectoryInstallDependencies = {},
): Promise<DirectoryInstallResult> {
  const record = await (deps.findRecord ?? findPluginDirectoryRecord)(pluginId);
  if (!record) return { status: 'missing', message: INSTALL_UNKNOWN_MESSAGE };
  if (record.sourceFacet === SOURCE_FACET_BUILTIN) {
    return { status: 'builtin', message: INSTALL_BUILTIN_MESSAGE };
  }
  const location = record.sourceLocation;
  if (!record.runtime.webInstallable || !location || !record.marketplace?.repositoryUrl) {
    return {
      status: 'blocked',
      message: record.runtime.note ?? RUNTIME_NOTE_SOURCE_UNKNOWN,
      installCommand: record.installCommand,
    };
  }
  const sha = location.sha;
  if (!sha) {
    return {
      status: 'blocked',
      message: RUNTIME_NOTE_NOT_INSPECTED,
      installCommand: record.installCommand,
    };
  }

  const skills = await fetchPluginSkillFiles(
    { ...location, sha },
    record.runtime.components.skillPaths,
    deps.fetchImpl,
  );
  if (skills.length === 0) {
    return { status: 'skills-unavailable', message: INSTALL_SKILLS_UNAVAILABLE_MESSAGE };
  }
  await writeInstalledSkills(
    installedSkillsCacheParams(record.marketplace.repositoryUrl, record.id, sha),
    skills,
  );

  const contentHash = contentHashFor(record, sha);
  const installationId = await db.transaction(async (tx) => {
    const sourceId = await ensureShadowSource(tx, userId, record, contentHash);
    const entryId = await upsertShadowEntry(tx, sourceId, record, sha, skills, contentHash);
    return upsertInstallation(tx, userId, entryId, installedVersion(record.version, sha), skills);
  });
  const installation = await getMarketplaceInstallation(db, userId, installationId);
  if (!installation) return { status: 'missing', message: INSTALL_UNKNOWN_MESSAGE };
  return { status: 'installed', installation, skills: skills.map((skill) => skill.name) };
}

interface RemovedInstallationRow {
  entry_id: string;
  source_id: string;
  repository_url: string;
}

export async function uninstallDirectoryInstallation(
  db: DatabaseAdapter,
  userId: string,
  installationId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx.query<RemovedInstallationRow>(
      `with removed as (
         delete from public.plugin_marketplace_installations
          where id = $1 and user_id = $2
          returning entry_id
       )
       select removed.entry_id, entries.source_id, sources.repository_url
         from removed
         join public.plugin_marketplace_entries entries on entries.id = removed.entry_id
         join public.plugin_marketplace_sources sources on sources.id = entries.source_id`,
      [installationId, userId],
    );
    const row = removed[0];
    if (!row) return false;
    if (!isDirectoryMarketplaceRepository(row.repository_url)) return true;
    await tx.execute(
      `delete from public.plugin_marketplace_entries entries
        where entries.id = $1
          and not exists (
            select 1 from public.plugin_marketplace_installations installation
             where installation.entry_id = entries.id
          )`,
      [row.entry_id],
    );
    await tx.execute(
      `delete from public.plugin_marketplace_sources sources
        where sources.id = $1 and sources.user_id = $2
          and not exists (
            select 1 from public.plugin_marketplace_entries entries
             where entries.source_id = sources.id
          )`,
      [row.source_id, userId],
    );
    return true;
  });
}
