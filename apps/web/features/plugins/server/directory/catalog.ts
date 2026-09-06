import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { countPluginInstallations } from '@/lib/services/plugin-installation-service';
import { listPluginRegistryEntries } from '@/lib/services/plugin-registry-service';
import { getManagedSkillPluginOwners } from '@/lib/services/skill-catalog-service';
import { PLUGIN_DIRECTORY_BUILTIN_READ_LIMIT, SOURCE_FACET_BUILTIN } from './constants';
import { findPluginDirectoryRecord, getPluginDirectoryRecords } from './memory-cache';
import { builtInDirectoryEntry, mergeDirectoryEntries } from './merge';
import type { PluginDirectoryEntry } from './types';

async function loadBuiltInEntries(): Promise<PluginDirectoryEntry[]> {
  const db = getNeonDb();
  const [{ entries }, installCounts, skillOwners] = await Promise.all([
    listPluginRegistryEntries(db, { limit: PLUGIN_DIRECTORY_BUILTIN_READ_LIMIT }),
    countPluginInstallations(db),
    getManagedSkillPluginOwners(),
  ]);
  return entries.map((entry) => ({
    ...builtInDirectoryEntry(entry, installCounts.get(entry.id) ?? 0),
    skillsRequireInstall: entry.declaredSkills.some((skill) => skillOwners.get(skill) === entry.id),
  }));
}

export function withSkillClaim(entry: PluginDirectoryEntry): PluginDirectoryEntry {
  if (entry.sourceFacet === SOURCE_FACET_BUILTIN) return entry;
  return { ...entry, skillsRequireInstall: entry.declaredSkills.length > 0 };
}

export async function loadPluginDirectory(): Promise<PluginDirectoryEntry[]> {
  const [builtIn, snapshot] = await Promise.all([
    loadBuiltInEntries(),
    getPluginDirectoryRecords(),
  ]);
  return mergeDirectoryEntries(builtIn, snapshot.map(withSkillClaim)).entries;
}

export async function findDirectoryEntry(idOrSlug: string): Promise<PluginDirectoryEntry | null> {
  const record = await findPluginDirectoryRecord(idOrSlug);
  return record ? withSkillClaim(record) : null;
}
