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

/**
 * Hosted plugin registry reads (CAP-046 slice 2).
 *
 * Mechanics only: this module turns `public.plugin_registry_entries` rows
 * (db/neon/0096_plugin_registry.sql) into the `PluginRegistryEntry` contract
 * and nothing else. Policy — who may read, what a rate limit is, what an empty
 * catalogue means for the page — lives in the route and the UI.
 *
 * There is deliberately NO write path here. Migration 0096 grants the
 * non-privileged `app_rls` role SELECT only, and third-party submission is a
 * pending founder decision; a write function would be machinery for a flow that
 * does not exist.
 *
 * Every row is re-validated against the contract on the way out. The database
 * CHECKs already reject most malformed values, but a row written before a
 * constraint existed (or by a future admin path) must never be cast blindly
 * into the union types the CLI trusts.
 */

// ─── Bounds ───────────────────────────────────────────────────────────────────

/** Default page size for the public list endpoint. */
export const PLUGIN_REGISTRY_DEFAULT_LIMIT = 50;
/** Hard ceiling so one request cannot pull the whole table. */
export const PLUGIN_REGISTRY_MAX_LIMIT = 100;

const MAX_ARRAY_ITEMS = 50;
const MAX_ITEM_CHARS = 200;

// ─── Row shape ────────────────────────────────────────────────────────────────

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

/** Raised when a stored row cannot be represented by the contract. */
export class PluginRegistryDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginRegistryDataError';
  }
}

export interface ListPluginRegistryEntriesOptions {
  /** Exact category match (case-insensitive). */
  category?: string | undefined;
  /** Exact availability match. */
  status?: PluginRegistryStatus | undefined;
  /** Exact provenance match. */
  source?: PluginSourceKind | undefined;
  /** Page size, clamped to {@link PLUGIN_REGISTRY_MAX_LIMIT}. */
  limit?: number | undefined;
  /** Zero-based offset. */
  offset?: number | undefined;
}

export interface ListPluginRegistryEntriesResult {
  entries: PluginRegistryEntry[];
  /** Matching rows before `limit`/`offset` were applied. */
  total: number;
}

// ─── Normalization ────────────────────────────────────────────────────────────

function toIso(value: string | Date | null): string {
  if (value === null) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

/** jsonb columns arrive as parsed values on Neon, but a string is possible. */
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

/** Non-empty strings only, bounded in count and length. */
function normalizeStringList(value: unknown): string[] {
  return toArray(value)
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, MAX_ITEM_CHARS))
    .slice(0, MAX_ARRAY_ITEMS);
}

/** Unknown capability strings are dropped, never passed through as a claim. */
function normalizeCapabilities(value: unknown): PluginCapability[] {
  return toArray(value).filter(isPluginCapability).slice(0, MAX_ARRAY_ITEMS);
}

/**
 * Keep only version refs that carry a real semantic version. A ref whose
 * digest is not a valid SHA-256 keeps the version but drops the digest: a
 * malformed digest must never be presented as an integrity claim.
 */
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

/**
 * Distribution exists only when the row really has an artifact URL. A
 * `published` row without one violates a DB CHECK, so reaching here means the
 * row predates the constraint — report it rather than inventing a URL.
 */
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
      // The DB CHECK pins this to first-party today; anything else is treated
      // as third-party rather than silently upgraded to first-party trust.
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
    versions: normalizeVersions(row.versions),
    distribution,
    integrity: {
      sha256: isPluginSha256(row.sha256) ? row.sha256 : null,
      // Never surfaced as populated until a verifier exists (0096 CHECK).
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
  // A stored manifest that does not satisfy the contract is dropped, not
  // repaired: the CLI would otherwise install a shape it cannot load.
  return isPluginManifest(manifest) ? manifest : null;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * List catalogue entries, newest-status-agnostic and ordered for stable paging.
 *
 * Filters are exact matches on indexed columns. `total` is the count before
 * paging so a client can tell "no matches" from "end of page".
 */
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
      // One malformed row must not take down the whole catalogue; it is
      // omitted (fail closed for that entry) and reported for repair.
      if (!(error instanceof PluginRegistryDataError)) throw error;
    }
  }

  const first = rows[0];
  const total = first ? Number(first.total_count) : 0;
  return { entries, total: Number.isFinite(total) ? total : entries.length };
}

/**
 * Fetch one entry plus its manifest.
 *
 * Returns null when the id does not exist OR is not a well-formed plugin id —
 * an unknown id and a malformed id are the same 404 to the caller, so the
 * endpoint cannot be probed for id-shape feedback.
 */
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
