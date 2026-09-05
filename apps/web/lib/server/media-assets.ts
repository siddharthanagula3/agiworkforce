import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { LIBRARY_DEFAULT_SORT, type LibrarySort } from '@agiworkforce/cloud-contracts';
import { logger } from '@/lib/logger';
import { deleteStoredMedia } from '@/lib/server/media-storage';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

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
  conversationId?: string;
}

type MediaAssetQueryClient = Pick<DatabaseAdapter, 'query'>;

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

export async function isMediaAssetStoreReady(db: MediaAssetQueryClient): Promise<boolean> {
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

export async function upsertVideoMediaAsset(
  p: UpsertVideoMediaAssetParams,
  db: MediaAssetQueryClient,
): Promise<string> {
  const rows = await db.query<{ id: string }>(
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

export async function deleteVideoMediaAsset(
  id: string,
  userId: string,
  db: MediaAssetQueryClient,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
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

export async function insertMediaAsset(
  p: InsertMediaAssetParams,
  db: MediaAssetQueryClient,
): Promise<string | null> {
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

export async function insertMediaAssetsAtomically(
  assets: readonly InsertMediaAssetParams[],
  db: DatabaseAdapter,
): Promise<string[] | null> {
  if (assets.length === 0) return [];
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

export async function listMediaAssets(
  userId: string,
  opts: { kind?: MediaKind; limit?: number } | undefined,
  db: DatabaseAdapter,
): Promise<MediaAsset[]> {
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
  kinds?: readonly MediaKind[];
  sort?: LibrarySort;
  surface?: 'artifact' | 'file';
  origin?: 'generated' | 'uploaded';
  search?: string;
  deleted?: boolean;
  limit?: number;
  offset?: number;
}

const UPLOAD_ORIGINS = ['upload', 'uploaded'] as const;

const DELETED_ORDER_CLAUSE = 'deleted_at desc';

const ORDER_CLAUSE_BY_SORT: Readonly<Record<LibrarySort, string>> = {
  modified: 'created_at desc',
  name: "coalesce(metadata->>'filename', kind) asc",
  size: 'byte_size desc nulls last',
};

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

export async function listLibraryAssets(
  userId: string,
  opts: ListLibraryAssetsOptions = {},
  db: DatabaseAdapter,
): Promise<LibraryAssetRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  try {
    const organizationId = await resolveActiveOrganizationId(db, userId);
    const params: unknown[] = [userId, organizationId];
    const clauses: string[] = [];

    if (opts.kinds && opts.kinds.length > 0) {
      params.push(opts.kinds);
      clauses.push(`and kind = any($${params.length}::text[])`);
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

    const lifecycleClause = opts.deleted
      ? "and deleted_at is not null and deleted_at > now() - interval '30 days'"
      : 'and deleted_at is null';
    const orderClause = opts.deleted
      ? DELETED_ORDER_CLAUSE
      : ORDER_CLAUSE_BY_SORT[opts.sort ?? LIBRARY_DEFAULT_SORT];

    params.push(limit, offset);
    const rows = await db.query<Record<string, unknown>>(
      `select id, kind, mime_type, byte_size, prompt, provider, model, source_surface, metadata, created_at, deleted_at
         from public.media_assets
        where user_id = $1
          and organization_id is not distinct from $2::uuid
          ${lifecycleClause} ${clauses.join(' ')}
        order by ${orderClause}, id desc
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return rows.map(mapLibraryRow);
  } catch (error) {
    if (isSchemaNotReady(error)) return [];
    throw error;
  }
}

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

export async function getMediaAssetById(
  id: string,
  db: MediaAssetQueryClient,
): Promise<MediaAssetForServing | null> {
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

export async function getActiveWorkspaceMediaAssetById(
  userId: string,
  id: string,
  db: DatabaseAdapter,
): Promise<MediaAssetForServing | null> {
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

export async function getMediaAssetByStoragePathname(
  userId: string,
  storagePathname: string,
  organizationId: string | null,
  db: MediaAssetQueryClient,
): Promise<MediaAssetForServing | null> {
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

export async function softDeleteMediaAsset(
  userId: string,
  id: string,
  db: DatabaseAdapter,
): Promise<boolean> {
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

export async function restoreMediaAsset(
  userId: string,
  id: string,
  db: DatabaseAdapter,
): Promise<boolean> {
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

export async function permanentlyDeleteMediaAsset(
  userId: string,
  id: string,
  db: DatabaseAdapter,
): Promise<boolean> {
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
