import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM,
  CONNECTOR_OAUTH_RESULT_STATUS_PARAM,
  type ConnectorOAuthCallbackStatus,
} from '@agiworkforce/cloud-contracts';

import { getClerkAuthUser } from '@/lib/api-auth';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { logger } from '@/lib/logger';
import { withPrivateNoStore } from '@/lib/private-cache-policy';
import { withRateLimit } from '@/lib/rate-limit';
import { sanitizeConnectorReturnPath } from '@/lib/connectors/oauth-registry';
import { OAUTH_STATE_RE } from '@/lib/connectors/pkce';
import { appReturnOwner } from '@/lib/connectors/oauth-store';
import { connectorAppReturnUrl } from '@/lib/connectors/app-handoff';
import { finishConnectorAuthorization } from '@/lib/connectors/finish-authorization';

const MAX_APP_CODE_LENGTH = 2048;

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');

  const redirectTo = (
    returnPath: string,
    connectorId: string,
    status: ConnectorOAuthCallbackStatus,
  ): NextResponse => {
    const target = new URL(sanitizeConnectorReturnPath(returnPath), request.url);
    if (connectorId) target.searchParams.set(CONNECTOR_OAUTH_RESULT_CONNECTOR_PARAM, connectorId);
    target.searchParams.set(CONNECTOR_OAUTH_RESULT_STATUS_PARAM, status);
    return NextResponse.redirect(target);
  };

  if (state && OAUTH_STATE_RE.test(state) && (await appReturnOwner(state).catch(() => null))) {
    return NextResponse.redirect(
      connectorAppReturnUrl({
        state,
        ...(code ? { code: code.slice(0, MAX_APP_CODE_LENGTH) } : {}),
        ...(url.searchParams.get('iss') ? { iss: url.searchParams.get('iss') as string } : {}),
        ...(providerError ? { error: providerError.slice(0, 64) } : {}),
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

  if (!state || !OAUTH_STATE_RE.test(state)) {
    logger.warn('[connector-oauth] callback rejected: malformed or missing state');
    return redirectTo('/connectors', '', 'invalid_state');
  }

  const outcome = await finishConnectorAuthorization({
    request,
    userId,
    state,
    code,
    iss: url.searchParams.get('iss') ?? undefined,
    providerError,
  });
  return redirectTo(outcome.returnPath, outcome.connectorId, outcome.status);
}

export const GET = withPrivateNoStore(handleGet);
