import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { CLOUD_CODE_PAGE_ROUTE } from '@agiworkforce/types';
import {
  generateGitHubInstallState,
  getGitHubAppInstallUrl,
  getGitHubUserAuthorizationUrl,
  isGitHubInstallationLinkingAvailable,
} from '@/lib/github-app';
import { GITHUB_CONNECT_RETURN_COOKIE, githubConnectReturnPath } from '@/lib/github-connect-return';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { getNeonDb } from '@/lib/server/neon-db';
import { buildWorkspaceCodeGateResponse } from '@/lib/services/organization-policy-code-gate';

interface InstallationLinkRow extends Record<string, unknown> {
  installation_id: string | number;
  verified: boolean;
}

function rememberReturnPath(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  request: NextRequest,
): void {
  const returnPath = githubConnectReturnPath(request.nextUrl.searchParams.get('returnPath'));
  if (!returnPath) return;
  cookieStore.set({
    name: GITHUB_CONNECT_RETURN_COOKIE,
    value: returnPath,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/connectors');
    return NextResponse.redirect(loginUrl);
  }

  const codeGate = await buildWorkspaceCodeGateResponse(
    getNeonDb(),
    userId,
    { act: 'connect_github' },
    request,
  );
  if (codeGate) return codeGate;

  if (!isGitHubInstallationLinkingAvailable()) {
    return NextResponse.redirect(
      new URL('/connectors?github=ownership_proof_required', request.url),
    );
  }

  const installUrl = getGitHubAppInstallUrl();
  if (!installUrl) {
    return NextResponse.redirect(new URL('/connectors?github=unavailable', request.url));
  }

  let links: InstallationLinkRow[] = [];
  try {
    links = await getNeonDb().query<InstallationLinkRow>(
      `select installation_id,
              ownership_verified_at is not null as verified
         from github_installations
        where user_id = $1
        order by created_at asc`,
      [userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'GitHub installation lookup failed before connect');
    return NextResponse.redirect(new URL('/connectors?github=install_failed', request.url));
  }

  const verified = links.filter(
    (row) => row.verified === true && Number.isSafeInteger(Number(row.installation_id)),
  );
  const requestedReturn = githubConnectReturnPath(request.nextUrl.searchParams.get('returnPath'));
  if (verified.length > 0 && requestedReturn === CLOUD_CODE_PAGE_ROUTE) {
    return NextResponse.redirect(new URL(requestedReturn, request.url));
  }

  const pending = links.find(
    (row) => row.verified !== true && Number.isSafeInteger(Number(row.installation_id)),
  );
  const cookieStore = await cookies();
  if (pending) {
    const installationId = Number(pending.installation_id);
    const oauthState = generateGitHubInstallState();
    const callbackUrl = new URL('/api/github/oauth/callback', request.url).toString();
    let authorizationUrl: string;
    try {
      authorizationUrl = getGitHubUserAuthorizationUrl(oauthState, callbackUrl);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to resume GitHub ownership proof');
      return NextResponse.redirect(new URL('/connectors?github=oauth_failed', request.url));
    }
    const pendingCookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 600,
      path: '/api/github/oauth/callback',
    };
    cookieStore.set({
      name: 'github_pending_installation_id',
      value: String(installationId),
      ...pendingCookieOptions,
    });
    cookieStore.set({
      name: 'github_oauth_state',
      value: oauthState,
      ...pendingCookieOptions,
    });
    rememberReturnPath(cookieStore, request);
    return NextResponse.redirect(authorizationUrl);
  }

  const state = generateGitHubInstallState();
  cookieStore.set({
    name: 'github_install_state',
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  rememberReturnPath(cookieStore, request);

  const target = new URL(installUrl);
  target.searchParams.set('state', state);
  return NextResponse.redirect(target);
}

export const GET = withPrivateNoStore(handleGet);
