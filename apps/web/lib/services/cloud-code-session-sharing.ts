import 'server-only';

import { randomBytes } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  CLOUD_CODE_SHARE_TOKEN_PATTERN,
  cloudCodeRepositoryLabel,
  cloudCodeShareVisibilityFor,
  type CloudCodeSession,
  type CloudCodeShareVisibility,
  type CloudCodeSharedSession,
  type CloudCodeSharedVisibility,
} from '@agiworkforce/types';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserGithubInstallations } from '@/lib/user-connector-tools';
import {
  CloudCodeNotFoundError,
  CloudCodeValidationError,
  getCloudCodeSession,
  listCloudCodeAgentTurns,
  listCloudCodeTerminalEntries,
  mapCloudCodeSession,
  validateCloudCodeSessionId,
  type CloudCodeOwner,
} from './cloud-code-session-service';

const SHARE_TOKEN_BYTES = 18;
const SHARE_PERMISSION = 'content.share';

export class CloudCodeSharingForbiddenError extends Error {
  constructor() {
    super('Your role in this workspace does not allow sharing with the team.');
    this.name = 'CloudCodeSharingForbiddenError';
  }
}

export class CloudCodeSharedRepositoryError extends Error {
  constructor(readonly repository: string) {
    super(
      `This session works on ${repository}. Connect a GitHub account that can open ${repository} to view it.`,
    );
    this.name = 'CloudCodeSharedRepositoryError';
  }
}

interface SharedGrantRow extends Record<string, unknown> {
  session_id: string;
  owner_user_id: string;
  organization_id: string | null;
  share_visibility: CloudCodeSharedVisibility;
}

async function mayShareWithTeam(db: DatabaseAdapter, organizationId: string): Promise<boolean> {
  const [row] = await db.query<{ allowed: boolean }>(
    'select public.app_has_org_permission($1, $2) as allowed',
    [organizationId, SHARE_PERMISSION],
  );
  return row?.allowed === true;
}

export async function setCloudCodeSessionSharing(
  db: DatabaseAdapter,
  owner: CloudCodeOwner,
  sessionId: string,
  visibility: CloudCodeShareVisibility,
): Promise<CloudCodeSession> {
  validateCloudCodeSessionId(sessionId);
  await getCloudCodeSession(db, owner, sessionId);
  if (
    visibility !== 'private' &&
    visibility !== cloudCodeShareVisibilityFor(owner.organizationId)
  ) {
    throw new CloudCodeValidationError(
      owner.organizationId === null
        ? 'A personal session is shared by public link.'
        : 'A workspace session is shared with its team.',
    );
  }
  if (
    visibility === 'team' &&
    owner.organizationId !== null &&
    !(await mayShareWithTeam(db, owner.organizationId))
  ) {
    throw new CloudCodeSharingForbiddenError();
  }

  const rows = await db.query<Parameters<typeof mapCloudCodeSession>[0]>(
    `update cloud_code_sessions
        set share_visibility = $4,
            share_token = case when $4 = 'private' then null else coalesce(share_token, $5) end
      where id = $1 and user_id = $2 and organization_id is not distinct from $3
      returning *`,
    [
      sessionId,
      owner.userId,
      owner.organizationId,
      visibility,
      randomBytes(SHARE_TOKEN_BYTES).toString('base64url'),
    ],
  );
  const row = rows[0];
  if (!row) throw new CloudCodeNotFoundError();
  return mapCloudCodeSession(row);
}

async function viewerCanOpenRepository(viewerId: string, repositoryUrl: string): Promise<boolean> {
  const repository = cloudCodeRepositoryLabel(repositoryUrl).toLowerCase();
  const installations = await getUserGithubInstallations(viewerId);
  return installations.some((installation) =>
    (installation.verifiedRepositories ?? []).includes(repository),
  );
}

export async function openSharedCloudCodeSession(
  viewerDb: DatabaseAdapter,
  viewerId: string,
  token: string,
): Promise<CloudCodeSharedSession | null> {
  if (!CLOUD_CODE_SHARE_TOKEN_PATTERN.test(token)) return null;
  const [grant] = await viewerDb.query<SharedGrantRow>(
    `select session_id, owner_user_id, organization_id, share_visibility
       from public.app_shared_cloud_code_session($1)`,
    [token],
  );
  if (!grant) return null;

  const ownerDb = getNeonDb();
  const owner: CloudCodeOwner = {
    userId: grant.owner_user_id,
    organizationId: grant.organization_id,
  };
  const session = await getCloudCodeSession(ownerDb, owner, grant.session_id);
  if (
    grant.share_visibility === 'team' &&
    session.repositoryUrl &&
    viewerId !== grant.owner_user_id &&
    !(await viewerCanOpenRepository(viewerId, session.repositoryUrl))
  ) {
    throw new CloudCodeSharedRepositoryError(cloudCodeRepositoryLabel(session.repositoryUrl));
  }
  const [terminalEntries, turns] = await Promise.all([
    listCloudCodeTerminalEntries(ownerDb, owner, grant.session_id),
    listCloudCodeAgentTurns(ownerDb, owner, grant.session_id),
  ]);
  return {
    visibility: grant.share_visibility,
    title: session.title,
    repositoryUrl: session.repositoryUrl,
    workingBranch: session.workingBranch,
    baseBranch: session.baseBranch,
    pullRequestUrl: session.pullRequestUrl,
    pullRequestNumber: session.pullRequestNumber,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    terminalEntries,
    turns,
  };
}
