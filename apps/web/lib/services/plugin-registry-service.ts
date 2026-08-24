import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  isPluginCapability,
  isPluginId,
  isPluginManifest,
  isPluginRegistryStatus,
  isPluginSemver,
  isPluginSha256,
  isPluginSourceKind,
  type PluginCapability,
  type PluginDistribution,
  type PluginManifest,
  type PluginRegistryEntry,
  type PluginRegistryStatus,
  type PluginSourceKind,
  type PluginVersionRef,
} from '@agiworkforce/types';

export const PLUGIN_REGISTRY_DEFAULT_LIMIT = 50;
export const PLUGIN_REGISTRY_MAX_LIMIT = 100;

const MAX_ARRAY_ITEMS = 50;
const MAX_ITEM_CHARS = 200;

interface PluginRegistryRow {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  publisher_id: string;
  publisher_name: string;
  publisher_kind: string;
  publisher_url: string | null;
  source: string;
  status: string;
  web_installable: boolean;
  declared_skills: unknown;
  required_connectors: unknown;
  capabilities: unknown;
  permissions: unknown;
  example_prompts: unknown;
  versions: unknown;
  manifest: unknown;
  manifest_url: string | null;
  sha256: string | null;
  signature: string | null;
  signature_algorithm: string | null;
  homepage_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export class PluginRegistryDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginRegistryDataError';
  }
}

export interface ListPluginRegistryEntriesOptions {
  category?: string | undefined;
  status?: PluginRegistryStatus | undefined;
  source?: PluginSourceKind | undefined;
  /** Page size, clamped to {@link PLUGIN_REGISTRY_MAX_LIMIT}. */
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListPluginRegistryEntriesResult {
  entries: PluginRegistryEntry[];
  total: number;
}

function toIso(value: string | Date | null): string {
  if (value === null) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeStringList(value: unknown): string[] {
  return toArray(value)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, MAX_ITEM_CHARS))
    .slice(0, MAX_ARRAY_ITEMS);
}

function normalizeCapabilities(value: unknown): PluginCapability[] {
  return toArray(value).filter(isPluginCapability).slice(0, MAX_ARRAY_ITEMS);
}

function normalizeVersions(value: unknown): PluginVersionRef[] {
  const out: PluginVersionRef[] = [];
  for (const item of toArray(value)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (!isPluginSemver(record['version'])) continue;
    const ref: PluginVersionRef = {
      version: record['version'],
      releasedAt: typeof record['releasedAt'] === 'string' ? record['releasedAt'] : toIso(null),
      manifestUrl: typeof record['manifestUrl'] === 'string' ? record['manifestUrl'] : null,
      sha256: isPluginSha256(record['sha256']) ? record['sha256'] : null,
      notes: typeof record['notes'] === 'string' ? record['notes'].slice(0, 1_000) : null,
    };
    out.push(ref);
    if (out.length >= MAX_ARRAY_ITEMS) break;
  }
  return out;
}

function normalizeDistribution(row: PluginRegistryRow): PluginDistribution | null {
  const url = row.manifest_url?.trim();
  if (!url) return null;
  return { manifestUrl: url, sha256: isPluginSha256(row.sha256) ? row.sha256 : null };
}

function rowToEntry(row: PluginRegistryRow): PluginRegistryEntry {
  if (!isPluginId(row.id)) {
    throw new PluginRegistryDataError(`Registry row has an unusable id: ${String(row.id)}`);
  }
  if (!isPluginRegistryStatus(row.status)) {
    throw new PluginRegistryDataError(`Registry row ${row.id} has unknown status: ${row.status}`);
  }
  if (!isPluginSourceKind(row.source)) {
    throw new PluginRegistryDataError(`Registry row ${row.id} has unknown source: ${row.source}`);
  }
  if (!isPluginSemver(row.version)) {
    throw new PluginRegistryDataError(`Registry row ${row.id} has a loose version: ${row.version}`);
  }

  const distribution = normalizeDistribution(row);
  if (row.status === 'published' && distribution === null && row.web_installable !== true) {
    throw new PluginRegistryDataError(
      `Registry row ${row.id} claims published but carries neither a manifest URL nor an embedded Web pack`,
    );
  }

  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description ?? '',
    category: row.category ?? '',
    publisher: {
      id: row.publisher_id,
      name: row.publisher_name,
      kind: row.publisher_kind === 'first-party' ? 'first-party' : 'third-party',
      url: row.publisher_url,
    },
    source: row.source,
    status: row.status,
    webInstallable: row.web_installable === true,
    declaredSkills: normalizeStringList(row.declared_skills),
    requiredConnectors: normalizeStringList(row.required_connectors),
    capabilities: normalizeCapabilities(row.capabilities),
    permissions: normalizeStringList(row.permissions),
    examplePrompts: normalizeStringList(row.example_prompts),
    versions: normalizeVersions(row.versions),
    distribution,
    integrity: {
      sha256: isPluginSha256(row.sha256) ? row.sha256 : null,
      signature: null,
      signatureAlgorithm: null,
    },
    homepageUrl: row.homepage_url,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToManifest(row: PluginRegistryRow): PluginManifest | null {
  const manifest = toObject(row.manifest);
  if (manifest === null || manifest === undefined) return null;
  return isPluginManifest(manifest) ? manifest : null;
}

export async function listPluginRegistryEntries(
  db: DatabaseAdapter,
  options: ListPluginRegistryEntriesOptions = {},
): Promise<ListPluginRegistryEntriesResult> {
  const limit = Math.min(
    PLUGIN_REGISTRY_MAX_LIMIT,
    Math.max(1, Math.floor(options.limit ?? PLUGIN_REGISTRY_DEFAULT_LIMIT)),
  );
  const offset = Math.max(0, Math.floor(options.offset ?? 0));

  const category = options.category?.trim();
  const status = options.status && isPluginRegistryStatus(options.status) ? options.status : null;
  const source = options.source && isPluginSourceKind(options.source) ? options.source : null;

  const rows = await db.query<PluginRegistryRow & { total_count: number | string }>(
    `select *, count(*) over () as total_count
       from public.plugin_registry_entries
      where ($1::text is null or lower(category) = lower($1))
        and ($2::text is null or status = $2)
        and ($3::text is null or source = $3)
      order by category asc, name asc, id asc
      limit $4 offset $5`,
    [category && category.length > 0 ? category : null, status, source, limit, offset],
  );

  const entries: PluginRegistryEntry[] = [];
  for (const row of rows) {
    try {
      entries.push(rowToEntry(row));
    } catch (error) {
      if (!(error instanceof PluginRegistryDataError)) throw error;
    }
  }

  const first = rows[0];
  const total = first ? Number(first.total_count) : 0;
  return { entries, total: Number.isFinite(total) ? total : entries.length };
}

export async function getPluginRegistryEntry(
  db: DatabaseAdapter,
  id: string,
): Promise<{ entry: PluginRegistryEntry; manifest: PluginManifest | null } | null> {
  if (!isPluginId(id)) return null;

  const rows = await db.query<PluginRegistryRow>(
    `select * from public.plugin_registry_entries where id = $1 limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  return { entry: rowToEntry(row), manifest: rowToManifest(row) };
}
