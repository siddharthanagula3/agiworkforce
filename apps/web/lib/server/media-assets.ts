import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';

/**
 * Repository for `media_assets` — the user-scoped catalog of AI-generated media.
 * User-scoped so web/desktop/mobile cloud all read the same Library by user_id.
 * All reads/writes degrade gracefully when the table hasn't been migrated yet
 * (undefined-table / undefined-column), so generation never 500s pre-migration.
 */

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

export interface MediaAsset {
  id: string;
  kind: string;
  mimeType: string;
  byteSize: number | null;
  storageUrl: string;
  prompt: string | null;
  provider: string | null;
  model: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export type MediaKind = 'image' | 'video' | 'file';

export interface InsertMediaAssetParams {
  userId: string;
  kind: MediaKind;
  mimeType: string;
  storageUrl: string;
  byteSize?: number;
  storagePathname?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
  sourceSurface?: string;
  metadata?: Record<string, unknown>;
}

function mapRow(row: Record<string, unknown>): MediaAsset {
  return {
    id: String(row['id']),
    kind: String(row['kind']),
    mimeType: String(row['mime_type']),
    byteSize: row['byte_size'] == null ? null : Number(row['byte_size']),
    storageUrl: String(row['storage_url']),
    prompt: (row['prompt'] as string | null) ?? null,
    provider: (row['provider'] as string | null) ?? null,
    model: (row['model'] as string | null) ?? null,
    width: row['width'] == null ? null : Number(row['width']),
    height: row['height'] == null ? null : Number(row['height']),
    createdAt: new Date(row['created_at'] as string).toISOString(),
  };
}

/** Record a generated asset. Returns the new id, or null if not yet migrated. */
export async function insertMediaAsset(p: InsertMediaAssetParams): Promise<string | null> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{ id: string }>(
      `insert into public.media_assets
         (user_id, kind, mime_type, byte_size, storage_url, storage_pathname,
          prompt, provider, model, width, height, source_surface, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       returning id`,
      [
        p.userId,
        p.kind,
        p.mimeType,
        p.byteSize ?? null,
        p.storageUrl,
        p.storagePathname ?? null,
        p.prompt ?? null,
        p.provider ?? null,
        p.model ?? null,
        p.width ?? null,
        p.height ?? null,
        p.sourceSurface ?? null,
        JSON.stringify(p.metadata ?? {}),
      ],
    );
    return rows[0]?.id ?? null;
  } catch (error) {
    if (isSchemaNotReady(error)) {
      logger.warn(
        { userId: p.userId, kind: p.kind },
        'media_assets not provisioned; asset not recorded',
      );
      return null;
    }
    throw error;
  }
}

/** List the current user's media, newest first. Empty array if not yet migrated. */
export async function listMediaAssets(
  userId: string,
  opts?: { kind?: MediaKind; limit?: number },
): Promise<MediaAsset[]> {
  const db = getNeonDb();
  const limit = Math.min(Math.max(opts?.limit ?? 60, 1), 200);
  const params: unknown[] = [userId];
  let kindClause = '';
  if (opts?.kind) {
    params.push(opts.kind);
    kindClause = `and kind = $${params.length}`;
  }
  try {
    const rows = await db.query<Record<string, unknown>>(
      `select id, kind, mime_type, byte_size, storage_url, prompt, provider, model, width, height, created_at
         from public.media_assets
        where user_id = $1 and deleted_at is null ${kindClause}
        order by created_at desc
        limit ${limit}`,
      params,
    );
    return rows.map(mapRow);
  } catch (error) {
    if (isSchemaNotReady(error)) return [];
    throw error;
  }
}

/**
 * One row of the Library listing (`GET /api/library`). Unlike `MediaAsset`
 * (the older gallery shape) it carries `metadata` so the route can surface
 * the persisted filename / surface / previewable / origin classification
 * (Wave A, `generated-file-persist.ts`) with documented legacy fallbacks.
 */
export interface LibraryAssetRow {
  id: string;
  kind: string;
  mimeType: string;
  byteSize: number | null;
  prompt: string | null;
  provider: string | null;
  model: string | null;
  sourceSurface: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ListLibraryAssetsOptions {
  kind?: MediaKind;
  /** Filter on persisted classification; missing metadata folds to 'file'. */
  surface?: 'artifact' | 'file';
  /** Coarse provenance bucket derived from metadata.origin. */
  origin?: 'generated' | 'uploaded';
  /** Filename/prompt substring (ILIKE, wildcards escaped). */
  search?: string;
  /**
   * When true, list only soft-deleted assets within the 30-day recovery window
   * ("Recently deleted" bin) instead of live ones. Assets past 30 days are
   * treated as permanently purged and never listed.
   */
  deleted?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * `metadata.origin` values that mark a row as user-uploaded. No writer emits
 * them yet (every current pipeline is generation), but the clause keeps the
 * uploaded/generated filter honest when upload cataloging ships.
 */
const UPLOAD_ORIGINS = ['upload', 'uploaded'] as const;

/** Escape `%`, `_` and `\` so user input matches literally under ILIKE. */
function escapeIlike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function mapLibraryRow(row: Record<string, unknown>): LibraryAssetRow {
  return {
    id: String(row['id']),
    kind: String(row['kind']),
    mimeType: String(row['mime_type']),
    byteSize: row['byte_size'] == null ? null : Number(row['byte_size']),
    prompt: (row['prompt'] as string | null) ?? null,
    provider: (row['provider'] as string | null) ?? null,
    model: (row['model'] as string | null) ?? null,
    sourceSurface: (row['source_surface'] as string | null) ?? null,
    metadata: (row['metadata'] as Record<string, unknown> | null) ?? {},
    createdAt: new Date(row['created_at'] as string).toISOString(),
  };
}

/**
 * Library listing over `media_assets` — owner-scoped, filterable, offset
 * paginated (caller probes with limit+1 for has_more). LEGACY rows (before
 * Wave A) have no `metadata.surface`; the surface filter treats them as
 * 'file' via coalesce, mirroring the client contract's `.catch('file')`.
 * Empty array when the table has not been migrated yet.
 */
export async function listLibraryAssets(
  userId: string,
  opts: ListLibraryAssetsOptions = {},
): Promise<LibraryAssetRow[]> {
  const db = getNeonDb();
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const params: unknown[] = [userId];
  const clauses: string[] = [];

  if (opts.kind) {
    params.push(opts.kind);
    clauses.push(`and kind = $${params.length}`);
  }
  if (opts.surface) {
    params.push(opts.surface);
    clauses.push(`and coalesce(metadata->>'surface', 'file') = $${params.length}`);
  }
  if (opts.origin === 'uploaded') {
    clauses.push(`and metadata->>'origin' in (${UPLOAD_ORIGINS.map((o) => `'${o}'`).join(', ')})`);
  } else if (opts.origin === 'generated') {
    clauses.push(
      `and coalesce(metadata->>'origin', '') not in (${UPLOAD_ORIGINS.map((o) => `'${o}'`).join(', ')})`,
    );
  }
  if (opts.search) {
    params.push(`%${escapeIlike(opts.search)}%`);
    clauses.push(
      `and (coalesce(metadata->>'filename', '') ilike $${params.length} or coalesce(prompt, '') ilike $${params.length})`,
    );
  }

  // Live library excludes soft-deleted rows; the Recently-deleted bin lists only
  // soft-deleted rows still inside the 30-day recovery window (older = purged).
  const lifecycleClause = opts.deleted
    ? "and deleted_at is not null and deleted_at > now() - interval '30 days'"
    : 'and deleted_at is null';
  const orderColumn = opts.deleted ? 'deleted_at' : 'created_at';

  params.push(limit, offset);
  try {
    const rows = await db.query<Record<string, unknown>>(
      `select id, kind, mime_type, byte_size, prompt, provider, model, source_surface, metadata, created_at, deleted_at
         from public.media_assets
        where user_id = $1 ${lifecycleClause} ${clauses.join(' ')}
        order by ${orderColumn} desc, id desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return rows.map(mapLibraryRow);
  } catch (error) {
    if (isSchemaNotReady(error)) return [];
    throw error;
  }
}

/**
 * One asset row with ownership + storage pointer, for the authenticated
 * byte-serving route (`/api/files/[id]`). Unlike the Library list shape this
 * includes `userId` (authorization check), `storagePathname` (R2 key), and
 * `metadata` (original filename for Content-Disposition).
 */
export interface MediaAssetForServing {
  id: string;
  userId: string;
  kind: string;
  mimeType: string;
  byteSize: number | null;
  storageUrl: string;
  storagePathname: string | null;
  metadata: Record<string, unknown>;
  deletedAt: string | null;
}

/**
 * Fetch a single asset by id REGARDLESS of owner — the caller must compare
 * `userId` and return 403 on mismatch. Returns null when the row does not
 * exist or the table has not been migrated yet.
 */
export async function getMediaAssetById(id: string): Promise<MediaAssetForServing | null> {
  const db = getNeonDb();
  try {
    const rows = await db.query<Record<string, unknown>>(
      `select id, user_id, kind, mime_type, byte_size, storage_url, storage_pathname,
              metadata, deleted_at
         from public.media_assets
        where id = $1
        limit 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: String(row['id']),
      userId: String(row['user_id']),
      kind: String(row['kind']),
      mimeType: String(row['mime_type']),
      byteSize: row['byte_size'] == null ? null : Number(row['byte_size']),
      storageUrl: String(row['storage_url']),
      storagePathname: (row['storage_pathname'] as string | null) ?? null,
      metadata: (row['metadata'] as Record<string, unknown> | null) ?? {},
      deletedAt:
        row['deleted_at'] == null ? null : new Date(row['deleted_at'] as string).toISOString(),
    };
  } catch (error) {
    if (isSchemaNotReady(error)) return null;
    throw error;
  }
}

/** Soft-delete one of the user's assets. Returns true when a row was updated. */
export async function softDeleteMediaAsset(userId: string, id: string): Promise<boolean> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{ id: string }>(
      `update public.media_assets
         set deleted_at = now()
       where id = $1 and user_id = $2 and deleted_at is null
       returning id`,
      [id, userId],
    );
    return rows.length > 0;
  } catch (error) {
    if (isSchemaNotReady(error)) return false;
    throw error;
  }
}

/**
 * Restore a soft-deleted asset from the Recently-deleted bin. Owner-scoped and
 * bounded to the same 30-day recovery window the bin lists — an asset deleted
 * longer ago is considered permanently purged and cannot be restored. Returns
 * false if there is no matching restorable row (already live, not owned, or
 * past the window).
 */
export async function restoreMediaAsset(userId: string, id: string): Promise<boolean> {
  const db = getNeonDb();
  try {
    const rows = await db.query<{ id: string }>(
      `update public.media_assets
         set deleted_at = null
       where id = $1 and user_id = $2
         and deleted_at is not null
         and deleted_at > now() - interval '30 days'
       returning id`,
      [id, userId],
    );
    return rows.length > 0;
  } catch (error) {
    if (isSchemaNotReady(error)) return false;
    throw error;
  }
}
