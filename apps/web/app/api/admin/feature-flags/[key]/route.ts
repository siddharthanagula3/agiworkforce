import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { FlagDefinitionInputSchema, FlagKeySchema } from '@/lib/feature-flags/flag-definition';
import {
  archiveFlag,
  toggleFlagKillSwitch,
  updateFlag,
} from '@/lib/feature-flags/flag-admin-service';
import { getFlagDefinition, listFlagOverrides } from '@/lib/feature-flags/flag-store';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

interface FlagRouteContext {
  params: Promise<{ key: string }>;
}

const UpdateSchema = z
  .object({ expectedVersion: z.number().int().min(1), flag: FlagDefinitionInputSchema })
  .strict();

const KillSwitchSchema = z.object({ killSwitch: z.boolean() }).strict();

async function flagKey(context: FlagRouteContext): Promise<string> {
  const parsed = FlagKeySchema.safeParse((await context.params).key);
  if (!parsed.success) throw createError.badRequest('Invalid flag key');
  return parsed.data;
}

async function authorizeMutation(request: NextRequest): Promise<{ userId: string } | Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);
  return { userId };
}

async function handleGet(request: NextRequest, context: FlagRouteContext): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const key = await flagKey(context);
  const flag = await getFlagDefinition(key);
  if (!flag) throw createError.notFound('No flag by that name');
  return NextResponse.json(
    { flag, overrides: await listFlagOverrides(key) },
    { headers: NO_STORE },
  );
}

async function handleUpdate(request: NextRequest, context: FlagRouteContext): Promise<Response> {
  const authorized = await authorizeMutation(request);
  if (authorized instanceof Response) return authorized;
  const key = await flagKey(context);

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid flag definition', parsed.error.flatten());
  }
  if (parsed.data.flag.key !== key) throw createError.badRequest('A flag cannot be renamed');
  const flag = await updateFlag(
    { userId: authorized.userId, request },
    parsed.data.flag,
    parsed.data.expectedVersion,
  );
  return NextResponse.json({ flag }, { headers: NO_STORE });
}

async function handleKillSwitch(
  request: NextRequest,
  context: FlagRouteContext,
): Promise<Response> {
  const authorized = await authorizeMutation(request);
  if (authorized instanceof Response) return authorized;
  const key = await flagKey(context);

  const parsed = KillSwitchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.badRequest('Invalid kill switch payload');
  const flag = await toggleFlagKillSwitch(
    { userId: authorized.userId, request },
    key,
    parsed.data.killSwitch,
  );
  return NextResponse.json({ flag }, { headers: NO_STORE });
}

async function handleArchive(request: NextRequest, context: FlagRouteContext): Promise<Response> {
  const authorized = await authorizeMutation(request);
  if (authorized instanceof Response) return authorized;
  const flag = await archiveFlag({ userId: authorized.userId, request }, await flagKey(context));
  return NextResponse.json({ flag }, { headers: NO_STORE });
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handleUpdate);
export const PATCH = withErrorHandler(handleKillSwitch);
export const DELETE = withErrorHandler(handleArchive);
