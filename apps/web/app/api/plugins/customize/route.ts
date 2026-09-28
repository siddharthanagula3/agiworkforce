import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import {
  PluginCustomizeRequestSchema,
  type PluginCustomizeResponse,
} from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import { customizePlugin } from '@/features/plugins/server/directory/customize';
import { refusePluginInstall } from '@/features/plugins/server/directory/install-gate';
import { installsDisabledResponse } from '@/features/plugins/server/directory/install-responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const scope = await getUserScopedDb(request);
  const { db, userId, organizationId } = scope;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;

  const parsed = PluginCustomizeRequestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_PLUGIN', message: 'Choose an installed plugin to customize.' } },
      { status: 400 },
    );
  }

  const refused = await refusePluginInstall(request, scope, {
    pluginKeys: [],
    authorsSkills: true,
  });
  if (refused) return refused;

  try {
    const result = await customizePlugin(db, userId, parsed.data);
    switch (result.status) {
      case 'missing':
        return NextResponse.json(
          {
            error: {
              code: 'PLUGIN_NOT_CUSTOMIZABLE',
              message: 'Install and turn on this plugin before you customize it.',
            },
          },
          { status: 409 },
        );
      case 'invalid':
        return NextResponse.json(
          { error: { code: 'PLUGIN_NOT_CUSTOMIZABLE', message: result.message } },
          { status: 422 },
        );
      case 'existing':
        return NextResponse.json<PluginCustomizeResponse>({
          entryId: result.entryId,
          created: false,
        });
      case 'created':
        await recordAuditEvent({
          userId,
          organizationId,
          eventType: 'plugin_marketplace_changed',
          request,
          detail: { resourceId: result.entryId, resourceName: result.name, status: 'customized' },
        });
        return NextResponse.json<PluginCustomizeResponse>(
          { entryId: result.entryId, created: true },
          { status: 201 },
        );
    }
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
