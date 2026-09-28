import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { listStaffTickets } from '@/lib/support/tickets/service';
import { SupportStaffTicketsQuerySchema } from '@agiworkforce/cloud-contracts/support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleList(request: NextRequest) {
  const { userId } = await requirePlatformAdmin(request);

  const limited = await withRateLimit(request, 'admin-operator', `user:${userId}`);
  if (limited) return limited;

  const parsed = SupportStaffTicketsQuerySchema.safeParse({
    offset: request.nextUrl.searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    throw createError.validation('The page offset must be a whole number', parsed.error);
  }

  const page = await listStaffTickets({ staffUserId: userId, offset: parsed.data.offset });

  await recordAuditEvent({
    userId,
    eventType: 'data_accessed',
    request,
    detail: {
      resourceType: 'support_ticket',
      resourceId: 'queue',
      count: page.tickets.length,
      status: 'listed',
    },
  });

  return NextResponse.json(page, { headers: { 'cache-control': 'no-store' } });
}

export const GET = withErrorHandler(handleList);
