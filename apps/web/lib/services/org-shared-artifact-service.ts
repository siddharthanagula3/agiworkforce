import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS } from '@agiworkforce/cloud-contracts';
import { AppError, createError } from '@/lib/errors';
import {
  getWorkspaceArtifactSharingErrorMessage,
  organizationCanShareArtifacts,
} from '@/lib/services/org-entitlements';
import {
  requireOrganizationPermission,
  SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
} from '@/lib/services/organization-permission-service';
import { assertOrganizationSharedViewerAdmission } from '@/lib/services/organization-shared-viewer-admission';
import {
  PUBLISHED_TOKEN_REGEX,
  rowToPublishedArtifact,
  type PublishedArtifactRow,
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

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function toVisibility(value: string): PublishedArtifactVisibility {
  return value === 'organization' || value === 'invited' ? value : 'public';
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

// RLS decides owner, workspace and named-viewer access. Adding an owner filter
// would hide permitted shared rows; 0395 excludes invited rows from workspace grants.
export async function getOrgReadableArtifactByToken(
  db: DatabaseAdapter,
  token: string,
  viewerUserId: string,
): Promise<PublishedArtifact | null> {
  if (!token || !PUBLISHED_TOKEN_REGEX.test(token)) return null;
  const rows = await db.query<PublishedArtifactRow>(
    `select id, token, user_id, artifact_id, conversation_id, title, kind,
            language, content, visibility, created_at, updated_at
       from public.published_artifacts
      where token = $1
      limit 1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  const artifact = rowToPublishedArtifact(row);
  await assertOrganizationSharedViewerAdmission(db, viewerUserId, {
    type: 'artifact',
    id: artifact.id,
    ownerUserId: artifact.userId,
    visibility: artifact.visibility,
  });
  return artifact;
}

interface ArtifactOrganizationGrant {
  organization_id: string;
  published_artifact_id: string;
}

export interface PublishedArtifactAudienceAuthorization {
  db: DatabaseAdapter;
  publication: PublishedArtifact;
  sharedOrganizationId: string | null;
}

export interface UpdatePublishedArtifactAudienceInput {
  userId: string;
  token: string;
  visibility: PublishedArtifactVisibility;
  organizationId: string | null;
  title?: string;
  authorize: (context: PublishedArtifactAudienceAuthorization) => Promise<void>;
}

export async function updatePublishedArtifactAudience(
  db: DatabaseAdapter,
  input: UpdatePublishedArtifactAudienceInput,
): Promise<{ updated: PublishedArtifact; organizationId: string | null }> {
  return db.transaction(async (tx) => {
    const publications = await tx.query<PublishedArtifactRow>(
      `select id, token, user_id, artifact_id, conversation_id, title, kind,
              language, content, visibility, created_at, updated_at
         from public.published_artifacts
        where token = $1 and user_id = $2
        for update`,
      [input.token, input.userId],
    );
    const publication = publications[0];
    if (
      publications.length !== 1 ||
      !publication ||
      publication.token !== input.token ||
      publication.user_id !== input.userId
    ) {
      throw createError.notFound('Published artifact not found');
    }

    const title = input.title?.trim().slice(0, MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS);
    if (title === '') {
      throw createError.notFound('Published artifact not found');
    }

    const readGrants = () =>
      tx.query<ArtifactOrganizationGrant>(
        `select organization_id, published_artifact_id
           from public.organization_shared_artifacts
          where published_artifact_id = $1`,
        [publication.id],
      );
    const grants = await readGrants();
    if (
      grants.length > 1 ||
      grants.some((grant) => grant.published_artifact_id !== publication.id)
    ) {
      throw createError.conflict('Published artifact audience could not be verified');
    }
    const grant = grants[0];
    const organizationId = input.visibility === 'organization' ? input.organizationId : null;
    if (input.visibility === 'organization') {
      if (!organizationId) {
        throw createError.forbidden('Select a workspace to share this artifact.');
      }
      if (!(await organizationCanShareArtifacts(organizationId))) {
        throw new AppError('SUBSCRIPTION_REQUIRED', getWorkspaceArtifactSharingErrorMessage(), 403);
      }
      await requireOrganizationPermission(
        input.userId,
        organizationId,
        'content.share',
        SHARE_INTO_WORKSPACE_DENIED_MESSAGE,
      );
    }
    await input.authorize({
      db: tx,
      publication: rowToPublishedArtifact(publication),
      sharedOrganizationId: grant?.organization_id ?? null,
    });

    if (grant && grant.organization_id !== organizationId) {
      const removed = await tx.query<ArtifactOrganizationGrant>(
        `delete from public.organization_shared_artifacts
          where published_artifact_id = $1 and organization_id = $2
          returning organization_id, published_artifact_id`,
        [publication.id, grant.organization_id],
      );
      if (
        removed.length !== 1 ||
        removed[0]?.published_artifact_id !== publication.id ||
        removed[0]?.organization_id !== grant.organization_id
      ) {
        throw createError.conflict('Published artifact workspace access could not be removed');
      }
    }
    if (organizationId && grant?.organization_id !== organizationId) {
      const inserted = await tx.query<ArtifactOrganizationGrant>(
        `insert into public.organization_shared_artifacts
           (organization_id, published_artifact_id, shared_by_user_id)
         values ($1, $2, $3)
         returning organization_id, published_artifact_id`,
        [organizationId, publication.id, input.userId],
      );
      if (
        inserted.length !== 1 ||
        inserted[0]?.published_artifact_id !== publication.id ||
        inserted[0]?.organization_id !== organizationId
      ) {
        throw createError.conflict('Published artifact workspace access could not be granted');
      }
    }

    const updatedRows = await tx.query<PublishedArtifactRow>(
      `update public.published_artifacts
          set visibility = $4, title = coalesce($5::text, title), updated_at = now()
        where id = $1 and token = $2 and user_id = $3
        returning id, token, user_id, artifact_id, conversation_id, title, kind,
                  language, content, visibility, created_at, updated_at`,
      [publication.id, input.token, input.userId, input.visibility, title ?? null],
    );
    const updated = updatedRows[0];
    if (
      updatedRows.length !== 1 ||
      !updated ||
      updated.id !== publication.id ||
      updated.token !== input.token ||
      updated.user_id !== input.userId ||
      updated.visibility !== input.visibility ||
      updated.title !== (title ?? publication.title)
    ) {
      throw createError.conflict('Published artifact audience update could not be verified');
    }
    const finalGrants = await readGrants();
    if (
      organizationId
        ? finalGrants.length !== 1 ||
          finalGrants[0]?.organization_id !== organizationId ||
          finalGrants[0]?.published_artifact_id !== publication.id
        : finalGrants.length !== 0
    ) {
      throw createError.conflict('Published artifact audience could not be verified');
    }
    return { updated: rowToPublishedArtifact(updated), organizationId };
  });
}
