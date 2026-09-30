import 'server-only';

import { NextResponse, after, type NextRequest } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { requireHumanCaller } from '@/lib/security/bot-challenge';
import { BOT_CHALLENGED_ENDPOINTS } from '@/lib/security/bot-challenge-routes';
import { SupportRecoveryRequestSchema } from '@agiworkforce/cloud-contracts/support';
import { submitAccountRecoveryRequest } from '@/lib/support/tickets/recovery';

export const runtime = 'nodejs';

async function handleRecovery(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-create');
  if (limited) return limited;

  await requireHumanCaller(BOT_CHALLENGED_ENDPOINTS.supportRecovery);

  const parsed = SupportRecoveryRequestSchema.safeParse(await readJsonBody(request));
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
