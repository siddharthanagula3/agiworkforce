import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_DATA_PREVIEW_CHARS,
  type ManagedCloudPublishedArtifactDataEntry,
  type ManagedCloudPublishedArtifactDataResponse,
} from '@agiworkforce/cloud-contracts';
import { PUBLISHED_TOKEN_REGEX } from '@/lib/services/published-artifact-service';

/**
 * The publisher's view of what their page keeps in `published_artifact_storage`
 * (0325). Every statement runs on the caller's RLS-scoped adapter and starts
 * from a row the caller owns, so a visitor who knows the token finds nothing.
 * The 0325 policies only ever show the caller shared rows and their own
 * personal rows, which is why other visitors' data is neither listed nor
 * counted here.
 */

const SITE_DATA_LIST_LIMIT = 1_000;

const RUNNABLE_KINDS: ReadonlySet<string> = new Set(['html', 'react']);

interface OwnedSiteRow {
  id: string;
  kind: string;
}

async function readOwnedSite(
  db: DatabaseAdapter,
  userId: string,
  token: string,
): Promise<OwnedSiteRow | null> {
  if (!userId || !PUBLISHED_TOKEN_REGEX.test(token)) return null;
  const [row] = await db.query<OwnedSiteRow>(
    `select id, kind
       from public.published_artifacts
      where token = $1 and user_id = $2
      limit 1`,
    [token, userId],
  );
  return row ?? null;
}

function count(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

interface SharedEntryRow {
  storage_key: string;
  value_bytes: number | string;
  preview: string;
  value_chars: number | string;
  updated_at: string | Date;
}

interface StorageTotalsRow {
  shared_count: number | string | null;
  shared_bytes: number | string | null;
  own_personal_count: number | string | null;
}

export async function readOwnedSiteData(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<ManagedCloudPublishedArtifactDataResponse | null> {
  const userId = input.userId.trim();
  const site = await readOwnedSite(db, userId, input.token.trim());
  if (!site) return null;

  const empty: ManagedCloudPublishedArtifactDataResponse = {
    supported: RUNNABLE_KINDS.has(site.kind),
    shared: {
      entries: [],
      entryCount: 0,
      totalBytes: 0,
      limitBytes: ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES,
    },
    ownPersonalEntryCount: 0,
  };
  if (!empty.supported) return empty;

  const [totals] = await db.query<StorageTotalsRow>(
    `select
       count(*) filter (where owner_user_id is null) as shared_count,
       coalesce(sum(value_bytes) filter (where owner_user_id is null), 0) as shared_bytes,
       count(*) filter (where owner_user_id = $2) as own_personal_count
       from public.published_artifact_storage
      where published_artifact_id = $1::uuid
        and (owner_user_id is null or owner_user_id = $2)`,
    [site.id, userId],
  );

  const rows = await db.query<SharedEntryRow>(
    `select storage_key, value_bytes, left(value, $2::integer) as preview,
            char_length(value) as value_chars, updated_at
       from public.published_artifact_storage
      where published_artifact_id = $1::uuid
        and owner_user_id is null
      order by storage_key
      limit $3::integer`,
    [site.id, MANAGED_CLOUD_PUBLISHED_ARTIFACT_DATA_PREVIEW_CHARS, SITE_DATA_LIST_LIMIT],
  );

  const entries: ManagedCloudPublishedArtifactDataEntry[] = rows.map((row) => ({
    key: row.storage_key,
    bytes: count(row.value_bytes),
    preview: row.preview,
    truncated: count(row.value_chars) > MANAGED_CLOUD_PUBLISHED_ARTIFACT_DATA_PREVIEW_CHARS,
    updatedAt: toIso(row.updated_at),
  }));

  return {
    ...empty,
    shared: {
      entries,
      entryCount: count(totals?.shared_count),
      totalBytes: count(totals?.shared_bytes),
      limitBytes: ARTIFACT_STORAGE_SCOPE_LIMIT_BYTES,
    },
    ownPersonalEntryCount: count(totals?.own_personal_count),
  };
}

export async function clearOwnedSiteSharedData(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<number | null> {
  const userId = input.userId.trim();
  const site = await readOwnedSite(db, userId, input.token.trim());
  if (!site) return null;
  if (!RUNNABLE_KINDS.has(site.kind)) return 0;

  const rows = await db.query<{ storage_key: string }>(
    `delete from public.published_artifact_storage
      where published_artifact_id = $1::uuid
        and owner_user_id is null
      returning storage_key`,
    [site.id],
  );
  return rows.length;
}
