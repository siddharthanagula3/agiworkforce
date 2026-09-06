import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { setMarketplaceInstallationEnabled } from '@/lib/services/plugin-marketplace-installation-service';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import { uninstallDirectoryInstallation } from '@/features/plugins/server/directory/install';
import { installsDisabledResponse } from '@/features/plugins/server/directory/install-responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });
const PatchBodySchema = z.object({ enabled: z.boolean() }).strict();

type RouteContext = { params: Promise<{ id: string }> };

function notInstalled(): NextResponse {
  return NextResponse.json(
    { error: { code: 'PLUGIN_NOT_INSTALLED', message: 'Plugin installation not found.' } },
    { status: 404 },
  );
}

async function authenticateMutation(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return { userId, response: csrf as NextResponse };
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  return { userId, response: limited };
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await authenticateMutation(request);
  if (auth.response) return auth.response;
  const params = ParamsSchema.safeParse(await context.params);
  const body = PatchBodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN_UPDATE', message: 'The plugin update is invalid.' } },
      { status: 400 },
    );
  }

  try {
    const installation = await setMarketplaceInstallationEnabled(
      getNeonDb(),
      auth.userId,
      params.data.id,
      body.data.enabled,
    );
    if (!installation) return notInstalled();
    return NextResponse.json({ installation });
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

async function handleDelete(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const auth = await authenticateMutation(request);
  if (auth.response) return auth.response;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) return notInstalled();

  try {
    const removed = await uninstallDirectoryInstallation(getNeonDb(), auth.userId, params.data.id);
    if (!removed) return notInstalled();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const PATCH = withCorsRoute(withErrorHandler(handlePatch));
export const DELETE = withCorsRoute(withErrorHandler(handleDelete));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
