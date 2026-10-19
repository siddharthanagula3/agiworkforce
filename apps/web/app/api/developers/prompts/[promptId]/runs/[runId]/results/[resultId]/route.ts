import { NextRequest, NextResponse } from 'next/server';

import { DeveloperEvalGradeSchema, DeveloperEvalResultSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openPromptWrite,
  readPromptBody,
  readRouteId,
  type PromptRouteParams,
} from '@/lib/developers/prompt-route';
import { gradeResult } from '@/lib/services/developer-prompt-service';

export const runtime = 'nodejs';

async function handleGrade(request: NextRequest, context: { params: PromptRouteParams }) {
  const runId = await readRouteId(context.params, 'runId', 'Run not found');
  const resultId = await readRouteId(context.params, 'resultId', 'Result not found');
  const opened = await openPromptWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const { grade } = await readPromptBody(request, DeveloperEvalGradeSchema);
  return NextResponse.json({
    result: DeveloperEvalResultSchema.parse(await gradeResult(db, userId, runId, resultId, grade)),
  });
}

export const PATCH = withErrorHandler(handleGrade);
