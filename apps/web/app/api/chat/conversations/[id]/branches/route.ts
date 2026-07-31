import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  ManagedCloudConversationBranchesResponseSchema,
  ManagedCloudCreateConversationBranchRequestSchema,
  ManagedCloudCreateConversationBranchResponseSchema,
} from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withIsoTimestamps } from '@/lib/server/iso-timestamps';
import {
  forkConversation,
  listConversationBranchGroups,
} from '@/lib/services/conversation-branch-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

async function handleGet(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const { id: conversationId } = await context.params;
  const { db, userId } = await getUserScopedDb(request);
  const groups = await listConversationBranchGroups(db, userId, conversationId);

  return NextResponse.json(ManagedCloudConversationBranchesResponseSchema.parse({ groups }));
}

async function handleCreate(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = ManagedCloudCreateConversationBranchRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation('A valid messageId and requestId are required');
  }

  const { id: sourceConversationId } = await context.params;
  const { db, userId } = await getUserScopedDb(request);
  const conversation = await forkConversation(db, userId, {
    sourceConversationId,
    ...parsed.data,
  });
  const normalizedConversation = withIsoTimestamps([conversation])[0];

  return NextResponse.json(
    ManagedCloudCreateConversationBranchResponseSchema.parse({
      conversation: normalizedConversation,
    }),
    { status: 201 },
  );
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handleCreate));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
