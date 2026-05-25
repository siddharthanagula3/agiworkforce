import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const body = await request.json();
  const parsed = LogMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const d = parsed.data;

  await db.execute(
    `insert into vibe_agent_messages
     (session_id, user_id, agent_id, role, content, metadata)
     values ($1, $2, $3, $4, $5, $6)`,
    [d.sessionId, userId, d.agentId ?? null, d.role, d.content, JSON.stringify(d.metadata ?? {})],
  );

  return NextResponse.json({ ok: true });
}

export const POST = withErrorHandler(handlePost);
