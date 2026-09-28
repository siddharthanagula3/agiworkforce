import 'server-only';

import { NextResponse, after, type NextRequest } from 'next/server';

import { getSuspendedAccountUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import {
  AppealContactMissingError,
  readLatestAppeal,
  submitAccountAppeal,
  submitSignedOutAppeal,
} from '@/lib/support/tickets/appeals';
import { SupportAppealRequestSchema } from '@agiworkforce/cloud-contracts/support';

export const runtime = 'nodejs';

const NO_STORE = { 'cache-control': 'no-store' };

async function suspendedCaller(request: NextRequest): Promise<string | null> {
  try {
    return (await getSuspendedAccountUser(request)).userId;
  } catch (error) {
    if (isAppError(error) && error.statusCode === 401) return null;
    throw error;
  }
}

async function handleRead(request: NextRequest) {
  const { userId } = await getSuspendedAccountUser(request);

  const limited = await withRateLimit(request, 'support-tickets-read', `user:${userId}`);
  if (limited) return limited;

  return NextResponse.json({ appeal: await readLatestAppeal(userId) }, { headers: NO_STORE });
}

async function handleSubmit(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const userId = await suspendedCaller(request);

  const limited = userId
    ? await withRateLimit(request, 'support-tickets-write', `user:${userId}`)
    : await withRateLimit(request, 'support-handoff-create');
  if (limited) return limited;

  const parsed = SupportAppealRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid appeal', parsed.error);
  }

  if (userId) {
    try {
      const appeal = await submitAccountAppeal(userId, parsed.data.message);
      await recordAuditEvent({
        userId,
        eventType: 'support_appeal_submitted',
        request,
        severity: 'warning',
        detail: {
          resourceType: 'support_ticket',
          resourceId: appeal.ticket.id,
          status: 'signed_in',
        },
      });
      return NextResponse.json({ appeal }, { status: 201, headers: NO_STORE });
    } catch (error) {
      if (error instanceof AppealContactMissingError) {
        throw createError.validation('This account has no email address support can reply to.');
      }
      throw error;
    }
  }

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.supportAppeal);
  if (!parsed.data.email) {
    throw createError.validation('Enter the email address of the suspended account.');
  }
  const { email, message } = parsed.data;
  after(async () => {
    try {
      const filed = await submitSignedOutAppeal({ email, message });
      if (!filed) return;
      await recordAuditEvent({
        userId: filed.userId,
        eventType: 'support_appeal_submitted',
        request,
        severity: 'warning',
        detail: {
          resourceType: 'support_ticket',
          resourceId: filed.ticketId,
          status: 'signed_out',
        },
      });
    } catch (error) {
      logger.error({ error }, '[support-appeal] a signed-out appeal could not be filed');
    }
  });
  return NextResponse.json({ received: true }, { status: 202, headers: NO_STORE });
}

export const GET = withErrorHandler(handleRead);
export const POST = withErrorHandler(handleSubmit);
