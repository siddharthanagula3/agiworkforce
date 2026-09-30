import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { PluginSourceInstallResponse } from '@agiworkforce/cloud-contracts';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { isMissingPluginMarketplaceSchema } from '@/lib/services/plugin-marketplace-service';
import {
  readAuthoredPlugin,
  replaceAuthoredPlugin,
} from '@/lib/services/plugin-owned-source-service';
import {
  AUTHORED_PLUGIN_INVALID_CODE,
  AUTHORED_PLUGIN_INVALID_MESSAGE,
  AuthoredPluginEditBodySchema,
  authoredSkillIssues,
  authoredSkillPath,
} from '@/features/plugins/server/directory/authored-plugin';
import { refusePluginInstall } from '@/features/plugins/server/directory/install-gate';
import { installsDisabledResponse } from '@/features/plugins/server/directory/install-responses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_KIND_AUTHORED = 'authored';
const ParamsSchema = z.object({ entryId: z.string().uuid() });

type RouteContext = { params: Promise<{ entryId: string }> };

function notFound(): NextResponse {
  return NextResponse.json(
    { error: { code: 'PLUGIN_NOT_FOUND', message: 'That plugin is not one you created.' } },
    { status: 404 },
  );
}

async function handleGet(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'model-catalog', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) return notFound();

  const draft = await readAuthoredPlugin(db, userId, params.data.entryId);
  if (!draft) return notFound();
  return NextResponse.json({ draft }, { headers: { 'Cache-Control': 'private, no-store' } });
}

async function handlePut(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const scope = await getUserScopedDb(request);
  const { db, userId, organizationId } = scope;
  const limited = await withRateLimit(request, 'plugin-installation-write', `user:${userId}`);
  if (limited) return limited;
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) return notFound();

  const parsed = AuthoredPluginEditBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: AUTHORED_PLUGIN_INVALID_CODE, message: AUTHORED_PLUGIN_INVALID_MESSAGE } },
      { status: 400 },
    );
  }
  const issues = authoredSkillIssues(parsed.data.skills);
  if (issues.length > 0) {
    return NextResponse.json(
      {
        error: {
          code: AUTHORED_PLUGIN_INVALID_CODE,
          message: issues[0] ?? AUTHORED_PLUGIN_INVALID_MESSAGE,
          issues,
        },
      },
      { status: 422 },
    );
  }

  const refused = await refusePluginInstall(request, scope, {
    pluginKeys: [],
    authorsSkills: true,
  });
  if (refused) return refused;

  try {
    const stored = await replaceAuthoredPlugin(
      db,
      userId,
      params.data.entryId,
      parsed.data,
      authoredSkillPath,
    );
    if (!stored) return notFound();
    const body: PluginSourceInstallResponse = {
      sourceName: stored.name,
      kind: SOURCE_KIND_AUTHORED,
      plugins: [stored],
    };
    await recordAuditEvent({
      userId,
      organizationId,
      eventType: 'plugin_marketplace_changed',
      request,
      detail: { resourceId: stored.pluginKey, status: 'edited', count: stored.skills.length },
    });
    return NextResponse.json(body);
  } catch (error) {
    if (isMissingPluginMarketplaceSchema(error)) return installsDisabledResponse();
    throw error;
  }
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const PUT = withCorsRoute(withErrorHandler(handlePut));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
