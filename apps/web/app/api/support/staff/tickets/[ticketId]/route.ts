import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  TicketClosedError,
  TicketNotFoundError,
  readTicketForStaff,
  replyToTicketAsStaff,
} from '@/lib/support/tickets/service';
import {
  type StaffTicketThread,
  SupportStaffTicketReplyRequestSchema,
  SupportTicketIdSchema,
} from '@agiworkforce/cloud-contracts/support';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ ticketId: string }> };

function translate(error: unknown): never {
  if (error instanceof TicketNotFoundError) throw createError.notFound('No such ticket');
  if (error instanceof TicketClosedError) {
    throw createError.validation('This ticket is closed, so it takes no more replies.');
  }
  throw error;
}

async function ticketIdFrom(context: RouteContext): Promise<string> {
  const { ticketId } = await context.params;
  const parsed = SupportTicketIdSchema.safeParse(ticketId);
  if (!parsed.success) throw createError.notFound('No such ticket');
  return parsed.data;
}

async function audit(
  request: NextRequest,
  staffUserId: string,
  thread: StaffTicketThread,
  status: 'read' | 'replied',
): Promise<void> {
  await recordAuditEvent({
    userId: staffUserId,
    eventType: 'data_accessed',
    request,
    detail: {
      resourceType: 'support_ticket',
      resourceId: thread.ticket.id,
      targetUserId: thread.ticket.userId,
      count: thread.replies.length,
      status,
    },
  });
}

async function handleRead(request: NextRequest, context: RouteContext) {
  const { userId } = await requirePlatformAdmin(request);

  const limited = await withRateLimit(request, 'admin-operator', `user:${userId}`);
  if (limited) return limited;

  const ticketId = await ticketIdFrom(context);
  try {
    const thread = await readTicketForStaff(ticketId, userId);
    await audit(request, userId, thread, 'read');
    return NextResponse.json(thread, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    translate(error);
  }
}

async function handleReply(request: NextRequest, context: RouteContext) {
  const { userId } = await requirePlatformAdmin(request);

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'admin-operator', `user:${userId}`);
  if (limited) return limited;

  const ticketId = await ticketIdFrom(context);
  const parsed = SupportStaffTicketReplyRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('A reply needs a message', parsed.error);
  }

  try {
    const thread = await replyToTicketAsStaff({
      ticketId,
      staffUserId: userId,
      message: parsed.data.reply,
      resolve: parsed.data.resolve,
    });
    await audit(request, userId, thread, 'replied');
    return NextResponse.json(thread, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    translate(error);
  }
}

export const GET = withErrorHandler(handleRead);
export const POST = withErrorHandler(handleReply);
