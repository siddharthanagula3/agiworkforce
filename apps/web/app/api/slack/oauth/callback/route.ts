import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import {
  exchangeSlackOAuthCode,
  postSlackMessage,
  readSlackUser,
  revokeSlackToken,
} from '@/lib/slack/slack-api';
import {
  SLACK_INSTALL_STATE_COOKIE,
  SLACK_OAUTH_CALLBACK_PATH,
  slackAppCredentials,
  slackAppOrigin,
  slackOAuthRedirectUri,
  slackSettingsUrl,
} from '@/lib/slack/slack-config';
import type { SlackInstallStatus } from '@/lib/slack/slack-contract';
import { saveSlackInstallation } from '@/lib/slack/slack-installations';
import { SlackLinkConflictError, linkSlackAccount } from '@/lib/slack/slack-links';
import { linkedMessage } from '@/lib/slack/slack-messages';
import { slackPlanAllowed } from '@/lib/slack/slack-settings';

const ENDPOINT = SLACK_OAUTH_CALLBACK_PATH;
const STATE_PATTERN = /^[a-f0-9]{64}$/;

function statesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function finish(origin: string, status: SlackInstallStatus): Promise<NextResponse> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SLACK_INSTALL_STATE_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: SLACK_OAUTH_CALLBACK_PATH,
  });
  return NextResponse.redirect(slackSettingsUrl(origin, status));
}

async function handleGet(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'slack-settings');
  if (rateLimitResponse) return rateLimitResponse;

  let scope: UserScopedDb;
  try {
    scope = await getUserScopedDb(request, { resolveOrganization: true });
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', '/chat?settings=slack');
    return NextResponse.redirect(loginUrl);
  }
  const { db: scopedDb, userId, organizationId } = scope;

  const origin = slackAppOrigin();
  const credentials = slackAppCredentials();
  if (!origin || !credentials) {
    return NextResponse.redirect(new URL('/chat', request.url));
  }

  const params = new URL(request.url).searchParams;
  if (params.get('error')) return finish(origin, 'denied');

  const cookieStore = await cookies();
  const stored = cookieStore.get(SLACK_INSTALL_STATE_COOKIE)?.value ?? '';
  const separator = stored.indexOf('.');
  const storedState = separator > 0 ? stored.slice(0, separator) : '';
  const storedUserId = separator > 0 ? stored.slice(separator + 1) : '';
  const state = params.get('state') ?? '';
  const code = params.get('code') ?? '';
  if (
    !STATE_PATTERN.test(state) ||
    !STATE_PATTERN.test(storedState) ||
    !statesMatch(storedState, state) ||
    storedUserId !== userId ||
    !code
  ) {
    logger.warn(
      { hasState: Boolean(state), hasStoredState: Boolean(storedState) },
      'Slack install callback refused: the state does not match this browser',
    );
    return finish(origin, 'invalid_state');
  }

  let access;
  try {
    access = await exchangeSlackOAuthCode({
      credentials,
      code,
      redirectUri: slackOAuthRedirectUri(origin),
    });
  } catch (error) {
    logger.error({ error, userId }, 'Slack install code exchange failed');
    return finish(origin, 'failed');
  }

  if (access.enterpriseInstall || !access.teamId || !access.teamName) {
    await revokeSlackToken(access.botToken).catch((error: unknown) => {
      logger.warn({ error }, 'Slack organization-wide install token could not be revoked');
    });
    return finish(origin, 'workspace_install_only');
  }

  const installation = await saveSlackInstallation(getNeonDb(), {
    teamId: access.teamId,
    teamName: access.teamName,
    enterpriseId: access.enterpriseId,
    appId: access.appId,
    botUserId: access.botUserId,
    scopes: access.scopes,
    botToken: access.botToken,
    installedByUserId: userId,
  });

  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    endpoint: ENDPOINT,
    organizationId,
    detail: {
      resourceType: 'slack_installation',
      resourceId: installation.id,
      resourceName: installation.teamName,
      connectorId: 'slack-app',
      provider: 'slack',
    },
  });

  if (access.authedUserId && (await slackPlanAllowed(scopedDb, userId, organizationId))) {
    const slackUserId = access.authedUserId;
    try {
      const profile = await readSlackUser(access.botToken, slackUserId).catch(() => null);
      const linkId = await linkSlackAccount(scopedDb, {
        userId,
        organizationId,
        installationId: installation.id,
        slackUserId,
        slackUserName: profile?.displayName ?? null,
      });
      await recordAuditEvent({
        userId,
        eventType: 'identity_linked',
        request,
        endpoint: ENDPOINT,
        organizationId,
        detail: {
          resourceType: 'slack_account',
          resourceId: linkId,
          resourceName: installation.teamName,
          provider: 'slack',
          subjectRef: `${installation.teamId}:${slackUserId}`,
        },
      });
      const welcome = linkedMessage(slackSettingsUrl(origin));
      await postSlackMessage(access.botToken, {
        channel: slackUserId,
        text: welcome.text,
        blocks: welcome.blocks,
      }).catch((error: unknown) => {
        logger.warn({ error, teamId: installation.teamId }, 'Slack welcome message was not sent');
      });
    } catch (error) {
      if (error instanceof SlackLinkConflictError) {
        logger.info(
          { teamId: installation.teamId },
          'The installing Slack user is already linked to another account; left as it was',
        );
      } else {
        logger.error(
          { error, teamId: installation.teamId },
          'The installing Slack user was not linked; the app will send them a link when they message it',
        );
      }
    }
  }

  return finish(origin, 'installed');
}

export const GET = withPrivateNoStore(handleGet);
