import 'server-only';

import type { ManagedCloudPublishedArtifactViewer } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { buildPage, keysetSql, type KeysetCursor, type Page } from '@/lib/identity/pagination';
import {
  PUBLISHED_TOKEN_REGEX,
  rowToPublishedArtifact,
  type PublishedArtifact,
  type PublishedArtifactRow,
} from './published-artifact-service';

export const MAX_VIEWERS_PER_SITE = 100;

export type PublishedSiteViewer = ManagedCloudPublishedArtifactViewer;

export class ViewerLimitError extends Error {
  constructor() {
    super(`A site can be shared with at most ${MAX_VIEWERS_PER_SITE} people.`);
    this.name = 'ViewerLimitError';
  }
}

export async function ownedPublicationId(
  db: DatabaseAdapter,
  userId: string,
  token: string,
): Promise<string | null> {
  if (!PUBLISHED_TOKEN_REGEX.test(token)) return null;
  const [row] = await db.query<{ id: string }>(
    `select id from public.published_artifacts where token = $1 and user_id = $2 limit 1`,
    [token, userId],
  );
  return row?.id ?? null;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function listSiteViewers(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<PublishedSiteViewer[] | null> {
  const id = await ownedPublicationId(db, input.userId, input.token);
  if (!id) return null;
  const rows = await db.query<{ email: string; created_at: string | Date }>(
    `select email, created_at
       from public.published_artifact_viewers
      where published_artifact_id = $1 and invited_by_user_id = $2
      order by created_at asc`,
    [id, input.userId],
  );
  return rows.map((row) => ({ email: row.email, invitedAt: iso(row.created_at) }));
}

export async function addSiteViewer(
  db: DatabaseAdapter,
  input: { userId: string; token: string; email: string },
): Promise<PublishedSiteViewer[] | null> {
  return db.transaction(async (tx) => {
    if (!PUBLISHED_TOKEN_REGEX.test(input.token)) return null;
    const publications = await tx.query<{ id: string }>(
      `select id from public.published_artifacts where token = $1 and user_id = $2 limit 1`,
      [input.token, input.userId],
    );
    if (!Array.isArray(publications) || publications.length > 1) {
      throw new Error('Site viewer admission identity is invalid');
    }
    if (publications.length === 0) return null;
    const id = publications[0]?.id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Site viewer admission identity is invalid');
    }
    const isolation = await tx.query<{ isolation: string }>(
      `select current_setting('transaction_isolation') as isolation`,
    );
    if (
      !Array.isArray(isolation) ||
      isolation.length !== 1 ||
      isolation[0]?.isolation !== 'read committed'
    ) {
      throw new Error('Site viewer admission requires read committed isolation');
    }
    const locks = await tx.query<{ locked: boolean }>(
      `select pg_advisory_xact_lock(hashtextextended('agi:published-site-viewer-quota:' || $1, 0)),
              true as locked`,
      [id],
    );
    if (!Array.isArray(locks) || locks.length !== 1 || locks[0]?.locked !== true) {
      throw new Error('Site viewer admission lock was not acquired');
    }
    // Separate statements refresh the READ COMMITTED snapshot after waiting for the publication lock.
    const existing = await tx.query<{ email: string }>(
      `select email from public.published_artifact_viewers
        where published_artifact_id = $1 and email = $2 and invited_by_user_id = $3`,
      [id, input.email, input.userId],
    );
    if (
      !Array.isArray(existing) ||
      existing.length > 1 ||
      (existing.length === 1 && existing[0]?.email !== input.email)
    ) {
      throw new Error('Site viewer admission existing identity is invalid');
    }
    if (existing.length === 0) {
      const counts = await tx.query<{ total: number | string }>(
        `select count(*) as total from public.published_artifact_viewers where published_artifact_id = $1 and invited_by_user_id = $2`,
        [id, input.userId],
      );
      if (!Array.isArray(counts) || counts.length !== 1 || !counts[0]) {
        throw new Error('Site viewer admission count is missing');
      }
      const value = counts[0].total;
      if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
        throw new Error('Site viewer admission count is invalid');
      }
      const total = Number(value);
      if (!Number.isSafeInteger(total) || total < 0) {
        throw new Error('Site viewer admission count is invalid');
      }
      if (total >= MAX_VIEWERS_PER_SITE) throw new ViewerLimitError();
      await tx.query(
        `insert into public.published_artifact_viewers (published_artifact_id, email, invited_by_user_id)
         values ($1, $2, $3)
         on conflict (published_artifact_id, email) do nothing`,
        [id, input.email, input.userId],
      );
    }
    return listSiteViewers(tx, input);
  });
}

export async function removeSiteViewer(
  db: DatabaseAdapter,
  input: { userId: string; token: string; email: string },
): Promise<PublishedSiteViewer[] | null> {
  const id = await ownedPublicationId(db, input.userId, input.token);
  if (!id) return null;
  await db.query(
    `delete from public.published_artifact_viewers
      where published_artifact_id = $1 and email = $2 and invited_by_user_id = $3`,
    [id, input.email, input.userId],
  );
  return listSiteViewers(db, input);
}

export async function getInvitedReadableArtifactByToken(
  db: DatabaseAdapter,
  token: string,
): Promise<PublishedArtifact | null> {
  if (!PUBLISHED_TOKEN_REGEX.test(token)) return null;
  const [row] = await db.query<PublishedArtifactRow>(
    `select id, token, user_id, artifact_id, conversation_id, title, kind, language, content,
            visibility, created_at, updated_at
       from public.published_artifacts
      where token = $1 and visibility = 'invited'
      limit 1`,
    [token],
  );
  return row ? rowToPublishedArtifact(row) : null;
}

export interface ArtifactSharedWithViewer {
  token: string;
  title: string;
  kind: string;
  updatedAt: string;
}

interface SharedWithViewerRow {
  id: string;
  token: string;
  title: string;
  kind: string;
  updated_at: string | Date;
  page_sort_key: string;
}

const SHARED_SORT_COLUMN = 'page_sort_key';
const SHARED_SORT_KEY_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;
const SHARED_SORT_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSharedWithViewerCursor(cursor: KeysetCursor): boolean {
  return SHARED_SORT_KEY_PATTERN.test(cursor.sortValue) && UUID_PATTERN.test(cursor.id);
}

export async function listArtifactsSharedWithViewer(
  db: DatabaseAdapter,
  input: { userId: string; verifiedEmail: string; limit: number; cursor: KeysetCursor | null },
): Promise<Page<ArtifactSharedWithViewer>> {
  const params: unknown[] = [
    input.verifiedEmail.trim().toLowerCase(),
    input.userId,
    input.limit + 1,
  ];
  const keyset = keysetSql({
    sortColumn: SHARED_SORT_COLUMN,
    idColumn: 'id',
    cursor: input.cursor,
    firstParamIndex: params.length + 1,
  });
  params.push(...keyset.params);
  const rows = await db.query<SharedWithViewerRow>(
    `select id, token, title, kind, updated_at, ${SHARED_SORT_COLUMN} from (
       select artifact.id, artifact.token, artifact.title, artifact.kind, artifact.updated_at,
              to_char(artifact.updated_at at time zone 'utc', ${SHARED_SORT_KEY_FORMAT})
                as ${SHARED_SORT_COLUMN}
         from public.published_artifact_viewers viewer
         join public.published_artifacts artifact
           on artifact.id = viewer.published_artifact_id
        where viewer.email = $1
          and artifact.visibility = 'invited'
          and artifact.user_id <> $2
     ) shared
     ${keyset.where ? `where ${keyset.where}` : ''}
     ${keyset.orderBy}
     limit $3`,
    params,
  );
  const page = buildPage(rows, input.limit, (row) => ({
    sortValue: row.page_sort_key,
    id: row.id,
  }));
  return {
    items: page.items.map((row) => ({
      token: row.token,
      title: row.title,
      kind: row.kind,
      updatedAt: iso(row.updated_at),
    })),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
}
