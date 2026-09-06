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
  installMarketplaceEntry,
  listMarketplaceInstallations,
} from '@/lib/services/plugin-marketplace-installation-service';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import { installDirectoryPlugin } from '@/features/plugins/server/directory/install';
import { installsDisabledResponse } from '@/features/plugins/server/directory/install-responses';
import type { PluginMarketplaceInstallationsResponse } from '@agiworkforce/cloud-contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

const InstallBodySchema = z.union([
  z.object({ entryId: z.string().uuid() }).strict(),
  z.object({ pluginId: z.string().trim().regex(PLUGIN_ID_PATTERN) }).strict(),
]);

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;

  let installations;
  try {
    installations = await listMarketplaceInstallations(getNeonDb(), userId);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
  const body: PluginMarketplaceInstallationsResponse = { installations };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function installFromDirectory(userId: string, pluginId: string): Promise<NextResponse> {
  const result = await installDirectoryPlugin(getNeonDb(), userId, pluginId);
  switch (result.status) {
    case 'installed':
      return NextResponse.json(
        { installation: result.installation, skills: result.skills },
        { status: 201 },
      );
    case 'missing':
      return NextResponse.json(
        { error: { code: 'PLUGIN_NOT_FOUND', message: result.message } },
        { status: 404 },
      );
    case 'builtin':
      return NextResponse.json(
        { error: { code: 'PLUGIN_IS_BUILTIN', message: result.message } },
        { status: 409 },
      );
    case 'blocked':
      return NextResponse.json(
        {
          error: {
            code: 'PLUGIN_NOT_INSTALLABLE',
            message: result.message,
            installCommand: result.installCommand,
          },
        },
        { status: 409 },
      );
    case 'skills-unavailable':
      return NextResponse.json(
        { error: { code: 'PLUGIN_SOURCE_UNAVAILABLE', message: result.message } },
        { status: 502 },
      );
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getClerkAuthUser(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = InstallBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN', message: 'Choose an available marketplace plugin.' } },
      { status: 400 },
    );
  }

  try {
    if ('pluginId' in parsed.data) return await installFromDirectory(userId, parsed.data.pluginId);

    const installation = await installMarketplaceEntry(getNeonDb(), userId, parsed.data.entryId);
    if (!installation) {
      return NextResponse.json(
        {
          error: {
            code: 'PLUGIN_NOT_INSTALLABLE',
            message: 'This marketplace plugin is not available for installation.',
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ installation }, { status: 201 });
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
