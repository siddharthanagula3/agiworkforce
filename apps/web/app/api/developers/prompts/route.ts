import { NextRequest, NextResponse } from 'next/server';

import {
  DeveloperPromptCreateSchema,
  DeveloperPromptListSchema,
  DeveloperPromptResponseSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { openPromptRead, openPromptWrite, readPromptBody } from '@/lib/developers/prompt-route';
import { createPrompt, listPrompts } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

async function handleList(request: NextRequest) {
  const opened = await openPromptRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  return NextResponse.json(
    DeveloperPromptListSchema.parse({ prompts: await listPrompts(db, userId) }),
    {
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}

async function handleCreate(request: NextRequest) {
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const input = await readPromptBody(request, DeveloperPromptCreateSchema);
  return NextResponse.json(
    DeveloperPromptResponseSchema.parse({ prompt: await createPrompt(db, userId, input) }),
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
