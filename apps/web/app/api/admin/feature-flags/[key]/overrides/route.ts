import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { FlagKeySchema, FlagOverrideInputSchema } from '@/lib/feature-flags/flag-definition';
import { removeFlagOverride, setFlagOverride } from '@/lib/feature-flags/flag-admin-service';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

interface OverrideRouteContext {
  params: Promise<{ key: string }>;
}

const RemoveOverrideSchema = z
  .object({
    subject: z.enum(['user', 'workspace']),
    subjectId: z.string().trim().min(1).max(200),
  })
  .strict();

async function authorize(
  request: NextRequest,
  context: OverrideRouteContext,
): Promise<{ userId: string; key: string } | Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);
  const key = FlagKeySchema.safeParse((await context.params).key);
  if (!key.success) throw createError.badRequest('Invalid flag key');
  return { userId, key: key.data };
}

async function handleSet(request: NextRequest, context: OverrideRouteContext): Promise<Response> {
  const authorized = await authorize(request, context);
  if (authorized instanceof Response) return authorized;
  const parsed = FlagOverrideInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid override', parsed.error.flatten());
  }
  await setFlagOverride({ userId: authorized.userId, request }, authorized.key, parsed.data);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

async function handleRemove(
  request: NextRequest,
  context: OverrideRouteContext,
): Promise<Response> {
  const authorized = await authorize(request, context);
  if (authorized instanceof Response) return authorized;
  const parsed = RemoveOverrideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.badRequest('Invalid override');
  await removeFlagOverride(
    { userId: authorized.userId, request },
    authorized.key,
    parsed.data.subject,
    parsed.data.subjectId,
  );
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export const PUT = withErrorHandler(handleSet);
export const DELETE = withErrorHandler(handleRemove);
