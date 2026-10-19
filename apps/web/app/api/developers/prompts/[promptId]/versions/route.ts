import { NextRequest, NextResponse } from 'next/server';

import {
  DeveloperPromptResponseSchema,
  DeveloperPromptVersionInputSchema,
  DeveloperPromptVersionListSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openPromptRead,
  openPromptWrite,
  readPromptBody,
  readRouteId,
  type PromptRouteParams,
} from '@/lib/developers/prompt-route';
import { listVersions, saveVersion } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

type Context = { params: PromptRouteParams };

async function handleList(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const opened = await openPromptRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  return NextResponse.json(
    DeveloperPromptVersionListSchema.parse({ versions: await listVersions(db, userId, promptId) }),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handleSave(request: NextRequest, context: Context) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const input = await readPromptBody(request, DeveloperPromptVersionInputSchema);
  return NextResponse.json(
    DeveloperPromptResponseSchema.parse({ prompt: await saveVersion(db, userId, promptId, input) }),
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleSave);
