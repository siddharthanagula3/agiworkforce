import 'server-only';

import {
  ArtifactCommentAnchorSchema,
  type ArtifactComment,
  type ArtifactCommentAnchor,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export const MAX_COMMENTS_PER_ARTIFACT = 500;

interface CommentRow {
  id: string;
  artifact_id: string;
  parent_id: string | null;
  anchor: unknown;
  body: string;
  author: string;
  resolved_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const COLUMNS =
  'id, artifact_id, parent_id, anchor, body, author, resolved_at, created_at, updated_at';

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toComment(row: CommentRow): ArtifactComment {
  const anchor = ArtifactCommentAnchorSchema.safeParse(
    typeof row.anchor === 'string' ? JSON.parse(row.anchor) : row.anchor,
  );
  return {
    id: row.id,
    artifactId: row.artifact_id,
    parentId: row.parent_id,
    anchor: anchor.success ? anchor.data : { kind: 'artifact' },
    body: row.body,
    author: row.author === 'assistant' ? 'assistant' : 'user',
    resolvedAt: iso(row.resolved_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export class ArtifactCommentLimitError extends Error {
  constructor() {
    super(`An artifact holds at most ${MAX_COMMENTS_PER_ARTIFACT} comments.`);
    this.name = 'ArtifactCommentLimitError';
  }
}

export async function listArtifactComments(
  db: DatabaseAdapter,
  input: { userId: string; artifactId: string },
): Promise<ArtifactComment[]> {
  const rows = await db.query<CommentRow>(
    `select ${COLUMNS}
       from public.artifact_comments
      where user_id = $1 and artifact_id = $2
      order by created_at asc`,
    [input.userId, input.artifactId],
  );
  return rows.map(toComment);
}

export interface CreateArtifactCommentInput {
  userId: string;
  artifactId: string;
  body: string;
  anchor: ArtifactCommentAnchor;
  parentId?: string | null;
  author: 'user' | 'assistant';
}

export async function createArtifactComment(
  db: DatabaseAdapter,
  input: CreateArtifactCommentInput,
): Promise<ArtifactComment | null> {
  return db.transaction((tx) => admitArtifactComment(tx, input));
}

async function admitArtifactComment(
  tx: DatabaseAdapter,
  input: CreateArtifactCommentInput,
): Promise<ArtifactComment | null> {
  const [isolation] = await tx.query<{ isolation: string }>(
    `select current_setting('transaction_isolation') as isolation`,
  );
  if (isolation?.isolation !== 'read committed') {
    throw new Error('Artifact comment admission requires read committed isolation');
  }
  const [lock] = await tx.query<{ locked: boolean }>(
    `select pg_advisory_xact_lock(hashtextextended('agi:artifact-comments:' || $1 || ':' || $2, 0)),
            true as locked`,
    [input.userId, input.artifactId],
  );
  if (lock?.locked !== true) throw new Error('Artifact comment admission lock was not acquired');

  const [count] = await tx.query<{ total: number | string }>(
    `select count(*) as total from public.artifact_comments where user_id = $1 and artifact_id = $2`,
    [input.userId, input.artifactId],
  );
  if (Number(count?.total ?? 0) >= MAX_COMMENTS_PER_ARTIFACT) throw new ArtifactCommentLimitError();

  if (input.parentId) {
    const [parent] = await tx.query<{ id: string; parent_id: string | null }>(
      `select id, parent_id from public.artifact_comments
        where id = $1 and user_id = $2 and artifact_id = $3`,
      [input.parentId, input.userId, input.artifactId],
    );
    if (!parent) return null;
    input = { ...input, parentId: parent.parent_id ?? parent.id };
  }

  const [row] = await tx.query<CommentRow>(
    `insert into public.artifact_comments (user_id, artifact_id, parent_id, anchor, body, author)
     values ($1, $2, $3, $4::jsonb, $5, $6)
     returning ${COLUMNS}`,
    [
      input.userId,
      input.artifactId,
      input.parentId ?? null,
      JSON.stringify(input.parentId ? { kind: 'artifact' } : input.anchor),
      input.body,
      input.author,
    ],
  );
  return row ? toComment(row) : null;
}

export async function updateArtifactComment(
  db: DatabaseAdapter,
  input: { userId: string; commentId: string; body?: string; resolved?: boolean },
): Promise<ArtifactComment | null> {
  const [row] = await db.query<CommentRow>(
    `update public.artifact_comments
        set body = coalesce($3, body),
            resolved_at = case
              when $4::boolean is null then resolved_at
              when $4::boolean then coalesce(resolved_at, now())
              else null
            end,
            updated_at = now()
      where id = $1 and user_id = $2
      returning ${COLUMNS}`,
    [input.commentId, input.userId, input.body ?? null, input.resolved ?? null],
  );
  return row ? toComment(row) : null;
}

export async function deleteArtifactComment(
  db: DatabaseAdapter,
  input: { userId: string; commentId: string },
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.artifact_comments where id = $1 and user_id = $2 returning id`,
    [input.commentId, input.userId],
  );
  return rows.length > 0;
}
