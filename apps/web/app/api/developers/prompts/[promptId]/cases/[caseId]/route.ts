import { NextRequest, NextResponse } from 'next/server';

import {
  DeveloperEvalCaseInputSchema,
  DeveloperEvalCaseSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openPromptWrite,
  readPromptBody,
  readRouteId,
  type PromptRouteParams,
} from '@/lib/developers/prompt-route';
import { deleteCase, updateCase } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

type Context = { params: PromptRouteParams };

async function handleUpdate(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const caseId = await readRouteId(context.params, 'caseId', 'Test case not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const input = await readPromptBody(request, DeveloperEvalCaseInputSchema);
  return NextResponse.json({
    case: DeveloperEvalCaseSchema.parse(await updateCase(db, userId, promptId, caseId, input)),
  });
}

async function handleDelete(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const caseId = await readRouteId(context.params, 'caseId', 'Test case not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  await deleteCase(db, userId, promptId, caseId);
  return new NextResponse(null, { status: 204 });
}

export const PUT = withErrorHandler(handleUpdate);
export const DELETE = withErrorHandler(handleDelete);
