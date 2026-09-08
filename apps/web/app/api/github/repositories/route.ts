import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { effectivePlanTier, getPlanMaxSandboxes } from '@agiworkforce/types';
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
import { SubscriptionService } from '@/lib/services/subscription-service';

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
}

interface LinkedInstallation {
  installationId: number;
  accountLogin: string;
}

interface RepositoryCatalogue {
  repositories: GitHubInstallationRepository[];
  truncated: boolean;
  unreachable: LinkedInstallation[];
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

async function loadCatalogue(installations: LinkedInstallation[]): Promise<RepositoryCatalogue> {
  const repositories: GitHubInstallationRepository[] = [];
  const unreachable: LinkedInstallation[] = [];
  let truncated = false;

  for (const installation of installations) {
    try {
      const listed = await listInstallationRepositories(installation.installationId, {
        perPage: REPOSITORIES_PER_PAGE,
        maxPages: REPOSITORIES_MAX_PAGES,
        maxItems: REPOSITORIES_MAX_ITEMS,
      });
      repositories.push(...listed.repositories);
      truncated ||= listed.truncated;
    } catch (err) {
      logger.warn(
        { err, installationId: installation.installationId },
        '[github] repositories could not be listed for an installation',
      );
      unreachable.push(installation);
    }
  }

  return { repositories: repositories.sort(byFullName), truncated, unreachable };
}

async function handleList(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'default');
  if (rateLimited) return rateLimited;

  const { db, userId } = await getUserScopedDb(request, GITHUB_SCOPE);
  const search = parseSearch(request);

  if (!e2bProvisioningReady()) {
    throw createError.capabilityUnavailable(CODE_UNAVAILABLE_MESSAGE);
  }
  const subscription = await SubscriptionService.getSubscription(db, userId);
  const planTier = effectivePlanTier(subscription?.plan_tier, subscription?.status);
  if (getPlanMaxSandboxes(planTier) <= 0) {
    throw createError.capabilityUnavailable(PLAN_UNAVAILABLE_MESSAGE);
  }

  if (!isGitHubInstallationLinkingAvailable() || !isGitHubAppConfigured()) {
    return NextResponse.json({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
  }

  const rows = await db.query<InstallationRow>(
    `select installation_id, account_login
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
    }))
    .filter((installation) => Number.isSafeInteger(installation.installationId));

  if (installations.length === 0) {
    return NextResponse.json({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
  }

  const cached = await readCachedCatalogue(userId);
  const catalogue = cached ?? (await loadCatalogue(installations));
  if (!cached) await writeCachedCatalogue(userId, catalogue);

  if (
    catalogue.repositories.length === 0 &&
    catalogue.unreachable.length === installations.length
  ) {
    throw createError.serviceUnavailable('GitHub did not answer with your repositories');
  }

  return NextResponse.json({
    repositories: catalogue.repositories.filter((repository) => matchesSearch(repository, search)),
    installationCount: installations.length,
    truncated: catalogue.truncated,
    unreachable: catalogue.unreachable,
  });
}

export const GET = withErrorHandler(handleList);
