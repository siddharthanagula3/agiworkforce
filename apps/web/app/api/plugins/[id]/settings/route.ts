import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  getPluginInstallationSettings,
  updatePluginInstallationSettings,
} from '@/lib/services/plugin-installation-service';
import { PluginInstallationSettingsPatchSchema } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
});

type RouteContext = { params: Promise<{ id: string }> };

async function handleGet(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json(
      { error: { code: 'PLUGIN_NOT_INSTALLED', message: 'Plugin installation not found.' } },
      { status: 404 },
    );
  }

  const settings = await getPluginInstallationSettings(getNeonDb(), userId, params.data.id);
  if (!settings) {
    return NextResponse.json(
      { error: { code: 'PLUGIN_NOT_INSTALLED', message: 'Plugin installation not found.' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const params = ParamsSchema.safeParse(await context.params);
  const body = PluginInstallationSettingsPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!params.success || !body.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN_UPDATE', message: 'The settings update is invalid.' } },
      { status: 400 },
    );
  }

  const settings = await updatePluginInstallationSettings(
    getNeonDb(),
    userId,
    params.data.id,
    body.data,
  );
  if (!settings) {
    return NextResponse.json(
      { error: { code: 'PLUGIN_NOT_INSTALLED', message: 'Plugin installation not found.' } },
      { status: 404 },
    );
  }
  return NextResponse.json({ settings });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PATCH = withCorsRoute(withErrorHandler(handlePatch));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
