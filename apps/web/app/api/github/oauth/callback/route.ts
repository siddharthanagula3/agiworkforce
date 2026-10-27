import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getClerkAuthUser } from '@/lib/api-auth';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import {
  exchangeGitHubOAuthCode,
  findGitHubInstallationForUser,
  isGitHubInstallationLinkingAvailable,
} from '@/lib/github-app';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';
import {
  GITHUB_CONNECT_RETURN_COOKIE,
  githubConnectReturnLocation,
  githubConnectReturnPath,
} from '@/lib/github-connect-return';
import {
  appInstallOwner,
  appInstallReturnUrl,
  linkVerifiedGitHubInstallation,
} from '@/lib/github-install-app-return';

const OAUTH_COOKIE_PATH = '/api/github/oauth/callback';
const GITHUB_STATE_PATTERN = /^[a-f0-9]{64}$/i;

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const appState = new URL(request.url).searchParams.get('state');
  if (appState && GITHUB_STATE_PATTERN.test(appState) && (await appInstallOwner(appState))) {
    const params = new URL(request.url).searchParams;
    const code = params.get('code');
    return NextResponse.redirect(
      appInstallReturnUrl({
        state: appState,
        code: code && code.length <= 512 ? code : null,
        error: params.get('error') ? 'denied' : null,
      }),
    );
  }

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

  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get('state');
  const code = requestUrl.searchParams.get('code');
  const oauthError = requestUrl.searchParams.get('error');
  const cookieStore = await cookies();
  const storedState = cookieStore.get('github_oauth_state')?.value;
  const pendingInstallationId = Number(cookieStore.get('github_pending_installation_id')?.value);
  const finish = (status: string): NextResponse => {
    const returnPath = githubConnectReturnPath(
      cookieStore.get(GITHUB_CONNECT_RETURN_COOKIE)?.value,
    );
    if (!returnPath) {
      return NextResponse.redirect(new URL(`/connectors?github=${status}`, request.url));
    }
    cookieStore.set({
      name: GITHUB_CONNECT_RETURN_COOKIE,
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });
    return NextResponse.redirect(
      new URL(githubConnectReturnLocation(returnPath, status), request.url),
    );
  };

  if (
    !state ||
    !storedState ||
    !GITHUB_STATE_PATTERN.test(state) ||
    !GITHUB_STATE_PATTERN.test(storedState) ||
    state !== storedState ||
    !Number.isSafeInteger(pendingInstallationId) ||
    pendingInstallationId <= 0
  ) {
    logger.warn(
      {
        hasState: Boolean(state),
        hasStoredState: Boolean(storedState),
        hasPendingInstallation: Number.isSafeInteger(pendingInstallationId),
      },
      'GitHub OAuth callback rejected: invalid state or pending installation',
    );
    return finish('invalid_state');
  }

  for (const name of ['github_oauth_state', 'github_pending_installation_id']) {
    cookieStore.set({
      name,
      value: '',
      maxAge: 0,
      path: OAUTH_COOKIE_PATH,
    });
  }

  if (!isGitHubInstallationLinkingAvailable()) {
    return finish('ownership_proof_required');
  }

  if (oauthError) {
    return finish('oauth_denied');
  }
  if (!code || code.length > 512) {
    return finish('oauth_failed');
  }

  const callbackUrl = new URL('/api/github/oauth/callback', request.url).toString();

  try {
    const userAccessToken = await exchangeGitHubOAuthCode(code, callbackUrl);
    const verifiedInstallation = await findGitHubInstallationForUser(
      userAccessToken,
      pendingInstallationId,
    );
    if (!verifiedInstallation) {
      logger.warn(
        { userId, installationId: pendingInstallationId },
        'GitHub installation ownership verification failed',
      );
      return finish('ownership_failed');
    }

    const linked = await linkVerifiedGitHubInstallation(userId, verifiedInstallation);
    if (!linked) {
      return finish('already_linked');
    }
  } catch (error) {
    logger.error(
      { error, userId, installationId: pendingInstallationId },
      'GitHub OAuth ownership verification failed',
    );
    return finish('oauth_failed');
  }

  return finish('connected');
}

export const GET = withPrivateNoStore(handleGet);
