import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ConnectorOAuthCompleteRequestSchema,
  type ConnectorOAuthCompleteResponse,
} from '@agiworkforce/cloud-contracts';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { appReturnOwner } from '@/lib/connectors/oauth-store';
import { finishConnectorAuthorization } from '@/lib/connectors/finish-authorization';

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const parsed = ConnectorOAuthCompleteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation('Invalid connector sign-in response', parsed.error.flatten());
  }
  const { state, code, iss, error } = parsed.data;

  if ((await appReturnOwner(state)) !== userId) {
    logger.warn('[connector-oauth] app completion rejected: no open app sign-in for this state');
    return NextResponse.json({
      connectorId: '',
      status: 'invalid_state',
    } satisfies ConnectorOAuthCompleteResponse);
  }

  const outcome = await finishConnectorAuthorization({
    request,
    userId,
    state,
    code: code ?? null,
    iss,
    providerError: error ?? null,
  });

  return NextResponse.json({
    connectorId: outcome.connectorId,
    status: outcome.status,
  } satisfies ConnectorOAuthCompleteResponse);
}

export const POST = withErrorHandler(handlePost);
