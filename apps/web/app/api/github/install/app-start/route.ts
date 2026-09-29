import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  GITHUB_INSTALL_CONNECT_PAGE_PATH,
  type GitHubInstallAppStartResponse,
} from '@agiworkforce/cloud-contracts';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { getGitHubAppInstallUrl, isGitHubInstallationLinkingAvailable } from '@/lib/github-app';
import { startAppInstall } from '@/lib/github-install-app-return';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { buildWorkspaceCodeGateResponse } from '@/lib/services/organization-policy-code-gate';

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const codeGate = await buildWorkspaceCodeGateResponse(
    getNeonDb(),
    userId,
    { act: 'connect_github' },
    request,
  );
  if (codeGate) return codeGate;

  const installUrl = isGitHubInstallationLinkingAvailable() ? getGitHubAppInstallUrl() : null;
  if (!installUrl) {
    throw createError.serviceUnavailable('GitHub cannot be connected right now.');
  }

  const state = await startAppInstall(userId);
  const target = new URL(GITHUB_INSTALL_CONNECT_PAGE_PATH, request.url);
  target.searchParams.set('state', state);

  return NextResponse.json({ url: target.toString() } satisfies GitHubInstallAppStartResponse, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const POST = withErrorHandler(handlePost);
