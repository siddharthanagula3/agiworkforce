import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { CLOUD_CODE_GITHUB_CONNECTION_STATUSES } from '@agiworkforce/cloud-contracts';
import { planIncludesAgiCode } from '@agiworkforce/types';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import {
  isGitHubAppConfigured,
  isGitHubInstallationLinkingAvailable,
  listInstallationRepositories,
  type GitHubInstallationRepository,
} from '@/lib/github-app';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';

export const runtime = 'nodejs';

const GITHUB_SCOPE = { resolveOrganization: false } as const;

const REPOSITORIES_PER_PAGE = 100;
const REPOSITORIES_MAX_PAGES = 20;
const REPOSITORIES_MAX_ITEMS = 500;
const MAX_SEARCH_LENGTH = 200;
const CACHE_KEY_PREFIX = 'github:repositories:v1';
const CACHE_TTL_SECONDS = 60;

const CODE_UNAVAILABLE_MESSAGE =
  'Managed Code is not enabled for this deployment, so repositories cannot be listed.';
const PLAN_UNAVAILABLE_MESSAGE =
  'Your plan does not include managed Code sessions, so repositories cannot be listed.';

interface InstallationRow extends Record<string, unknown> {
  installation_id: string | number;
  account_login: string;
  verified_repositories: string[] | null;
}

interface LinkedInstallation {
  installationId: number;
  accountLogin: string;
}

type GitHubConnectionStatus = (typeof CLOUD_CODE_GITHUB_CONNECTION_STATUSES)[number];

type InstallationFailure = 'reauthorize' | 'outage';

interface RepositoryCatalogue {
  repositories: GitHubInstallationRepository[];
  truncated: boolean;
  unreachable: LinkedInstallation[];
  failures: InstallationFailure[];
}

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}:${userId}`;
}

async function readCachedCatalogue(userId: string): Promise<RepositoryCatalogue | null> {
  const store = getKeyValueStore();
  if (!store) return null;
  try {
    return (await store.get<RepositoryCatalogue>(cacheKey(userId))) ?? null;
  } catch (err) {
    logger.warn({ err, userId }, '[github] repository catalogue cache read failed');
    return null;
  }
}

async function writeCachedCatalogue(userId: string, catalogue: RepositoryCatalogue): Promise<void> {
  const store = getKeyValueStore();
  if (!store) return;
  try {
    await store.set(cacheKey(userId), catalogue, { ttlSeconds: CACHE_TTL_SECONDS });
  } catch (err) {
    logger.warn({ err, userId }, '[github] repository catalogue cache write failed');
  }
}

function parseSearch(request: NextRequest): string {
  const raw = request.nextUrl.searchParams.get('search') ?? '';
  const search = raw.trim();
  if (search.length > MAX_SEARCH_LENGTH) {
    throw createError.validation(`"search" must be at most ${MAX_SEARCH_LENGTH} characters`);
  }
  return search.toLowerCase();
}

function matchesSearch(repository: GitHubInstallationRepository, search: string): boolean {
  return search.length === 0 || repository.fullName.toLowerCase().includes(search);
}

function byFullName(first: GitHubInstallationRepository, second: GitHubInstallationRepository) {
  return first.fullName.localeCompare(second.fullName);
}

function installationFailure(err: unknown): InstallationFailure {
  if (
    err instanceof Error &&
    (err.name === 'GitHubInstallationAccessError' ||
      err.name === 'GitHubInstallationUnverifiedError')
  ) {
    return 'reauthorize';
  }
  return 'outage';
}

function repositoryResponse(input: {
  repositories: GitHubInstallationRepository[];
  installationCount: number;
  truncated: boolean;
  unreachable: LinkedInstallation[];
  status: GitHubConnectionStatus;
}) {
  return NextResponse.json({
    repositories: input.repositories,
    installationCount: input.installationCount,
    truncated: input.truncated,
    unreachable: input.unreachable,
    connection: { status: input.status },
  });
}

async function loadCatalogue(
  installations: (LinkedInstallation & { verifiedRepositories: string[] | null })[],
): Promise<RepositoryCatalogue> {
  const repositories: GitHubInstallationRepository[] = [];
  const unreachable: LinkedInstallation[] = [];
  const failures: InstallationFailure[] = [];
  let truncated = false;

  for (const installation of installations) {
    try {
      const listed = await listInstallationRepositories(
        installation.installationId,
        {
          perPage: REPOSITORIES_PER_PAGE,
          maxPages: REPOSITORIES_MAX_PAGES,
          maxItems: REPOSITORIES_MAX_ITEMS,
        },
        installation.verifiedRepositories,
      );
      repositories.push(...listed.repositories);
      truncated ||= listed.truncated;
    } catch (err) {
      logger.warn(
        { err, installationId: installation.installationId },
        '[github] repositories could not be listed for an installation',
      );
      unreachable.push({
        installationId: installation.installationId,
        accountLogin: installation.accountLogin,
      });
      failures.push(installationFailure(err));
    }
  }

  return { repositories: repositories.sort(byFullName), truncated, unreachable, failures };
}

async function handleList(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'default');
  if (rateLimited) return rateLimited;

  const { db, userId } = await getUserScopedDb(request, GITHUB_SCOPE);
  const search = parseSearch(request);

  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable(CODE_UNAVAILABLE_MESSAGE);
  }
  const planTier = await resolveEntitledPlanTier(db, userId);
  if (!planIncludesAgiCode(planTier)) {
    throw createError.capabilityUnavailable(PLAN_UNAVAILABLE_MESSAGE);
  }

  if (!isGitHubAppConfigured()) {
    return repositoryResponse({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
      status: 'unconfigured',
    });
  }

  if (!isGitHubInstallationLinkingAvailable()) {
    const linked = await db.query<InstallationRow>(
      `select installation_id, account_login, verified_repositories
         from github_installations
        where user_id = $1
          and ownership_verified_at is not null
        order by created_at asc`,
      [userId],
    );
    return repositoryResponse({
      repositories: [],
      installationCount: linked.length,
      truncated: false,
      unreachable: [],
      status: 'linking-unavailable',
    });
  }

  const rows = await db.query<InstallationRow>(
    `select installation_id, account_login, verified_repositories
       from github_installations
      where user_id = $1
        and ownership_verified_at is not null
      order by created_at asc`,
    [userId],
  );
  const installations = rows
    .map((row) => ({
      installationId: Number(row.installation_id),
      accountLogin: row.account_login,
      verifiedRepositories: row.verified_repositories,
    }))
    .filter((installation) => Number.isSafeInteger(installation.installationId));

  if (installations.length === 0) {
    const pending = await db.query<{ installation_id: string | number }>(
      `select installation_id
         from github_installations
        where user_id = $1
          and ownership_verified_at is null
        limit 1`,
      [userId],
    );
    return repositoryResponse({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
      status: pending.length > 0 ? 'authorization-pending' : 'unauthorized',
    });
  }

  const cached = await readCachedCatalogue(userId);
  const catalogue = cached
    ? { ...cached, failures: cached.failures ?? [] }
    : await loadCatalogue(installations);
  const everyInstallationFailed =
    catalogue.repositories.length === 0 && catalogue.unreachable.length === installations.length;
  if (!cached && !everyInstallationFailed) await writeCachedCatalogue(userId, catalogue);

  if (everyInstallationFailed) {
    const authorizationFailed =
      catalogue.failures.length > 0 &&
      catalogue.failures.every((failure) => failure === 'reauthorize');
    if (authorizationFailed) {
      return repositoryResponse({
        repositories: [],
        installationCount: installations.length,
        truncated: false,
        unreachable: catalogue.unreachable,
        status: 'reauthorization-required',
      });
    }
    throw createError.serviceUnavailable('GitHub did not answer with your repositories');
  }

  const visible = catalogue.repositories.filter((repository) => matchesSearch(repository, search));
  return repositoryResponse({
    repositories: visible,
    installationCount: installations.length,
    truncated: catalogue.truncated,
    unreachable: catalogue.unreachable,
    status: catalogue.repositories.length === 0 ? 'no-repositories' : 'connected',
  });
}

export const GET = withErrorHandler(handleList);
