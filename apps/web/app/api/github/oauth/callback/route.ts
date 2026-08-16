import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getClerkAuthUser } from '@/lib/api-auth';
import {
  exchangeGitHubOAuthCode,
  findGitHubInstallationForUser,
  isGitHubInstallationLinkingAvailable,
} from '@/lib/github-app';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';

const OAUTH_COOKIE_PATH = '/api/github/oauth/callback';
const GITHUB_STATE_PATTERN = /^[a-f0-9]{64}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
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
    return NextResponse.redirect(new URL('/connectors?github=invalid_state', request.url));
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
    return NextResponse.redirect(
      new URL('/connectors?github=ownership_proof_required', request.url),
    );
  }

  if (oauthError) {
    return NextResponse.redirect(new URL('/connectors?github=oauth_denied', request.url));
  }
  if (!code || code.length > 512) {
    return NextResponse.redirect(new URL('/connectors?github=oauth_failed', request.url));
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
      return NextResponse.redirect(new URL('/connectors?github=ownership_failed', request.url));
    }

    const db = getNeonDb();
    const rows = await db.query<{ id: string }>(
      `insert into github_installations (
         user_id,
         installation_id,
         account_login,
         account_type,
         ownership_verified_at
       )
       values ($1, $2, $3, $4, now())
       on conflict (installation_id)
       do update set
         user_id = excluded.user_id,
         account_login = excluded.account_login,
         account_type = excluded.account_type,
         ownership_verified_at = now(),
         access_token_enc = null,
         access_token_expires_at = null
       where github_installations.ownership_verified_at is null
          or github_installations.user_id = excluded.user_id
       returning id`,
      [
        userId,
        verifiedInstallation.installationId,
        verifiedInstallation.accountLogin,
        verifiedInstallation.accountType,
      ],
    );

    if (rows.length === 0) {
      return NextResponse.redirect(new URL('/connectors?github=already_linked', request.url));
    }
  } catch (error) {
    logger.error(
      { error, userId, installationId: pendingInstallationId },
      'GitHub OAuth ownership verification failed',
    );
    return NextResponse.redirect(new URL('/connectors?github=oauth_failed', request.url));
  }

  return NextResponse.redirect(new URL('/connectors?github=connected', request.url));
}
