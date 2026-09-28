import 'server-only';

import { NextResponse, after, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { RECOVERY_LOSSES, submitAccountRecoveryRequest } from '@/lib/support/tickets/recovery';
import { MAX_TICKET_MESSAGE_CHARS } from '@/lib/support/tickets/types';

export const runtime = 'nodejs';

const RecoverySchema = z
  .object({
    accountEmail: z.string().trim().email().max(254),
    contactEmail: z.string().trim().email().max(254),
    lost: z.enum(RECOVERY_LOSSES),
    details: z.string().trim().min(1).max(MAX_TICKET_MESSAGE_CHARS),
  })
  .strict();

async function handleRecovery(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-create');
  if (limited) return limited;

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.supportRecovery);

  const parsed = RecoverySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid recovery request', parsed.error);
  }

  const recoveryRequest = { ...parsed.data, request };
  after(() =>
    submitAccountRecoveryRequest(recoveryRequest).catch((error: unknown) => {
      logger.error({ error }, '[support-recovery] a recovery request could not be filed');
    }),
  );
  return NextResponse.json(
    { received: true },
    { status: 202, headers: { 'cache-control': 'no-store' } },
  );
}

export const POST = withErrorHandler(handleRecovery);
