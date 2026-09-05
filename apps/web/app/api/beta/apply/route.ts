import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import {
  BETA_ROLES,
  BETA_SURFACES,
  MAX_USE_CASE_LENGTH,
  isIntakeTableMissing,
  recordBetaApplication,
} from '@/lib/server/beta-applications';
import { getRequestIdentity } from '@/lib/server/identity';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const ApplicationSchema = z.object({
  email: z.string().trim().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(BETA_ROLES),
  company: optionalText(120),
  surfaces: z.array(z.enum(BETA_SURFACES)).min(1).max(BETA_SURFACES.length),
  useCase: optionalText(MAX_USE_CASE_LENGTH),
  discordHandle: optionalText(64),
});

async function handleApply(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'beta-apply');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const parsed = ApplicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' },
      { status: 400 },
    );
  }

  const { subject: userId } = await getRequestIdentity().catch(() => ({ subject: null }));
  const data = parsed.data;

  let alreadyReviewed: boolean;
  try {
    ({ alreadyReviewed } = await recordBetaApplication({
      email: data.email.toLowerCase(),
      fullName: data.fullName,
      role: data.role,
      company: data.company ?? null,
      surfaces: [...new Set(data.surfaces)],
      useCase: data.useCase ?? null,
      discordHandle: data.discordHandle ?? null,
      userId: userId ?? null,
      source: request.headers.get('referer'),
    }));
  } catch (error) {
    if (!isIntakeTableMissing(error)) throw error;
    logger.error({ error }, 'Beta intake is not migrated; application was NOT stored');
    return NextResponse.json(
      {
        error: 'intake_unavailable',
        message:
          'Applications are not open yet, so nothing was stored. Nothing about you was saved, try again later.',
      },
      { status: 503 },
    );
  }

  logger.info({ signedIn: userId !== null, alreadyReviewed }, 'Beta application recorded');

  return NextResponse.json({ recorded: true, alreadyReviewed });
}

export const POST = withErrorHandler(handleApply);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
