import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { resolveOrgMembership } from '@/lib/services/org-sharing-service';
import {
  PUBLISHED_TOKEN_REGEX,
  type PublishedArtifact,
  type PublishedArtifactVisibility,
} from '@/lib/services/published-artifact-service';

export interface SharedArtifactSummary {
  organizationId: string;
  publishedArtifactId: string;
  token: string;
  artifactId: string;
  title: string;
  kind: string;
  visibility: PublishedArtifactVisibility;
  ownerUserId: string;
  sharedByUserId: string;
  createdAt: string;
}

interface SharedArtifactRow {
  organization_id: string;
  published_artifact_id: string;
  token: string;
  artifact_id: string;
  title: string;
  kind: string;
  visibility: string;
  owner_user_id: string;
  shared_by_user_id: string;
  created_at: string | Date;
}

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

export function isArtifactSharingSchemaUnavailable(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== 'object') return false;
    const row = candidate as Record<string, unknown>;
    const code = row['code'];
    if (code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN) return true;
    candidate = row['cause'];
  }
  return false;
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toVisibility(value: string): PublishedArtifactVisibility {
  return value === 'organization' ? 'organization' : 'public';
}

function rowToSummary(row: SharedArtifactRow): SharedArtifactSummary {
  return {
    organizationId: row.organization_id,
    publishedArtifactId: row.published_artifact_id,
    token: row.token,
    artifactId: row.artifact_id,
    title: row.title,
    kind: row.kind,
    visibility: toVisibility(row.visibility),
    ownerUserId: row.owner_user_id,
    sharedByUserId: row.shared_by_user_id,
    createdAt: toIso(row.created_at),
  };
}

const SUMMARY_COLUMNS = `share.organization_id,
            share.published_artifact_id,
            share.shared_by_user_id,
            share.created_at,
            artifact.token,
            artifact.artifact_id,
            artifact.title,
            artifact.kind,
            artifact.visibility,
            artifact.user_id as owner_user_id`;

export async function listSharedArtifacts(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<SharedArtifactSummary[]> {
  try {
    const rows = await db.query<SharedArtifactRow>(
      `select ${SUMMARY_COLUMNS}
         from public.organization_shared_artifacts share
         join public.published_artifacts artifact
           on artifact.id = share.published_artifact_id
        where share.organization_id = $1
        order by share.created_at desc`,
      [organizationId],
    );
    return rows.map(rowToSummary);
  } catch (error) {
    if (isArtifactSharingSchemaUnavailable(error)) return [];
    throw error;
  }
}

export interface ShareArtifactInput {
  organizationId: string;
  publishedArtifactId: string;
  actorUserId: string;
}

export async function shareArtifactWithOrganization(
  db: DatabaseAdapter,
  input: ShareArtifactInput,
): Promise<SharedArtifactSummary> {
  const [row] = await db.query<SharedArtifactRow>(
    `with grant_row as materialized (
       insert into public.organization_shared_artifacts
         (organization_id, published_artifact_id, shared_by_user_id)
       select $1, artifact.id, $3
         from public.published_artifacts artifact
        where artifact.id = $2
       on conflict (organization_id, published_artifact_id) do update
          set shared_by_user_id = excluded.shared_by_user_id,
              updated_at = now()
       returning organization_id, published_artifact_id, shared_by_user_id, created_at
     )
     select ${SUMMARY_COLUMNS}
       from grant_row share
       join public.published_artifacts artifact
         on artifact.id = share.published_artifact_id`,
    [input.organizationId, input.publishedArtifactId, input.actorUserId],
  );

  if (!row) {
    throw createError.notFound('Published artifact not found');
  }
  return rowToSummary(row);
}

export async function unshareArtifactFromOrganization(
  db: DatabaseAdapter,
  organizationId: string,
  publishedArtifactId: string,
): Promise<boolean> {
  const rows = await db.query<{ published_artifact_id: string }>(
    `delete from public.organization_shared_artifacts
      where organization_id = $1
        and published_artifact_id = $2
      returning published_artifact_id`,
    [organizationId, publishedArtifactId],
  );
  return rows.length > 0;
}

interface OrgReadableArtifactRow {
  id: string;
  token: string;
  user_id: string;
  artifact_id: string;
  conversation_id: string | null;
  title: string;
  kind: string;
  language: string | null;
  content: string;
  visibility: string;
  created_at: string | Date;
  updated_at: string | Date;
}

/**
 * The workspace-only read. The adapter is RLS-scoped, so the row comes back
 * only when the caller owns it or holds a grant through
 * `published_artifacts_org_shared_read` (0184). The statement adds no ownership
 * predicate of its own on purpose: repeating one here would hide whether the
 * database is actually enforcing the share.
 */
export async function getOrgReadableArtifactByToken(
  db: DatabaseAdapter,
  token: string,
): Promise<PublishedArtifact | null> {
  if (!token || !PUBLISHED_TOKEN_REGEX.test(token)) return null;
  let rows: OrgReadableArtifactRow[];
  try {
    rows = await db.query<OrgReadableArtifactRow>(
      `select id, token, user_id, artifact_id, conversation_id, title, kind,
              language, content, visibility, created_at, updated_at
         from public.published_artifacts
        where token = $1
        limit 1`,
      [token],
    );
  } catch (error) {
    if (isArtifactSharingSchemaUnavailable(error)) return null;
    throw error;
  }
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    token: row.token,
    userId: row.user_id,
    artifactId: row.artifact_id,
    conversationId: row.conversation_id,
    title: row.title,
    kind: row.kind as PublishedArtifact['kind'],
    language: row.language,
    content: row.content,
    visibility: toVisibility(row.visibility),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export interface ArtifactShareTarget {
  organizationId: string;
  publishedArtifactId: string;
}

/**
 * Resolve the organization an artifact would be shared into: the caller's
 * active organization, and the artifact row they own under that token.
 */
export async function resolveArtifactShareTarget(
  db: DatabaseAdapter,
  input: { userId: string; token: string },
): Promise<ArtifactShareTarget> {
  const membership = await resolveOrgMembership(db, input.userId);
  if (!membership) {
    throw createError.forbidden(
      'You are not a member of a workspace yet, so there is nobody to share this with.',
    );
  }
  const [row] = await db.query<{ id: string }>(
    `select id from public.published_artifacts
      where token = $1 and user_id = $2
      limit 1`,
    [input.token, input.userId],
  );
  if (!row) {
    throw createError.notFound('Published artifact not found');
  }
  return { organizationId: membership.organizationId, publishedArtifactId: row.id };
}
