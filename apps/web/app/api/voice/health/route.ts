import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { withErrorHandler } from '@/lib/error-handler';

async function handler(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'health-check');
  if (rateLimitResponse) return rateLimitResponse;

  return NextResponse.json({ ok: true, service: 'voice-transcription' }, { status: 200 });
}

export const GET = withErrorHandler(handler);
