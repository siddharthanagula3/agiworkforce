import 'server-only';

import { createHash } from 'node:crypto';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { PluginMarketplaceInstallation } from '@agiworkforce/cloud-contracts';

import { pluginLabel, PluginDependencyError } from '@/lib/services/plugin-dependencies';
import {
  getMarketplaceInstallation,
  installMarketplaceEntries,
  installMarketplaceEntry,
} from '@/lib/services/plugin-marketplace-installation-service';
import { getMarketplaceSourceEntry } from '@/lib/services/plugin-marketplace-service';
import {
  dependencyAdmissions,
  DependencySkillsUnavailableError,
  directoryDependencies,
  DirectorySourceUnavailableError,
  installableSource,
  installedDependencies,
  planMarketplaceDependencies,
  type DependencyContext,
  type DependencyPlan,
  type DependencyRoot,
  type InstallableSource,
  type InstalledDependency,
} from './dependencies';
import {
  shadowSourceName,
  INSTALL_BUILTIN_MESSAGE,
  INSTALL_ENTRY_UNAVAILABLE_MESSAGE,
  INSTALL_MANIFEST_UNAVAILABLE_MESSAGE,
  INSTALL_SKILLS_UNAVAILABLE_MESSAGE,
  INSTALL_UNKNOWN_MESSAGE,
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
  | {
      status: 'installed';
      installation: PluginMarketplaceInstallation;
      skills: string[];
      dependencies: InstalledDependency[];
    }
  | { status: 'missing'; message: string }
  | { status: 'builtin'; message: string }
  | { status: 'blocked'; message: string; installCommand: string | null }
  | { status: 'not-permitted'; message: string }
  | { status: 'skills-unavailable'; message: string }
  | { status: 'source-unavailable'; message: string };

export interface DirectoryDependencyAdmission {
  pluginKey: string;
  requiredBy: string;
}

export interface DirectoryInstallDependencies {
  fetchImpl?: DirectoryFetch;
  findRecord?: (idOrSlug: string) => Promise<PluginDirectoryEntry | null>;
  admitDependencies?: (
    dependencies: readonly DirectoryDependencyAdmission[],
  ) => Promise<string | null>;
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
    [
      userId,
      shadowSourceName(marketplace.name),
      repositoryUrl,
      ref,
      SOURCE_STATUS_ACTIVE,
      contentHash,
    ],
  );
  return inserted[0]!.id;
}

/**
 * The four declaration columns were written as literal empty arrays, and the
 * conflict branch did not refresh them either, so an installed plugin claimed
 * to need no connectors, request no permissions and ship no agents whatever its
 * manifest said. The install screen reads these to tell the user what they are
 * agreeing to, which made the omission the difference between an informed
 * install and a blind one.
 */
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
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, now())
     on conflict (source_id, plugin_key) do update
       set name = excluded.name,
           description = excluded.description,
           version = excluded.version,
           declared_skills = excluded.declared_skills,
           required_connectors = excluded.required_connectors,
           agents = excluded.agents,
           example_prompts = excluded.example_prompts,
           permissions = excluded.permissions,
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
      JSON.stringify(record.requiredConnectors),
      JSON.stringify(record.runtime.components.agents),
      JSON.stringify(record.examplePrompts),
      JSON.stringify(record.permissions),
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

async function writeDirectoryInstall(
  tx: DatabaseAdapter,
  userId: string,
  source: InstallableSource,
  skills: readonly InstalledDirectorySkill[],
): Promise<string> {
  const contentHash = contentHashFor(source.record, source.sha);
  const sourceId = await ensureShadowSource(tx, userId, source.record, contentHash);
  const entryId = await upsertShadowEntry(
    tx,
    sourceId,
    source.record,
    source.sha,
    skills,
    contentHash,
  );
  return upsertInstallation(
    tx,
    userId,
    entryId,
    installedVersion(source.record.version, source.sha),
    skills,
  );
}

async function writeDependencySkills(plan: DependencyPlan): Promise<void> {
  for (const { source, skills } of plan.directory) {
    await writeInstalledSkills(
      installedSkillsCacheParams(source.repositoryUrl, source.record.id, source.sha, source.sha),
      skills,
    );
  }
}

async function writeDependencyPlan(
  tx: DatabaseAdapter,
  userId: string,
  plan: DependencyPlan,
): Promise<Map<string, string>> {
  const installationIds = new Map<string, string>();
  const entryInstallations = await installMarketplaceEntries(
    tx,
    userId,
    plan.entries.map(({ found }) => found.entry),
  );
  for (const { resolved, found } of plan.entries) {
    const installationId = entryInstallations.get(found.entry.id);
    if (installationId) installationIds.set(resolved.label, installationId);
  }
  for (const { resolved, source, skills } of plan.directory) {
    installationIds.set(resolved.label, await writeDirectoryInstall(tx, userId, source, skills));
  }
  for (const { resolved, installationId } of plan.enable) {
    await tx.execute(
      `update public.plugin_marketplace_installations
          set enabled = true, updated_at = now()
        where id = $1 and user_id = $2`,
      [installationId, userId],
    );
    installationIds.set(resolved.label, installationId);
  }
  return installationIds;
}

function dependencyContext(
  db: DatabaseAdapter,
  userId: string,
  deps: DirectoryInstallDependencies,
): DependencyContext {
  return {
    db,
    userId,
    fetchImpl: deps.fetchImpl ?? fetch,
    findRecord: deps.findRecord ?? findPluginDirectoryRecord,
  };
}

async function planDependencies(
  context: DependencyContext,
  root: () => Promise<DependencyRoot>,
  installCommand: string | null,
): Promise<{ plan: DependencyPlan } | { refused: DirectoryInstallResult }> {
  try {
    return { plan: await planMarketplaceDependencies(context, await root()) };
  } catch (error) {
    if (error instanceof PluginDependencyError) {
      return { refused: { status: 'blocked', message: error.message, installCommand } };
    }
    if (error instanceof DirectorySourceUnavailableError) {
      return { refused: { status: 'source-unavailable', message: error.message } };
    }
    if (error instanceof DependencySkillsUnavailableError) {
      return { refused: { status: 'skills-unavailable', message: error.message } };
    }
    throw error;
  }
}

async function admitDependencies(
  plan: DependencyPlan,
  deps: DirectoryInstallDependencies,
): Promise<string | null> {
  if (plan.resolved.length === 0 || !deps.admitDependencies) return null;
  return deps.admitDependencies(dependencyAdmissions(plan));
}

export async function installDirectoryPlugin(
  db: DatabaseAdapter,
  userId: string,
  pluginId: string,
  deps: DirectoryInstallDependencies = {},
): Promise<DirectoryInstallResult> {
  const context = dependencyContext(db, userId, deps);
  const record = await context.findRecord(pluginId);
  if (!record) return { status: 'missing', message: INSTALL_UNKNOWN_MESSAGE };
  if (record.sourceFacet === SOURCE_FACET_BUILTIN) {
    return { status: 'builtin', message: INSTALL_BUILTIN_MESSAGE };
  }
  const checked = installableSource(record);
  if (!checked.ok) {
    return { status: 'blocked', message: checked.note, installCommand: record.installCommand };
  }
  const root = checked.source;

  const skills = await fetchPluginSkillFiles(
    { ...root.location, sha: root.sha },
    record.runtime.components.skillPaths,
    context.fetchImpl,
  );
  if (skills.length === 0) {
    return { status: 'skills-unavailable', message: INSTALL_SKILLS_UNAVAILABLE_MESSAGE };
  }

  const rootLabel = pluginLabel(record.id, root.marketplaceName);
  const planned = await planDependencies(
    context,
    async () => ({
      name: record.id,
      marketplace: root.marketplaceName,
      allowlist: record.marketplace?.allowCrossMarketplaceDependenciesOn ?? [],
      plugin: { kind: 'directory', source: root },
      dependencies: await directoryDependencies(
        root,
        context.fetchImpl,
        `${rootLabel} declares dependencies the web app cannot read, so install it from the released CLI.`,
        INSTALL_MANIFEST_UNAVAILABLE_MESSAGE,
      ),
    }),
    record.installCommand,
  );
  if ('refused' in planned) return planned.refused;
  const { plan } = planned;
  const refusal = await admitDependencies(plan, deps);
  if (refusal) return { status: 'not-permitted', message: refusal };

  await writeInstalledSkills(
    installedSkillsCacheParams(root.repositoryUrl, record.id, root.sha, root.sha),
    skills,
  );
  await writeDependencySkills(plan);

  const written = await db.transaction(async (tx) => {
    const installationIds = await writeDependencyPlan(tx, userId, plan);
    const installationId = await writeDirectoryInstall(tx, userId, root, skills);
    return { installationId, installationIds };
  });

  const installation = await getMarketplaceInstallation(db, userId, written.installationId);
  if (!installation) return { status: 'missing', message: INSTALL_UNKNOWN_MESSAGE };
  return {
    status: 'installed',
    installation,
    skills: skills.map((skill) => skill.name),
    dependencies: installedDependencies(plan, written.installationIds),
  };
}

export async function installMarketplaceEntryPlugin(
  db: DatabaseAdapter,
  userId: string,
  entryId: string,
  deps: DirectoryInstallDependencies = {},
): Promise<DirectoryInstallResult> {
  const found = await getMarketplaceSourceEntry(db, userId, entryId);
  if (!found) {
    return { status: 'blocked', message: INSTALL_ENTRY_UNAVAILABLE_MESSAGE, installCommand: null };
  }
  const { entry } = found;
  const rootLabel = pluginLabel(entry.pluginKey, found.sourceName);
  const declared = found.dependencies;
  if (!declared) {
    return {
      status: 'blocked',
      message: `${rootLabel} declares dependencies that cannot be read, so it was not installed.`,
      installCommand: null,
    };
  }

  const context = dependencyContext(db, userId, deps);
  const planned = await planDependencies(
    context,
    async () => ({
      name: entry.pluginKey,
      marketplace: found.sourceName,
      allowlist: found.allowlist,
      plugin: { kind: 'entry', found },
      dependencies: declared,
    }),
    null,
  );
  if ('refused' in planned) return planned.refused;
  const { plan } = planned;
  const refusal = await admitDependencies(plan, deps);
  if (refusal) return { status: 'not-permitted', message: refusal };

  await writeDependencySkills(plan);
  const written = await db.transaction(async (tx) => {
    const installationIds = await writeDependencyPlan(tx, userId, plan);
    const installation = await installMarketplaceEntry(tx, userId, entryId);
    return { installation, installationIds };
  });

  if (!written.installation) {
    return { status: 'blocked', message: INSTALL_ENTRY_UNAVAILABLE_MESSAGE, installCommand: null };
  }
  return {
    status: 'installed',
    installation: written.installation,
    skills: entry.declaredSkills,
    dependencies: installedDependencies(plan, written.installationIds),
  };
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
        using public.plugin_marketplace_sources sources
        where entries.id = $1
          and sources.id = entries.source_id
          and sources.user_id = $2
          and not exists (
            select 1 from public.plugin_marketplace_installations installation
             where installation.entry_id = entries.id
          )`,
      [row.entry_id, userId],
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
