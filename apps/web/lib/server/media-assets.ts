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

export interface InsertMediaAssetParams {
  userId: string;
  kind: 'image' | 'video';
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
  opts?: { kind?: 'image' | 'video'; limit?: number },
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
