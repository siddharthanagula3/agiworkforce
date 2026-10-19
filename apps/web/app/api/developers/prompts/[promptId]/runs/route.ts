import { NextRequest, NextResponse } from 'next/server';

import {
  DeveloperEvalRunCreateSchema,
  DeveloperEvalRunListSchema,
  DeveloperEvalRunSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openPromptRead,
  openPromptWrite,
  readPromptBody,
  readRouteId,
  type PromptRouteParams,
} from '@/lib/developers/prompt-route';
import { createRun, listRuns, requirePrompt } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

type Context = { params: PromptRouteParams };

async function handleList(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const opened = await openPromptRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  await requirePrompt(db, userId, promptId);
  return NextResponse.json(
    DeveloperEvalRunListSchema.parse({ runs: await listRuns(db, userId, promptId) }),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handleCreate(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const input = await readPromptBody(request, DeveloperEvalRunCreateSchema);
  return NextResponse.json(
    { run: DeveloperEvalRunSchema.parse(await createRun(db, userId, promptId, input)) },
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
