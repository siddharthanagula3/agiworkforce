import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';

const LogMessageSchema = z.object({
  sessionId: z.string(),
  agentId: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  model: z.string().optional(),
  provider: z.string().optional(),
  tokensInput: z.number().int().nonnegative().optional(),
  tokensOutput: z.number().int().nonnegative().optional(),
  costCents: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

async function handlePost(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  await getClerkAuthUser(request);

  const body = await request.json();
  const parsed = LogMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Agent message persistence table dropped in migration 20260525200001.
  // This endpoint is retained as a no-op stub for backward compatibility.
  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandler(handlePost);
