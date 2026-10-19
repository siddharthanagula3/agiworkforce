import { NextRequest, NextResponse } from 'next/server';

import {
  DeveloperEvalResultInputSchema,
  DeveloperEvalResultSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openPromptWrite,
  readPromptBody,
  readRouteId,
  type PromptRouteParams,
} from '@/lib/developers/prompt-route';
import { recordResult } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

async function handleRecord(request: NextRequest, context: { params: PromptRouteParams }) {
  const promptId = await readRouteId(context.params, 'promptId', 'Prompt not found');
  const runId = await readRouteId(context.params, 'runId', 'Run not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const input = await readPromptBody(request, DeveloperEvalResultInputSchema);
  return NextResponse.json(
    {
      result: DeveloperEvalResultSchema.parse(
        await recordResult(db, userId, promptId, runId, input),
      ),
    },
    { status: 201 },
  );
}

export const POST = withErrorHandler(handleRecord);
