import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  GitHubAuthorizationRevokedError,
  assertRepositoryIsVerified,
  getInstallationAccessToken,
  listGitHubIssues,
  postIssueComment,
} from '@/lib/github-app';
import { getUserGithubInstallations } from '@/lib/user-connector-tools';
import { buildIssueContextBlock } from '../webhook/pr-diff-prompt';

export const runtime = 'nodejs';

const REPOSITORY_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;
const MAX_ISSUE_COMMENT_LENGTH = 60_000;

interface Repository {
  owner: string;
  repo: string;
  token: string;
}

/**
 * The installation that can reach this repository AND that the signed-in
 * account proved it can reach. An installation grants more than its linking
 * account can see, so the verified set is the authorization, not the id.
 */
async function resolveRepository(userId: string, owner: string, repo: string): Promise<Repository> {
  if (!REPOSITORY_SEGMENT.test(owner) || !REPOSITORY_SEGMENT.test(repo)) {
    throw createError.validation('owner and repo must be GitHub name segments');
  }
  const fullName = `${owner}/${repo}`;
  const installations = await getUserGithubInstallations(userId);
  for (const installation of installations) {
    try {
      assertRepositoryIsVerified(
        installation.installationId,
        installation.verifiedRepositories,
        fullName,
      );
    } catch {
      continue;
    }
    return {
      owner,
      repo,
      token: await getInstallationAccessToken(installation.installationId),
    };
  }
  throw createError.notFound('No connected GitHub installation proved access to that repository');
}

function reauthorizationResponse(error: GitHubAuthorizationRevokedError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'github_reauthorization_required',
        message: error.message,
        ...(error.installUrl ? { installUrl: error.installUrl } : {}),
      },
    },
    { status: 403 },
  );
}

async function handleList(request: NextRequest) {
  const { userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;

  const query = request.nextUrl.searchParams;
  const target = await resolveRepository(userId, query.get('owner') ?? '', query.get('repo') ?? '');
  const stateParam = query.get('state');
  const state = stateParam === 'closed' || stateParam === 'all' ? stateParam : 'open';

  try {
    const issues = await listGitHubIssues(target.token, target.owner, target.repo, {
      state,
      ...(query.get('labels') ? { labels: query.get('labels') as string } : {}),
    });
    return NextResponse.json({
      issues: issues.map((issue) => ({
        ...issue,
        // Issue text is written by anyone with a GitHub account, so what a
        // model may read is the fenced form rather than the raw body.
        agentContext: buildIssueContextBlock(issue),
      })),
    });
  } catch (error) {
    if (error instanceof GitHubAuthorizationRevokedError) return reauthorizationResponse(error);
    throw error;
  }
}

async function handleComment(request: NextRequest) {
  const { userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw createError.validation('Request body must be an object');
  }
  const input = body as Record<string, unknown>;
  const issueNumber = input['issueNumber'];
  const comment = input['body'];
  if (typeof issueNumber !== 'number' || !Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw createError.validation('issueNumber must be a positive integer');
  }
  if (typeof comment !== 'string' || !comment.trim()) {
    throw createError.validation('body is required');
  }
  if (comment.length > MAX_ISSUE_COMMENT_LENGTH) {
    throw createError.validation('body is too long');
  }

  const target = await resolveRepository(
    userId,
    typeof input['owner'] === 'string' ? input['owner'] : '',
    typeof input['repo'] === 'string' ? input['repo'] : '',
  );
  try {
    await postIssueComment(target.token, target.owner, target.repo, issueNumber, comment);
  } catch (error) {
    if (error instanceof GitHubAuthorizationRevokedError) return reauthorizationResponse(error);
    throw error;
  }
  return NextResponse.json({ posted: true });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleComment);
