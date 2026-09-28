import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { confirmSupportAction } from '@/lib/support/actions/service';
import { SupportActionRefusal } from '@/lib/support/actions/types';
import { SupportActionConfirmRequestSchema } from '@agiworkforce/cloud-contracts/support';

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

  const rateLimited = await withRateLimit(request, 'support-action-confirm', userId);
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = SupportActionConfirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error.issues);
  }

  try {
    const { actionId, result } = await confirmSupportAction({
      db,
      userId,
      proposalId: parsed.data.proposalId,
      confirmationToken: parsed.data.confirmationToken,
      surface: parsed.data.surface ?? 'web',
      request,
    });
    return NextResponse.json({ outcome: 'success', actionId, result });
  } catch (error) {
    if (error instanceof SupportActionRefusal) return refusalResponse(error);
    throw error;
  }
}

export const POST = withErrorHandler(handlePost);
