/**
 * POST /api/support/actions/confirm
 *
 * Execute a previously proposed action, after the user explicitly confirmed it.
 *
 * THE BODY IS EXACTLY `{ proposalId, confirmationToken }`.
 *
 * There is no `actionId` and there are no `params` — the schema strips unknown
 * keys, and the service reads the action and its parameters back out of the
 * stored proposal row. This is what makes retargeting structurally impossible
 * rather than merely checked: a confirm request has no field in which to name a
 * different effect.
 */

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { confirmSupportAction } from '@/lib/support/actions/service';
import { SupportActionRefusal } from '@/lib/support/actions/types';

const ConfirmSchema = z
  .object({
    proposalId: z.string().uuid(),
    confirmationToken: z.string().min(20).max(200),
    surface: z.enum(['web', 'marketing']).optional(),
  })
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
  const { userId } = await getClerkAuthUser(request);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimited = await withRateLimit(request, 'support-action-confirm', userId);
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = ConfirmSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  try {
    const { actionId, result } = await confirmSupportAction({
      userId,
      proposalId: parsed.data.proposalId,
      confirmationToken: parsed.data.confirmationToken,
      surface: parsed.data.surface ?? 'web',
      request,
    });
    // `result` may be a `secret_once` payload carrying a live API key. It is
    // returned to the caller's own authenticated response and nowhere else —
    // see the contract note on SupportActionResult.
    return NextResponse.json({ outcome: 'success', actionId, result });
  } catch (error) {
    if (error instanceof SupportActionRefusal) return refusalResponse(error);
    throw error;
  }
}

export const POST = withErrorHandler(handlePost);
