import 'server-only';

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { LIVE_SESSION_BLOCK_MINUTES } from '@/lib/voice/live-voice-billing';
import {
  closeExpiredVoiceSessions,
  getActiveVoiceSessionForConversation,
  isVoiceSessionStoreReady,
  listVoiceSessionHistory,
} from '../lib/voice-session-store';

// What a reconnect or a second device reads to pick a session back up: the
// settings it ran with and the transcript turn it had already delivered.
async function handleReadVoiceSession(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;
  const rateLimitResponse = await withRateLimit(request, 'voice-live-session');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await getClerkAuthUser(request);
  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };

  const scoped = await getUserScopedDb(request);
  if (scoped.userId !== userId) {
    return NextResponse.json(
      { error: { message: 'Managed usage tenant mismatch.', type: 'invalid_request_error' } },
      { status: 403, headers },
    );
  }
  if (!(await isVoiceSessionStoreReady(scoped.db))) {
    return NextResponse.json({ session: null, history: [] }, { headers });
  }

  const conversationId = request.nextUrl.searchParams.get('conversationId');
  const wantsHistory = request.nextUrl.searchParams.get('history') === 'true';

  // A tab that is closed, suspended or disconnected never posts the close, so
  // the row it left behind would stay open forever and offer itself back as a
  // session to resume. Nothing runs longer than the block it can be billed for.
  await closeExpiredVoiceSessions({
    db: scoped.db,
    userId,
    maxOpenSeconds: LIVE_SESSION_BLOCK_MINUTES * 60,
  });

  const session = conversationId
    ? await getActiveVoiceSessionForConversation(scoped.db, userId, conversationId)
    : null;
  const history = wantsHistory ? await listVoiceSessionHistory(scoped.db, userId) : [];

  return NextResponse.json(
    {
      session: session
        ? {
            sessionId: session.providerSessionId,
            conversationId: session.conversationId,
            surface: session.surface,
            voice: session.voice,
            language: session.language,
            pace: session.pace,
            activeTools: session.activeTools,
            lastTurnId: session.lastTurnId,
            startedAt: session.startedAt,
          }
        : null,
      history: history.map((record) => ({
        sessionId: record.providerSessionId,
        conversationId: record.conversationId,
        surface: record.surface,
        voice: record.voice,
        language: record.language,
        pace: record.pace,
        status: record.status,
        startedAt: record.startedAt,
        closedAt: record.closedAt,
        closeReason: record.closeReason,
      })),
    },
    { headers },
  );
}

export const GET = withErrorHandler(handleReadVoiceSession);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
