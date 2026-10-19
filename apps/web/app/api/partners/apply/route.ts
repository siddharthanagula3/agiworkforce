import 'server-only';

import { randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import {
  PARTNER_APPLICATION_KIND_LABELS,
  PartnerApplicationRequestSchema,
  type PartnerApplicationResponse,
} from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { escapeHtml } from '@/lib/html-escape';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getOptionalAuthUser } from '@/lib/api-auth';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

const REFERENCE_PREFIX = 'PA-';

function partnerReference(): string {
  return `${REFERENCE_PREFIX}${randomBytes(5).toString('hex').toUpperCase()}`;
}

async function handleApply(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'waitlist');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = PartnerApplicationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Check the form and try again.', parsed.error.flatten());
  }
  const application = parsed.data;
  const reference = partnerReference();
  const accountId = (await getOptionalAuthUser(request))?.userId ?? null;
  const environment = process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
  const text = [
    `Environment: ${environment}`,
    `Reference: ${reference}`,
    `Kind: ${PARTNER_APPLICATION_KIND_LABELS[application.kind]}`,
    '',
    `Name: ${application.fullName}`,
    `Email: ${application.email}`,
    `Company: ${application.company}`,
    `Website: ${application.website ?? '(not given)'}`,
    `Account: ${accountId ?? '(not signed in)'}`,
    '',
    'WHAT THEY PROPOSE',
    application.message,
  ].join('\n');

  const sent = await sendSupportEmail({
    to: getHandoffConfig().fallbackEmail,
    subject: `[AGI partners] ${environment} ${reference} ${application.company}`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    replyTo: application.email.toLowerCase(),
    idempotencyKey: `partner-application:${reference}`,
  });

  if (!sent.delivered) {
    logger.error(
      { event: 'partner_application_undeliverable', reference, reason: sent.reason },
      'A partner application could not be delivered to the team inbox',
    );
    throw createError
      .serviceUnavailable(
        'Your application could not be sent right now. Try again in a few minutes, or email us instead.',
      )
      .asUserSafe();
  }

  logger.info({ event: 'partner_application_sent', reference }, 'Partner application sent');
  return NextResponse.json({ reference } satisfies PartnerApplicationResponse);
}

export const POST = withErrorHandler(handleApply);
