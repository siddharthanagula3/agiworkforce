import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { deleteStoredMedia } from '@/lib/server/media-storage';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

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
  /**
   * Server-proven workspace captured when the operation was admitted. This is
   * required because async completion must never re-resolve a later workspace.
   * Explicit null preserves captured Personal provenance.
   */
  organizationId: string | null;
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
  /**
   * Conversation that produced this asset (migration 0081). Provenance only —
   * `on delete set null`, so deleting a chat never destroys its generated
   * files. Absent for uploads, which have no source conversation.
   */
  conversationId?: string;
}

type MediaAssetQueryClient = Pick<ReturnType<typeof getNeonDb>, 'query'>;

const REQUIRED_MEDIA_ASSET_COLUMNS = [
  ['id', 'uuid', 'NO', 'required'],
  ['user_id', 'text', 'NO', 'forbidden'],
  ['organization_id', 'uuid', 'YES', 'forbidden'],
  ['kind', 'text', 'NO', 'forbidden'],
  ['mime_type', 'text', 'NO', 'forbidden'],
  ['byte_size', 'int4', 'YES', 'forbidden'],
  ['storage_url', 'text', 'NO', 'forbidden'],
  ['storage_pathname', 'text', 'YES', 'forbidden'],
  ['prompt', 'text', 'YES', 'forbidden'],
  ['provider', 'text', 'YES', 'forbidden'],
  ['model', 'text', 'YES', 'forbidden'],
  ['width', 'int4', 'YES', 'forbidden'],
  ['height', 'int4', 'YES', 'forbidden'],
  ['source_surface', 'text', 'YES', 'forbidden'],
  ['metadata', 'jsonb', 'NO', 'required'],
  ['conversation_id', 'uuid', 'YES', 'forbidden'],
  ['created_at', 'timestamptz', 'NO', 'required'],
  ['deleted_at', 'timestamptz', 'YES', 'forbidden'],
] as const;

/**
 * Prove that the deployed media catalog has the complete schema used by the
 * current image and video persistence paths. Column names alone are not
 * enough: migration 0081 originally pointed `conversation_id` at the gateway
 * compatibility table, while Web writes `web_conversations` ids. Callers must
 * fail closed unless the complete column shape and the single canonical
 * `on delete set null` foreign key are present.
 */
export async function isMediaAssetStoreReady(
  db: MediaAssetQueryClient = getNeonDb(),
): Promise<boolean> {
  try {
    const [readiness] = await db.query<{ ready: boolean }>(
      `select
         to_regclass('public.media_assets') is not null
         and not exists (
           select 1
             from jsonb_to_recordset($1::jsonb) as required(
               column_name text,
               udt_name text,
               is_nullable text,
               default_policy text
             )
            where not exists (
              select 1
                from information_schema.columns actual
               where actual.table_schema = 'public'
                 and actual.table_name = 'media_assets'
                 and actual.column_name = required.column_name
                 and actual.udt_name = required.udt_name
                 and actual.is_nullable = required.is_nullable
                 and case required.default_policy
                   when 'required' then actual.column_default is not null
                   when 'forbidden' then actual.column_default is null
                   else false
                 end
            )
         )
         and exists (
           select 1
             from pg_constraint fk
             join pg_attribute source_column
               on source_column.attrelid = fk.conrelid
              and source_column.attnum = any (fk.conkey)
             join pg_attribute target_column
               on target_column.attrelid = fk.confrelid
              and target_column.attnum = any (fk.confkey)
            where fk.conrelid = to_regclass('public.media_assets')
              and fk.contype = 'f'
              and source_column.attname = 'conversation_id'
              and array_length(fk.conkey, 1) = 1
              and array_length(fk.confkey, 1) = 1
              and fk.confrelid = to_regclass('public.web_conversations')
              and target_column.attname = 'id'
              and fk.confdeltype = 'n'
              and fk.convalidated
         )
         and 1 = (
           select count(*)
             from pg_constraint fk
             join pg_attribute source_column
               on source_column.attrelid = fk.conrelid
              and source_column.attnum = any (fk.conkey)
            where fk.conrelid = to_regclass('public.media_assets')
              and fk.contype = 'f'
              and source_column.attname = 'conversation_id'
              and array_length(fk.conkey, 1) = 1
         ) as ready`,
      [
        JSON.stringify(
          REQUIRED_MEDIA_ASSET_COLUMNS.map(
            ([column_name, udt_name, is_nullable, default_policy]) => ({
              column_name,
              udt_name,
              is_nullable,
              default_policy,
            }),
          ),
        ),
      ],
    );
    return readiness?.ready === true;
  } catch (error) {
    if (isSchemaNotReady(error)) return false;
    throw error;
  }
}

async function insertMediaAssetRow(
  db: MediaAssetQueryClient,
  p: InsertMediaAssetParams,
  organizationId: string | null,
): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    // `conversation_id` is provenance only (migration 0081). Deleting a
    // conversation sets it NULL; it never destroys the asset.
    `insert into public.media_assets
       (user_id, organization_id, kind, mime_type, byte_size, storage_url, storage_pathname,
        prompt, provider, model, width, height, source_surface, metadata,
        conversation_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
     returning id`,
    [
      p.userId,
      organizationId,
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
      p.conversationId ?? null,
    ],
  );
  return rows[0]?.id ?? null;
}

export interface UpsertVideoMediaAssetParams {
  /** Stable id shared with the durable video job and R2 object. */
  id: string;
  userId: string;
  organizationId: string | null;
  mimeType: 'video/mp4' | 'video/webm' | 'video/quicktime';
  storageUrl: string;
  storagePathname: string;
  byteSize: number;
  prompt: string;
  provider: string;
  model: string;
  sourceSurface: 'web' | 'mobile' | 'desktop';
  metadata: Record<string, unknown>;
}

/**
 * Idempotently catalog a completed async video under its job UUID.
 *
 * Unlike the legacy insert helper this is strict: video completion must fail
 * when the catalog schema is unavailable, because a provider URL without an
 * owner-scoped media row is not a deliverable result. A conflicting UUID owned
 * by another tenant returns no row and is treated as an integrity failure.
 */
export async function upsertVideoMediaAsset(p: UpsertVideoMediaAssetParams): Promise<string> {
  const rows = await getNeonDb().query<{ id: string }>(
    `insert into public.media_assets (
       id, user_id, organization_id, kind, mime_type, byte_size, storage_url,
       storage_pathname, prompt, provider, model, source_surface, metadata
     ) values (
       $1, $2, $3, 'video', $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
     )
     on conflict (id) do update
       set mime_type = excluded.mime_type,
           byte_size = excluded.byte_size,
           storage_url = excluded.storage_url,
           storage_pathname = excluded.storage_pathname,
           prompt = excluded.prompt,
           provider = excluded.provider,
           model = excluded.model,
           source_surface = excluded.source_surface,
           metadata = excluded.metadata
       where media_assets.user_id = excluded.user_id
         and media_assets.organization_id is not distinct from excluded.organization_id
         and media_assets.kind = 'video'
         and media_assets.deleted_at is null
     returning id`,
    [
      p.id,
      p.userId,
      p.organizationId,
      p.mimeType,
      p.byteSize,
      p.storageUrl,
      p.storagePathname,
      p.prompt,
      p.provider,
      p.model,
      p.sourceSurface,
      JSON.stringify(p.metadata),
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Durable video asset identity conflicts with another tenant.');
  return id;
}

/** Remove only the stable video row owned by this job's tenant. */
export async function deleteVideoMediaAsset(id: string, userId: string): Promise<boolean> {
  const rows = await getNeonDb().query<{ id: string }>(
    `delete from public.media_assets
      where id = $1 and user_id = $2 and kind = 'video'
        and exists (
          select 1
            from public.video_generation_jobs job
           where job.id = $1
             and job.user_id = $2
             and media_assets.organization_id is not distinct from job.organization_id
        )
      returning id`,
    [id, userId],
  );
  return rows[0]?.id === id;
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
    return await insertMediaAssetRow(db, p, p.organizationId);
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

/**
 * Catalog a generated image batch in one transaction. Object bytes are staged
 * first by the caller; either every row commits and becomes reachable through
 * `/api/files`, or no row does and the caller removes all staged objects.
 */
export async function insertMediaAssetsAtomically(
  assets: readonly InsertMediaAssetParams[],
): Promise<string[] | null> {
  if (assets.length === 0) return [];
  const db = getNeonDb();
  try {
    return await db.transaction(async (tx) => {
      const ids: string[] = [];
      for (const asset of assets) {
        const id = await insertMediaAssetRow(tx, asset, asset.organizationId);
        if (!id) throw new Error('Generated media asset insert returned no identity.');
        ids.push(id);
      }
      return ids;
    });
  } catch (error) {
    if (isSchemaNotReady(error)) {
      logger.warn(
        { userId: assets[0]?.userId, count: assets.length },
        'media_assets not provisioned; generated image batch not recorded',
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
  try {
    const organizationId = await resolveActiveOrganizationId(db, userId);
    const params: unknown[] = [userId, organizationId];
    let kindClause = '';
    if (opts?.kind) {
      params.push(opts.kind);
      kindClause = `and kind = $${params.length}`;
    }
    const rows = await db.query<Record<string, unknown>>(
      `select id, kind, mime_type, byte_size, storage_url, prompt, provider, model, width, height, created_at
         from public.media_assets
        where user_id = $1
          and organization_id is not distinct from $2::uuid
          and deleted_at is null ${kindClause}
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
  try {
    const organizationId = await resolveActiveOrganizationId(db, userId);
    const params: unknown[] = [userId, organizationId];
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
      clauses.push(
        `and metadata->>'origin' in (${UPLOAD_ORIGINS.map((o) => `'${o}'`).join(', ')})`,
      );
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
    const rows = await db.query<Record<string, unknown>>(
      `select id, kind, mime_type, byte_size, prompt, provider, model, source_surface, metadata, created_at, deleted_at
         from public.media_assets
        where user_id = $1
          and organization_id is not distinct from $2::uuid
          ${lifecycleClause} ${clauses.join(' ')}
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

/**
 * Fetch a live asset only when it belongs to the authenticated user and their
 * currently active workspace. A miss deliberately combines unknown, foreign,
 * and other-workspace ids so byte-serving routes never leak row existence.
 */
export async function getActiveWorkspaceMediaAssetById(
  userId: string,
  id: string,
): Promise<MediaAssetForServing | null> {
  const db = getNeonDb();
  try {
    const organizationId = await resolveActiveOrganizationId(db, userId);
    const rows = await db.query<Record<string, unknown>>(
      `select id, user_id, kind, mime_type, byte_size, storage_url, storage_pathname,
              metadata, deleted_at
         from public.media_assets
        where id = $1
          and user_id = $2
          and organization_id is not distinct from $3::uuid
          and deleted_at is null
        limit 1`,
      [id, userId, organizationId],
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
      deletedAt: null,
    };
  } catch (error) {
    if (isSchemaNotReady(error)) return null;
    throw error;
  }
}

/** Idempotency lookup for the direct-upload completion transaction. */
export async function getMediaAssetByStoragePathname(
  userId: string,
  storagePathname: string,
  organizationId: string | null,
): Promise<MediaAssetForServing | null> {
  const db = getNeonDb();
  try {
    const rows = await db.query<Record<string, unknown>>(
      `select id, user_id, kind, mime_type, byte_size, storage_url, storage_pathname,
              metadata, deleted_at
         from public.media_assets
        where user_id = $1
          and organization_id is not distinct from $3::uuid
          and storage_pathname = $2
          and deleted_at is null
        limit 1`,
      [userId, storagePathname, organizationId],
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
      deletedAt: null,
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
    const organizationId = await resolveActiveOrganizationId(db, userId);
    const rows = await db.query<{ id: string }>(
      `update public.media_assets
         set deleted_at = now()
       where id = $1 and user_id = $2
         and organization_id is not distinct from $3::uuid
         and deleted_at is null
       returning id`,
      [id, userId, organizationId],
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
    const organizationId = await resolveActiveOrganizationId(db, userId);
    const rows = await db.query<{ id: string }>(
      `update public.media_assets
         set deleted_at = null
       where id = $1 and user_id = $2
         and organization_id is not distinct from $3::uuid
         and deleted_at is not null
         and deleted_at > now() - interval '30 days'
       returning id`,
      [id, userId, organizationId],
    );
    return rows.length > 0;
  } catch (error) {
    if (isSchemaNotReady(error)) return false;
    throw error;
  }
}

/**
 * Permanently delete a soft-deleted asset and its stored bytes.
 *
 * The owner-scoped row is locked while object storage is deleted so Restore
 * cannot race an erasure. The database pointer is removed only after storage
 * succeeds; failures therefore remain retryable instead of orphaning bytes.
 */
export async function permanentlyDeleteMediaAsset(userId: string, id: string): Promise<boolean> {
  const db = getNeonDb();
  try {
    return await db.transaction(async (tx) => {
      const organizationId = await resolveActiveOrganizationId(tx, userId);
      const [asset] = await tx.query<{ storage_pathname: string | null }>(
        `select storage_pathname
           from public.media_assets
          where id = $1 and user_id = $2
            and organization_id is not distinct from $3::uuid
            and deleted_at is not null
          for update`,
        [id, userId, organizationId],
      );
      if (!asset) return false;

      if (asset.storage_pathname) {
        await deleteStoredMedia(asset.storage_pathname);
      }

      const deleted = await tx.query<{ id: string }>(
        `delete from public.media_assets
          where id = $1 and user_id = $2
            and organization_id is not distinct from $3::uuid
            and deleted_at is not null
          returning id`,
        [id, userId, organizationId],
      );
      if (deleted.length !== 1) {
        throw new Error('The media asset changed while permanent deletion was in progress.');
      }
      return true;
    });
  } catch (error) {
    if (isSchemaNotReady(error)) return false;
    throw error;
  }
}
