import 'server-only';

import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';
import {
  CACHE_PARAMS_VERSION,
  INGEST_LEASE_CACHE_METHOD,
  INSPECTIONS_CACHE_METHOD,
  INSPECTIONS_TTL_MS,
  INSTALLED_SKILLS_CACHE_METHOD,
  INSTALLED_SKILLS_TTL_MS,
  SNAPSHOT_CACHE_METHOD,
  SNAPSHOT_TTL_MS,
  SYNC_STATE_CACHE_METHOD,
  SYNC_STATE_TTL_MS,
} from './constants';
import type {
  InstalledDirectorySkill,
  PluginDirectoryEntry,
  PluginInspectionRecord,
} from './types';

const cacheStore = new NeonMcpResponseCacheStore();

function key(method: string, params: string = CACHE_PARAMS_VERSION) {
  return { method, params, partition: '' };
}

function parseJson<T>(value: string | undefined): T | null {
  if (value === undefined) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function readPluginSnapshotStamp(): Promise<number | null> {
  return cacheStore.getStamp(key(SNAPSHOT_CACHE_METHOD));
}

export async function readPluginSnapshotRecords(): Promise<readonly PluginDirectoryEntry[] | null> {
  const entry = await cacheStore.get(key(SNAPSHOT_CACHE_METHOD));
  const parsed = parseJson<PluginDirectoryEntry[]>(entry?.value);
  return Array.isArray(parsed) ? parsed : null;
}

export async function writePluginSnapshotRecords(
  records: readonly PluginDirectoryEntry[],
): Promise<number> {
  return cacheStore.set(key(SNAPSHOT_CACHE_METHOD), {
    value: JSON.stringify(records),
    expiresAt: Date.now() + SNAPSHOT_TTL_MS,
    scope: 'public',
  });
}

export interface PluginDirectorySyncState {
  readonly lastSyncAt: string | null;
  readonly lastManifestHash: string | null;
  readonly lastError: string | null;
  readonly firstSeenAt: Readonly<Record<string, string>>;
}

export const DEFAULT_PLUGIN_SYNC_STATE: PluginDirectorySyncState = {
  lastSyncAt: null,
  lastManifestHash: null,
  lastError: null,
  firstSeenAt: {},
};

export async function readPluginSyncState(): Promise<PluginDirectorySyncState> {
  const entry = await cacheStore.get(key(SYNC_STATE_CACHE_METHOD));
  const parsed = parseJson<Partial<PluginDirectorySyncState>>(entry?.value);
  return parsed ? { ...DEFAULT_PLUGIN_SYNC_STATE, ...parsed } : DEFAULT_PLUGIN_SYNC_STATE;
}

export async function writePluginSyncState(state: PluginDirectorySyncState): Promise<void> {
  await cacheStore.set(key(SYNC_STATE_CACHE_METHOD), {
    value: JSON.stringify(state),
    expiresAt: Date.now() + SYNC_STATE_TTL_MS,
    scope: 'public',
  });
}

export type PluginInspectionMap = Record<string, PluginInspectionRecord>;

export async function readPluginInspections(): Promise<PluginInspectionMap> {
  const entry = await cacheStore.get(key(INSPECTIONS_CACHE_METHOD));
  const parsed = parseJson<PluginInspectionMap>(entry?.value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export async function writePluginInspections(map: PluginInspectionMap): Promise<void> {
  await cacheStore.set(key(INSPECTIONS_CACHE_METHOD), {
    value: JSON.stringify(map),
    expiresAt: Date.now() + INSPECTIONS_TTL_MS,
    scope: 'public',
  });
}

export interface PluginIngestLease {
  readonly startedAt: string;
  readonly expiresAt: string;
}

export async function readPluginIngestLease(nowMs: number): Promise<PluginIngestLease | null> {
  const entry = await cacheStore.get(key(INGEST_LEASE_CACHE_METHOD));
  if (!entry || entry.expiresAt === undefined || entry.expiresAt <= nowMs) return null;
  return parseJson<PluginIngestLease>(entry.value);
}

export async function writePluginIngestLease(lease: PluginIngestLease): Promise<void> {
  await cacheStore.set(key(INGEST_LEASE_CACHE_METHOD), {
    value: JSON.stringify(lease),
    expiresAt: Date.parse(lease.expiresAt),
    scope: 'public',
  });
}

export async function clearPluginIngestLease(): Promise<void> {
  await cacheStore.delete(key(INGEST_LEASE_CACHE_METHOD));
}

export function installedSkillsCacheParams(
  marketplaceRepositoryUrl: string,
  pluginKey: string,
  sha: string,
): string {
  return `${CACHE_PARAMS_VERSION}|${marketplaceRepositoryUrl.toLowerCase()}|${pluginKey}|${sha}`;
}

export async function readInstalledSkills(
  params: string,
): Promise<readonly InstalledDirectorySkill[] | null> {
  const entry = await cacheStore.get(key(INSTALLED_SKILLS_CACHE_METHOD, params));
  const parsed = parseJson<InstalledDirectorySkill[]>(entry?.value);
  return Array.isArray(parsed) ? parsed : null;
}

export async function writeInstalledSkills(
  params: string,
  skills: readonly InstalledDirectorySkill[],
): Promise<void> {
  await cacheStore.set(key(INSTALLED_SKILLS_CACHE_METHOD, params), {
    value: JSON.stringify(skills),
    expiresAt: Date.now() + INSTALLED_SKILLS_TTL_MS,
    scope: 'public',
  });
}
