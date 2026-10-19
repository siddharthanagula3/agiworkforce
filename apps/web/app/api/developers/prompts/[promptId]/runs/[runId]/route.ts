import { NextRequest, NextResponse } from 'next/server';

import { DeveloperEvalRunSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { openPromptRead, readRouteId, type PromptRouteParams } from '@/lib/developers/prompt-route';
import { readRun } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest, context: { params: PromptRouteParams }) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const runId = await readRouteId(context.params, 'runId', 'Run not found');
  const opened = await openPromptRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  return NextResponse.json(
    { run: DeveloperEvalRunSchema.parse(await readRun(db, userId, promptId, runId)) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);
