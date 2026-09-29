import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  GitHubInstallPendingRequestSchema,
  type GitHubInstallPendingResponse,
} from '@agiworkforce/cloud-contracts';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { getGitHubInstallationAccount } from '@/lib/github-app';
import { pendingAppInstallation } from '@/lib/github-install-app-return';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

function respond(body: GitHubInstallPendingResponse): NextResponse {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const parsed = GitHubInstallPendingRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation('Invalid GitHub install request', parsed.error.flatten());
  }

  const installationId = await pendingAppInstallation(userId, parsed.data.state);
  if (installationId === null) return respond({ status: 'invalid_state' });

  try {
    const account = await getGitHubInstallationAccount(installationId);
    if (!account) return respond({ status: 'invalid_state' });
    return respond({ status: 'ready', ...account });
  } catch (error) {
    logger.error({ error, userId, installationId }, 'GitHub installation lookup failed');
    return respond({ status: 'unavailable' });
  }
}

export const POST = withErrorHandler(handlePost);
