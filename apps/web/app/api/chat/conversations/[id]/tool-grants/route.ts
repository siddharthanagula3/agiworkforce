import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ListConversationToolGrantsResponse } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import {
  CHAT_COMPLETIONS_TRUST_BOUNDARY,
  listConversationToolGrants,
} from '@/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleList(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId } = await context.params;
  if (!UUID_PATTERN.test(conversationId)) throw createError.validation('Choose a chat');

  const { db, userId, organizationId } = await getUserScopedDb(request);
  const grants = await listConversationToolGrants(db, {
    userId,
    conversationId,
    organizationId,
    trustBoundary: CHAT_COMPLETIONS_TRUST_BOUNDARY,
  });
  return NextResponse.json({ grants } satisfies ListConversationToolGrantsResponse);
}

export const GET = withCorsRoute(withErrorHandler(handleList));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
