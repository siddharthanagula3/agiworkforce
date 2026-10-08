import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { planIncludesAgiCode } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import {
  GitHubInstallationUnverifiedError,
  assertRepositoryIsVerified,
  getInstallationAccessToken,
  listGitHubRepositoryBranches,
} from '@/lib/github-app';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { getUserGithubInstallations } from '@/lib/user-connector-tools';

export const runtime = 'nodejs';

const GITHUB_SCOPE = { resolveOrganization: false } as const;

const BRANCHES_PER_PAGE = 100;
const BRANCHES_MAX_PAGES = 10;
const BRANCHES_MAX_ITEMS = 1000;
const REPOSITORY_FULL_NAME = /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/;

function parseInstallationId(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get('installationId') ?? '';
  const installationId = Number(raw);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw createError.validation('"installationId" must be a positive integer');
  }
  return installationId;
}

function parseRepository(request: NextRequest): { owner: string; name: string; fullName: string } {
  const fullName = (request.nextUrl.searchParams.get('repository') ?? '').trim();
  const match = REPOSITORY_FULL_NAME.exec(fullName);
  if (!match?.[1] || !match[2]) {
    throw createError.validation('"repository" must be written as owner/name');
  }
  return { owner: match[1], name: match[2], fullName };
}

async function handleList(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'default');
  if (rateLimited) return rateLimited;

  const { db, userId } = await getUserScopedDb(request, GITHUB_SCOPE);
  const installationId = parseInstallationId(request);
  const repository = parseRepository(request);

  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable(
      'Managed Code is not enabled for this deployment, so branches cannot be listed.',
    );
  }
  const planTier = await resolveEntitledPlanTier(db, userId);
  if (!planIncludesAgiCode(planTier)) {
    throw createError.capabilityUnavailable(
      'Your plan does not include managed Code sessions, so branches cannot be listed.',
    );
  }

  const installation = (await getUserGithubInstallations(userId)).find(
    (candidate) => candidate.installationId === installationId,
  );
  if (!installation) {
    throw createError.notFound('That GitHub installation is not connected to this account');
  }
  try {
    assertRepositoryIsVerified(
      installation.installationId,
      installation.verifiedRepositories,
      repository.fullName,
    );
  } catch (error) {
    logger.info({ error, installationId }, 'Branch listing refused an unverified repository');
    throw createError.validation(
      error instanceof GitHubInstallationUnverifiedError
        ? 'This GitHub connection was made before repository access was checked. Reconnect GitHub to list its branches.'
        : 'That repository is not one this GitHub connection proved access to. Choose a repository from the list.',
    );
  }

  try {
    const token = await getInstallationAccessToken(installationId, {
      repositories: [repository.name],
      permissions: { metadata: 'read' },
    });
    const listed = await listGitHubRepositoryBranches(token, repository.owner, repository.name, {
      perPage: BRANCHES_PER_PAGE,
      maxPages: BRANCHES_MAX_PAGES,
      maxItems: BRANCHES_MAX_ITEMS,
    });
    return NextResponse.json(listed);
  } catch (error) {
    logger.warn(
      { err: error, installationId, repository: repository.fullName },
      '[github] branches could not be listed for a repository',
    );
    throw createError.serviceUnavailable('GitHub did not answer with the repository branches');
  }
}

export const GET = withErrorHandler(handleList);
