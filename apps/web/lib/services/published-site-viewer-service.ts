import 'server-only';

import { z } from 'zod';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PUBLISHED_TOKEN_REGEX,
  rowToPublishedArtifact,
  type PublishedArtifact,
  type PublishedArtifactRow,
} from './published-artifact-service';

export const MAX_VIEWERS_PER_SITE = 100;

export const ViewerEmailSchema = z.string().trim().toLowerCase().max(320).email();

export interface PublishedSiteViewer {
  email: string;
  invitedAt: string;
}

export class ViewerLimitError extends Error {
  constructor() {
    super(`A site can be shared with at most ${MAX_VIEWERS_PER_SITE} people.`);
    this.name = 'ViewerLimitError';
  }
}

async function ownedPublicationId(
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
  const id = await ownedPublicationId(db, input.userId, input.token);
  if (!id) return null;
  const [count] = await db.query<{ total: number | string }>(
    `select count(*) as total from public.published_artifact_viewers where published_artifact_id = $1 and invited_by_user_id = $2`,
    [id, input.userId],
  );
  if (Number(count?.total ?? 0) >= MAX_VIEWERS_PER_SITE) throw new ViewerLimitError();
  await db.query(
    `insert into public.published_artifact_viewers (published_artifact_id, email, invited_by_user_id)
     values ($1, $2, $3)
     on conflict (published_artifact_id, email) do nothing`,
    [id, input.email, input.userId],
  );
  return listSiteViewers(db, input);
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
