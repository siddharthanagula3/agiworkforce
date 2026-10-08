import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { GoogleDrivePickerResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  connectorUnreachableMessage,
  resolveConnectorAccessToken,
} from '@/lib/connectors/oauth-access';
import { createError } from '@/lib/errors';
import { GOOGLE_DRIVE_CONNECTOR_ID } from '@/lib/connectors/google-drive-files';
import { assertConnectorsReleased } from '@/lib/connectors/connector-capability';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';

async function handleGetPicker(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getUserScopedDb(request, { resolveOrganization: false });
  assertConnectorsReleased();
  const developerKey = process.env['GOOGLE_PICKER_API_KEY']?.trim();
  const appId = process.env['GOOGLE_PICKER_APP_ID']?.trim();
  if (!developerKey || !appId) {
    return NextResponse.json({ status: 'not-configured' } satisfies GoogleDrivePickerResponse, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const access = await resolveConnectorAccessToken(userId, GOOGLE_DRIVE_CONNECTOR_ID);
  if (access.status === 'unreachable') {
    throw createError.serviceUnavailable(connectorUnreachableMessage('Google Drive')).asUserSafe();
  }
  if (access.status !== 'ready') {
    return NextResponse.json(
      {
        status:
          access.status === 'reauthorization-required' ? 'reconnect-required' : 'not-connected',
      } satisfies GoogleDrivePickerResponse,
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    {
      status: 'ready',
      accessToken: access.accessToken,
      developerKey,
      appId,
    } satisfies GoogleDrivePickerResponse,
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGetPicker));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
