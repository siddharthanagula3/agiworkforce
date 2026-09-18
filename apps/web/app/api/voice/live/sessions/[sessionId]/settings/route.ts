import 'server-only';

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { isLiveVoice } from '@features/chat/lib/live-voices';
import {
  isVoiceSessionStoreReady,
  updateVoiceSessionSettings,
  VOICE_PACE_MAX,
  VOICE_PACE_MIN,
} from '../../lib/voice-session-store';

const UpdateVoiceSessionSchema = z
  .object({
    voice: z.string().min(1).max(64).optional(),
    language: z.string().min(2).max(32).nullable().optional(),
    pace: z.number().min(VOICE_PACE_MIN).max(VOICE_PACE_MAX).optional(),
    lastTurnId: z.string().min(1).max(128).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No settings were supplied.' });

async function handleUpdateVoiceSession(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) return preflightResponse;
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'voice-live-session');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await getClerkAuthUser(request);
  const { sessionId } = await context.params;
  const headers = { ...getCorsHeaders(request), ...getSecurityHeaders() };

  let body: z.infer<typeof UpdateVoiceSessionSchema>;
  try {
    body = UpdateVoiceSessionSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      {
        error: { message: 'A voice, language or pace is required.', type: 'invalid_request_error' },
      },
      { status: 400, headers },
    );
  }
  if (body.voice !== undefined && !isLiveVoice(body.voice)) {
    return NextResponse.json(
      { error: { message: 'That voice is not available.', type: 'invalid_request_error' } },
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

  const record = await updateVoiceSessionSettings({
    db: scoped.db,
    userId,
    providerSessionId: sessionId,
    ...(body.voice !== undefined ? { voice: body.voice } : {}),
    ...(body.language !== undefined ? { language: body.language } : {}),
    ...(body.pace !== undefined ? { pace: body.pace } : {}),
    ...(body.lastTurnId !== undefined ? { lastTurnId: body.lastTurnId } : {}),
  });
  if (!record) {
    return NextResponse.json(
      { error: { message: 'No open voice session was found.', type: 'invalid_request_error' } },
      { status: 404, headers },
    );
  }

  return NextResponse.json(
    {
      sessionId: record.providerSessionId,
      voice: record.voice,
      language: record.language,
      pace: record.pace,
      lastTurnId: record.lastTurnId,
    },
    { headers },
  );
}

export const PATCH = withErrorHandler(handleUpdateVoiceSession);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
    })
  );
}
