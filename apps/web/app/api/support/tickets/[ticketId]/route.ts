import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import {
  InvalidTicketTransitionError,
  TicketClosedError,
  TicketNotFoundError,
  moveTicket,
  readTicket,
  replyToTicket,
} from '@/lib/support/tickets/service';
import {
  SupportTicketPatchRequestSchema,
  type SupportTicket,
  type SupportTicketThread,
} from '@agiworkforce/cloud-contracts/support';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ ticketId: string }> };

function translate(error: unknown): never {
  if (error instanceof TicketNotFoundError) {
    throw createError.notFound('No such ticket');
  }
  if (error instanceof TicketClosedError) {
    throw createError.validation(
      'This ticket is closed. Raise a new one and reference this ticket in it.',
    );
  }
  if (error instanceof InvalidTicketTransitionError) {
    throw createError.validation(error.message);
  }
  throw error;
}

async function handleRead(request: NextRequest, context: RouteContext) {
  const { userId } = await getClerkAuthUser(request);
  const { ticketId } = await context.params;

  const limited = await withRateLimit(request, 'support-tickets-read', `user:${userId}`);
  if (limited) return limited;

  try {
    const thread: SupportTicketThread = await readTicket(ticketId, userId);
    logger.info({ userId, ticketId, replies: thread.replies.length }, '[support-ticket] read');
    return NextResponse.json(thread, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    translate(error);
  }
}

async function handlePatch(request: NextRequest, context: RouteContext) {
  const { userId } = await getClerkAuthUser(request);
  const { ticketId } = await context.params;

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-tickets-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = SupportTicketPatchRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation(
      'Send either a reply or a request to close the ticket.',
      parsed.error,
    );
  }

  try {
    if ('reply' in parsed.data) {
      const thread: SupportTicketThread = await replyToTicket({
        ticketId,
        userId,
        message: parsed.data.reply,
      });
      return NextResponse.json(thread, { headers: { 'cache-control': 'no-store' } });
    }

    const ticket: SupportTicket = await moveTicket({ ticketId, userId, to: parsed.data.status });
    return NextResponse.json({ ticket }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    translate(error);
  }
}

export const GET = withErrorHandler(handleRead);
export const PATCH = withErrorHandler(handlePatch);
