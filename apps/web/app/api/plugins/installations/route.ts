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
  installWebPlugin,
  listPluginInstallations,
} from '@/lib/services/plugin-installation-service';
import type { PluginInstallationsResponse } from '@agiworkforce/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const InstallPluginBodySchema = z.object({
  pluginId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
});

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  const body: PluginInstallationsResponse = {
    installations: await listPluginInstallations(getNeonDb(), userId),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = InstallPluginBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN', message: 'Choose an available plugin.' } },
      { status: 400 },
    );
  }

  const installation = await installWebPlugin(getNeonDb(), userId, parsed.data.pluginId);
  if (!installation) {
    return NextResponse.json(
      {
        error: {
          code: 'PLUGIN_NOT_INSTALLABLE',
          message: 'This plugin is not available for Managed Cloud installation.',
        },
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ installation }, { status: 201 });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
