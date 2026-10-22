import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listLiveArtifacts } from '@/lib/services/artifact-runtime-service';
import type { LiveArtifactListResponse } from '@/app/chat/live-artifacts/live-artifact-contract';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<Response> {
  const scoped = await getUserScopedDb(request);
  const { db, userId } = scoped;
  await assertAccountActive(userId, request);
  const limited = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (limited) return limited;

  const body: LiveArtifactListResponse = { artifacts: await listLiveArtifacts(db, scoped) };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withErrorHandler(handleGet);
