import { NextRequest, NextResponse } from 'next/server';

import {
  DeveloperPromptRenameSchema,
  DeveloperPromptResponseSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openPromptRead,
  openPromptWrite,
  readPromptBody,
  readRouteId,
  type PromptRouteParams,
} from '@/lib/developers/prompt-route';
import { deletePrompt, renamePrompt, requirePrompt } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

type Context = { params: PromptRouteParams };

async function handleGet(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const opened = await openPromptRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  return NextResponse.json(
    DeveloperPromptResponseSchema.parse({ prompt: await requirePrompt(db, userId, promptId) }),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handlePatch(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const { name } = await readPromptBody(request, DeveloperPromptRenameSchema);
  return NextResponse.json(
    DeveloperPromptResponseSchema.parse({ prompt: await renamePrompt(db, userId, promptId, name) }),
  );
}

async function handleDelete(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  await deletePrompt(db, userId, promptId);
  return new NextResponse(null, { status: 204 });
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);
