import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { isGitHubAppConfigured, isGitHubInstallationLinkingAvailable } from '@/lib/github-app';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  LocalPullRequestError,
  openLocalPullRequest,
  readLocalPullRequest,
} from '@/lib/services/cloud-code-local-pull-request';

export const runtime = 'nodejs';

const GITHUB_SCOPE = { resolveOrganization: false } as const;

function assertGitHubConnectable(): void {
  if (!isGitHubInstallationLinkingAvailable() || !isGitHubAppConfigured()) {
    throw createError.capabilityUnavailable(
      'This deployment cannot open pull requests through the AGI GitHub App.',
    );
  }
}

function rethrow(error: unknown): never {
  if (error instanceof LocalPullRequestError) throw createError.validation(error.message);
  throw error;
}

async function handleRead(request: NextRequest) {
  const limited = await withRateLimit(request, 'default');
  if (limited) return limited;
  const { userId } = await getUserScopedDb(request, GITHUB_SCOPE);
  assertGitHubConnectable();
  const params = request.nextUrl.searchParams;
  try {
    return NextResponse.json(
      await readLocalPullRequest(
        userId,
        params.get('remoteUrl'),
        params.get('head'),
        params.get('base'),
      ),
    );
  } catch (error) {
    rethrow(error);
  }
}

async function handleOpen(request: NextRequest) {
  const { userId } = await getUserScopedDb(request, GITHUB_SCOPE);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  assertGitHubConnectable();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw createError.validation('Request body must be an object');
  }
  const record = body as Record<string, unknown>;
  try {
    return NextResponse.json(
      await openLocalPullRequest(userId, {
        remoteUrl: record['remoteUrl'],
        head: record['head'],
        base: record['base'],
        title: record['title'],
      }),
    );
  } catch (error) {
    rethrow(error);
  }
}

export const GET = withErrorHandler(handleRead);
export const POST = withErrorHandler(handleOpen);
