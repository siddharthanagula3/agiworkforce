import 'server-only';

import { randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { getClerkAuthUser } from '@/lib/api-auth';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';
import {
  SLACK_AUTHORIZE_URL,
  SLACK_BOT_SCOPES,
  SLACK_INSTALL_STATE_COOKIE,
  SLACK_INSTALL_STATE_TTL_SECONDS,
  SLACK_OAUTH_CALLBACK_PATH,
  isSlackAppConfigured,
  slackAppCredentials,
  slackAppOrigin,
  slackOAuthRedirectUri,
  slackSettingsUrl,
} from '@/lib/slack/slack-config';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'slack-settings');
  if (rateLimitResponse) return rateLimitResponse;

  const origin = slackAppOrigin();
  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/chat?settings=slack');
    return NextResponse.redirect(loginUrl);
  }

  const credentials = slackAppCredentials();
  if (!origin || !credentials || !isSlackAppConfigured()) {
    return NextResponse.redirect(
      origin ? slackSettingsUrl(origin, 'unavailable') : new URL('/chat', request.url),
    );
  }

  const state = randomBytes(32).toString('hex');
  const cookieStore = await cookies();
  cookieStore.set({
    name: SLACK_INSTALL_STATE_COOKIE,
    value: `${state}.${userId}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SLACK_INSTALL_STATE_TTL_SECONDS,
    path: SLACK_OAUTH_CALLBACK_PATH,
  });

  const target = new URL(SLACK_AUTHORIZE_URL);
  target.searchParams.set('client_id', credentials.clientId);
  target.searchParams.set('scope', SLACK_BOT_SCOPES.join(','));
  target.searchParams.set('redirect_uri', slackOAuthRedirectUri(origin));
  target.searchParams.set('state', state);
  return NextResponse.redirect(target);
}

export const GET = withPrivateNoStore(handleGet);
