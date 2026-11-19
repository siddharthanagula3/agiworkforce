import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { RevokeConversationToolGrantResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { recordAuditEvent } from '@/lib/security-audit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  CHAT_COMPLETIONS_TRUST_BOUNDARY,
  revokeConversationToolGrant,
} from '@/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string; grantId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleRevoke(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId, grantId } = await context.params;
  if (!UUID_PATTERN.test(conversationId) || !UUID_PATTERN.test(grantId)) {
    throw createError.validation('Choose a tool allowed in this chat');
  }

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const revoked = await db.transaction((transaction) =>
    revokeConversationToolGrant(
      transaction,
      {
        userId,
        conversationId,
        organizationId,
        trustBoundary: CHAT_COMPLETIONS_TRUST_BOUNDARY,
      },
      grantId,
    ),
  );
  if (!revoked) throw createError.notFound('This tool is no longer allowed in this chat');

  await recordAuditEvent({
    userId,
    organizationId,
    request,
    eventType: 'connector_setting_changed',
    detail: {
      resourceType: 'connector',
      resourceId: revoked.connectorId,
      connectorId: revoked.connectorId,
      resourceName: revoked.toolName,
      status: 'permission_removed',
      count: 1,
    },
  });

  return NextResponse.json({
    success: true,
    removed: 1,
  } satisfies RevokeConversationToolGrantResponse);
}

export const DELETE = withCorsRoute(withErrorHandler(handleRevoke));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
