import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import {
  SupportStaffTicketRecoveryRequestSchema,
  SupportTicketIdSchema,
} from '@agiworkforce/cloud-contracts/support';
import { RecoveryTicketError, completeAccountRecovery } from '@/lib/support/tickets/recovery';
import { TicketNotFoundError } from '@/lib/support/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ ticketId: string }> };

async function handleRecovery(request: NextRequest, context: RouteContext) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'admin-security');
  if (limited) return limited;

  const { userId: staffUserId } = await requirePlatformAdmin(request);

  const { ticketId } = await context.params;
  if (!SupportTicketIdSchema.safeParse(ticketId).success)
    throw createError.notFound('No such ticket');

  const parsed = SupportStaffTicketRecoveryRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) throw createError.validation('Invalid recovery action', parsed.error);

  try {
    const result = await completeAccountRecovery({
      ticketId,
      staffUserId,
      action: parsed.data.action,
      ...(parsed.data.email ? { email: parsed.data.email } : {}),
      request,
    });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof TicketNotFoundError) throw createError.notFound('No such ticket');
    if (error instanceof RecoveryTicketError) throw createError.validation(error.message);
    throw error;
  }
}

export const POST = withErrorHandler(handleRecovery);
