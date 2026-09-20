import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import {
  CLIENT_FAILURE_CLASSES,
  CLIENT_FAILURE_DETAILS,
  CLIENT_FAILURE_MAX_BATCH,
  CLIENT_FAILURE_MAX_BODY_BYTES,
} from '@/lib/observability/client-failures';
import { recordClientFailure } from '@/lib/observability/metrics';
import { httpRequestLabels } from '@/lib/observability/request-labels';
import { withRateLimit } from '@/lib/rate-limit';
import { getRequestIdentity } from '@/lib/server/identity';
import { readServerTelemetryConsent } from '@/lib/server/telemetry-consent';

// `strict` is the privacy control: there is no field a prompt, a message or a
// stack trace can ride in on, and a client that adds one is refused.
const ClientFailureSchema = z
  .object({
    failure: z.enum(CLIENT_FAILURE_CLASSES),
    detail: z.enum(CLIENT_FAILURE_DETAILS).optional(),
  })
  .strict();

const IngestSchema = z
  .object({
    events: z.array(ClientFailureSchema).min(1).max(CLIENT_FAILURE_MAX_BATCH),
  })
  .strict();

async function readBoundedBody(request: NextRequest): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > CLIENT_FAILURE_MAX_BODY_BYTES) return null;
  const body = await request.text().catch(() => '');
  if (body.length > CLIENT_FAILURE_MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'client-telemetry');
  if (rateLimitResponse) return rateLimitResponse;

  const { subject: userId } = await getRequestIdentity();
  if (!userId) {
    throw createError.unauthorized('Sign in to report a client failure');
  }

  const parsed = IngestSchema.safeParse(await readBoundedBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid client telemetry payload');
  }

  // A browser that reports without consent must change nothing rather than be
  // trusted to have asked first.
  if (!(await readServerTelemetryConsent())) {
    return NextResponse.json({ accepted: 0, consent: 'withheld' }, { status: 202 });
  }

  const labels = httpRequestLabels((name) => request.headers.get(name));
  for (const event of parsed.data.events) {
    recordClientFailure({
      failure: event.failure,
      detail: event.detail,
      surface: labels.surface,
      clientVersion: labels.clientVersion,
    });
  }

  logger.info(
    { event: 'client_failure_reported', count: parsed.data.events.length, surface: labels.surface },
    'Recorded client failure reports',
  );

  return NextResponse.json({ accepted: parsed.data.events.length, consent: 'granted' });
}

export const POST = withErrorHandler(handlePost);
