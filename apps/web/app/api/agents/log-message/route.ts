import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';

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

  const body = await readJsonBody(request);
  const parsed = LogMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Agent message persistence table was removed. Do not return a fake success:
  // callers must use the active conversation persistence path instead.
  return NextResponse.json(
    { error: 'Agent message logging endpoint is no longer available' },
    { status: 410 },
  );
}

export const POST = withErrorHandler(handlePost);
