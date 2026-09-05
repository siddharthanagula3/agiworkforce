import { NextRequest, NextResponse } from 'next/server';

import { getUserScopedDb } from '@/lib/server/rls-db';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getBundledSkillDownloadForPlugins } from '@/lib/services/skill-catalog-service';
import { listEnabledPluginIds } from '@/lib/services/plugin-installation-service';

export const runtime = 'nodejs';

async function handleDownload(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const rateLimit = await withRateLimit(request, 'chat-conversation');
  if (rateLimit) return rateLimit;
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });

  const { name } = await context.params;
  if (!name || name.length > 200) {
    throw createError.validation('skill name is required (1–200 chars)');
  }

  const enabledPluginIds = await listEnabledPluginIds(db, userId);
  const download = await getBundledSkillDownloadForPlugins(enabledPluginIds, name);
  if (download === null) {
    throw createError.notFound(`Bundled skill "${name}" not found`);
  }

  return new NextResponse(new Uint8Array(download.content), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': 'attachment; filename="SKILL.md"',
      'Cache-Control': 'private, no-store',
      ETag: `"${download.contentHash}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const GET = withCorsRoute(withErrorHandler(handleDownload));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
