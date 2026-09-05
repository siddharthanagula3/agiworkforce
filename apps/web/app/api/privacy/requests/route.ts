import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { withErrorHandler } from '@/lib/error-handler';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  DATA_RIGHTS_REQUEST_LABELS,
  DATA_RIGHTS_REQUEST_TYPES,
  MAX_REQUEST_DETAILS_LENGTH,
  createDataRightsRequest,
  isDataRightsRequestType,
  readUserDataRightsRequests,
  type DataRightsRequest,
} from '@/lib/server/data-rights-requests';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';
import { getRequestIdentity } from '@/lib/server/identity';

const CreateRequestSchema = z.object({
  requestType: z.string().refine(isDataRightsRequestType, 'Unknown request type'),
  contactEmail: z.string().email().max(254),
  details: z.string().max(MAX_REQUEST_DETAILS_LENGTH).optional(),
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

async function alertOperators(input: {
  created: DataRightsRequest;
  contactEmail: string;
  details: string | null;
  userId: string | null;
}): Promise<boolean> {
  const environment = process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
  const { created } = input;
  const text = [
    `Environment: ${environment}`,
    `Reference: ${created.reference}`,
    `Received at: ${created.createdAt}`,
    `Request type: ${DATA_RIGHTS_REQUEST_LABELS[created.requestType]}`,
    `Contact email: ${input.contactEmail}`,
    `Account: ${input.userId ?? '(not signed in)'}`,
    '',
    'WHAT THE REQUESTER WROTE',
    input.details || '(nothing supplied)',
    '',
    'NEXT STEP',
    'The request is queued in public.data_rights_requests and listed by GET /api/admin/privacy/requests.',
  ].join('\n');

  const sent = await sendSupportEmail({
    to: getHandoffConfig().fallbackEmail,
    subject: `[AGI DPDP] ${environment} data-rights request ${created.reference} (${created.requestType})`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    replyTo: input.contactEmail,
    idempotencyKey: `data-rights-request:${created.reference}`,
  });

  if (!sent.delivered) {
    logger.error(
      {
        event: 'data_rights_request_alert_undeliverable',
        reference: created.reference,
        requestType: created.requestType,
        reason: sent.reason,
        detail: sent.detail,
      },
      'Data-rights request was recorded but no operator was notified',
    );
  }
  return sent.delivered;
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'waitlist');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = CreateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid rights-request payload', parsed.error.flatten());
  }

  let userId: string | null = null;
  try {
    userId = (await getRequestIdentity()).subject ?? null;
  } catch {
    userId = null;
  }

  const contactEmail = parsed.data.contactEmail.trim().toLowerCase();
  const details = parsed.data.details?.trim() || null;

  let created: DataRightsRequest;
  try {
    created = await createDataRightsRequest({
      userId,
      contactEmail,
      requestType: parsed.data.requestType,
      details,
    });
  } catch (error) {
    logger.error(
      { error, requestType: parsed.data.requestType },
      'Failed to record rights request',
    );
    throw createError.internal('Your request could not be recorded, so nothing was stored');
  }

  const operatorNotified = await alertOperators({
    created,
    contactEmail,
    details,
    userId,
  }).catch((error) => {
    logger.error(
      { error, event: 'data_rights_request_alert_failed', reference: created.reference },
      'Data-rights request was recorded but the operator alert threw',
    );
    return false;
  });

  return NextResponse.json({
    reference: created.reference,
    requestType: created.requestType,
    status: created.status,
    createdAt: created.createdAt,
    operatorNotified,
  });
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { subject: userId } = await getRequestIdentity();
  if (!userId) {
    throw createError.unauthorized('Sign in to see the requests recorded against your account');
  }

  const requests = await readUserDataRightsRequests(userId);
  return NextResponse.json({ requests, types: DATA_RIGHTS_REQUEST_TYPES });
}

export const POST = withErrorHandler(handlePost);
export const GET = withErrorHandler(handleGet);
