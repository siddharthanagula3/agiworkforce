import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import {
  EmptyEscalationSummaryError,
  TicketClosedError,
  TicketNotFoundError,
  escalateTicket,
  readEscalations,
} from '@/lib/support/tickets/service';
import { ESCALATION_TRACKERS, MAX_ESCALATION_SUMMARY_CHARS } from '@/lib/support/tickets/types';

export const runtime = 'nodejs';

const EscalateSchema = z
  .object({
    summary: z.string().trim().min(1).max(MAX_ESCALATION_SUMMARY_CHARS),
    tracker: z.enum(ESCALATION_TRACKERS).optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ ticketId: string }> };

function translate(error: unknown): never {
  if (error instanceof TicketNotFoundError) throw createError.notFound('No such ticket');
  if (error instanceof TicketClosedError) {
    throw createError.validation('This ticket is closed; reopen it before escalating.');
  }
  if (error instanceof EmptyEscalationSummaryError) {
    throw createError.validation('An escalation needs a summary the responder can act on.');
  }
  throw error;
}

async function handleList(request: NextRequest, context: RouteContext) {
  const { userId } = await requirePlatformAdmin(request);
  const { ticketId } = await context.params;

  const limited = await withRateLimit(request, 'support-tickets-read', `user:${userId}`);
  if (limited) return limited;

  const escalations = await readEscalations(ticketId);
  return NextResponse.json({ escalations }, { headers: { 'cache-control': 'no-store' } });
}

async function handleEscalate(request: NextRequest, context: RouteContext) {
  const { userId } = await requirePlatformAdmin(request);
  const { ticketId } = await context.params;

  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-tickets-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = EscalateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Send a summary and, optionally, a tracker', parsed.error);
  }

  try {
    const escalation = await escalateTicket({
      ticketId,
      escalatedByUserId: userId,
      summary: parsed.data.summary,
      tracker: parsed.data.tracker,
    });
    logger.info(
      { userId, ticketId, severity: escalation.severity, tracker: escalation.tracker },
      '[support-ticket] escalated',
    );
    return NextResponse.json(
      { escalation },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    translate(error);
  }
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleEscalate);
