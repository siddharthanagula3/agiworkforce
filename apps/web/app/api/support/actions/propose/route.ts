import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { proposeSupportAction } from '@/lib/support/actions/service';
import { SupportActionRefusal } from '@/lib/support/actions/types';

const ProposeSchema = z
  .object({
    actionId: z.string().min(1).max(64),
    params: z.record(z.string(), z.unknown()).optional(),
    surface: z.enum(['web', 'marketing']).optional(),
    conversationRef: z.string().max(128).optional(),
  })
  // Unknown keys are STRIPPED, not merged: a body that also carries `userId`
  // contributes nothing.
  .strip();

function refusalResponse(error: SupportActionRefusal): NextResponse {
  return NextResponse.json(
    {
      code: error.code,
      message: error.message,
      ...(error.explain ? { explain: error.explain } : {}),
      ...(error.control ? { control: error.control } : {}),
    },
    { status: error.status },
  );
}

async function handlePost(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimited = await withRateLimit(request, 'support-action-propose', userId);
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = ProposeSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  try {
    const output = await proposeSupportAction({
      db,
      userId,
      actionId: parsed.data.actionId,
      params: parsed.data.params ?? {},
      surface: parsed.data.surface ?? 'web',
      conversationRef: parsed.data.conversationRef ?? null,
      request,
    });
    return NextResponse.json(output);
  } catch (error) {
    if (error instanceof SupportActionRefusal) return refusalResponse(error);
    throw error;
  }
}

export const POST = withErrorHandler(handlePost);
