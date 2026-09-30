import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  GitHubInstallCompleteRequestSchema,
  type GitHubInstallCompleteResponse,
  type GitHubInstallCompleteStatus,
} from '@agiworkforce/cloud-contracts';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { exchangeGitHubOAuthCode, findGitHubInstallationForUser } from '@/lib/github-app';
import { consumeAppInstall, linkVerifiedGitHubInstallation } from '@/lib/github-install-app-return';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';

function respond(status: GitHubInstallCompleteStatus): NextResponse {
  return NextResponse.json({ status } satisfies GitHubInstallCompleteResponse, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const parsed = GitHubInstallCompleteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation('Invalid GitHub install response', parsed.error.flatten());
  }
  const { state, code, error } = parsed.data;

  const consumed = await consumeAppInstall(userId, state);
  if (consumed === null) {
    logger.warn('[github-install] app completion rejected: no open app install for this state');
    return respond('invalid_state');
  }
  const { installationId, codeVerifier } = consumed;
  if (error) return respond('denied');
  if (!code) return respond('failed');

  try {
    const callbackUrl = new URL('/api/github/oauth/callback', request.url).toString();
    const userAccessToken = await exchangeGitHubOAuthCode(code, callbackUrl, codeVerifier);
    const verified = await findGitHubInstallationForUser(userAccessToken, installationId);
    if (!verified) {
      logger.warn(
        { userId, installationId },
        'GitHub installation ownership verification failed for an app install',
      );
      return respond('ownership_failed');
    }
    const linked = await linkVerifiedGitHubInstallation(userId, verified);
    if (!linked) return respond('already_linked');
    await recordAuditEvent({
      userId,
      eventType: 'connector_added',
      request,
      outcome: 'success',
      detail: {
        resourceType: 'github_installation',
        resourceId: String(verified.installationId),
        resourceName: verified.accountLogin,
        source: 'github',
        status: 'connected',
      },
    });
    return respond('connected');
  } catch (caught) {
    logger.error({ error: caught, userId, installationId }, 'GitHub app install completion failed');
    return respond('failed');
  }
}

export const POST = withErrorHandler(handlePost);
