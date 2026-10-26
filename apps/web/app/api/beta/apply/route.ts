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
  recordBetaApplication,
} from '@/lib/server/beta-applications';
import { getOptionalAuthUser } from '@/lib/api-auth';
import { readPrimaryEmailState } from '@/lib/auth/email-confirmation';

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

  const accountId = (await getOptionalAuthUser(request))?.userId ?? null;
  const account = accountId ? await readPrimaryEmailState(accountId).catch(() => null) : null;
  const verifiedEmail = account?.confirmed ? account.email : null;
  const userId = verifiedEmail ? accountId : null;
  const data = parsed.data;

  const { alreadyReviewed } = await recordBetaApplication({
    email: (verifiedEmail ?? data.email).toLowerCase(),
    fullName: data.fullName,
    role: data.role,
    company: data.company ?? null,
    surfaces: [...new Set(data.surfaces)],
    useCase: data.useCase ?? null,
    discordHandle: data.discordHandle ?? null,
    userId,
    source: request.headers.get('referer'),
  });

  logger.info({ signedIn: userId !== null, alreadyReviewed }, 'Beta application recorded');

  return NextResponse.json({ recorded: true, alreadyReviewed });
}

export const POST = withErrorHandler(handleApply);

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
