import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  generateGitHubInstallState,
  getGitHubUserAuthorizationUrl,
  isGitHubInstallationLinkingAvailable,
} from '@/lib/github-app';

const GITHUB_STATE_PATTERN = /^[a-f0-9]{64}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const installationId = Number(searchParams.get('installation_id'));
  const state = searchParams.get('state');

  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    return NextResponse.redirect(new URL('/connectors?github=install_failed', request.url));
  }

  const cookieStore = await cookies();

  const storedState = cookieStore.get('github_install_state')?.value;
  if (
    !state ||
    !storedState ||
    !GITHUB_STATE_PATTERN.test(state) ||
    !GITHUB_STATE_PATTERN.test(storedState) ||
    state !== storedState
  ) {
    logger.warn(
      { hasState: !!state, hasStoredState: !!storedState },
      'GitHub install callback: state mismatch',
    );
    return NextResponse.redirect(new URL('/connectors?github=invalid_state', request.url));
  }

  try {
    await getClerkAuthUser(request);
  } catch {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/connectors');
    return NextResponse.redirect(loginUrl);
  }

  cookieStore.set({
    name: 'github_install_state',
    value: '',
    maxAge: 0,
    path: '/',
  });

  if (!isGitHubInstallationLinkingAvailable()) {
    logger.warn(
      { installationId },
      'GitHub installation callback rejected: user ownership proof is unavailable',
    );
    return NextResponse.redirect(
      new URL('/connectors?github=ownership_proof_required', request.url),
    );
  }

  const oauthState = generateGitHubInstallState();
  const callbackUrl = new URL('/api/github/oauth/callback', request.url).toString();
  let authorizationUrl: string;
  try {
    authorizationUrl = getGitHubUserAuthorizationUrl(oauthState, callbackUrl);
  } catch (error) {
    logger.error({ error }, 'Failed to start GitHub user authorization');
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

  return NextResponse.redirect(authorizationUrl);
}
