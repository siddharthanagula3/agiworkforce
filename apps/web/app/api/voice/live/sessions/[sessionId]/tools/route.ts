import 'server-only';

export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { LiveVoiceToolCallRequestSchema } from '@agiworkforce/cloud-contracts';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { handleLiveVoiceToolCall } from '@/lib/voice/live-voice-tool-runner';
import { isVoiceSessionStoreReady, touchVoiceSession } from '../../lib/voice-session-store';

async function handleVoiceToolCall(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const { userId } = await getClerkAuthUser(request);
  const rateLimitResponse = await withRateLimit(request, 'llm-completion', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  const { sessionId } = await context.params;
  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };

  const parsed = LiveVoiceToolCallRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: 'A tool call needs its call id, name and arguments.',
          type: 'invalid_request_error',
        },
      },
      { status: 400, headers },
    );
  }

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    return NextResponse.json(
      { error: { message: 'Managed usage tenant mismatch.', type: 'invalid_request_error' } },
      { status: 403, headers },
    );
  }
  if (!(await isVoiceSessionStoreReady(scoped.db))) {
    return NextResponse.json(
      { error: { message: 'Voice session records are not available.', type: 'api_error' } },
      { status: 503, headers },
    );
  }
  const session = await touchVoiceSession({ db: scoped.db, userId, providerSessionId: sessionId });
  if (!session) {
    return NextResponse.json(
      { error: { message: 'No open voice session was found.', type: 'invalid_request_error' } },
      { status: 404, headers },
    );
  }

  const result = await handleLiveVoiceToolCall({
    db: scoped.db,
    userId,
    organizationId: session.organizationId,
    conversationId: session.conversationId,
    modelId: session.modelId,
    offeredTools: session.activeTools,
    call: parsed.data,
    signal: request.signal,
  });
  if (parsed.data.decision && result.status !== 'approval_required') {
    await recordAuditEvent({
      userId,
      organizationId: session.organizationId,
      eventType: 'tool_approval_decided',
      request,
      surface: 'voice',
      detail: {
        resourceType: 'tool',
        resourceId: parsed.data.callId,
        resourceName: parsed.data.name,
        status: parsed.data.decision,
        conversationId: session.conversationId,
      },
    });
  }
  return NextResponse.json(result, { headers });
}

export const POST = withErrorHandler(handleVoiceToolCall);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
