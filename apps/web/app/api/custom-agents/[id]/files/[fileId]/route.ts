import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { AgentFileSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { openAgentWrite } from '@/lib/agents/agent-route';
import { deleteAgentFile } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

type FileRouteContext = { params: Promise<{ id: string; fileId: string }> };

const IdsSchema = z.object({ id: z.string().uuid(), fileId: AgentFileSchema.shape.id });

async function handleDelete(request: NextRequest, context: FileRouteContext) {
  const parsed = IdsSchema.safeParse(await context.params);
  if (!parsed.success) throw createError.notFound('File not found');
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  await deleteAgentFile(db, userId, parsed.data.id, parsed.data.fileId);
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withErrorHandler(handleDelete);
