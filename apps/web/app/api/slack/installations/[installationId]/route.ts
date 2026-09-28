import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ManagedCloudSlackInstallationRemovedSchema } from '@agiworkforce/cloud-contracts';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { uninstallSlackWorkspace } from '@/lib/slack/slack-installations';

const ENDPOINT = '/api/slack/installations/[installationId]';

type RouteContext = { params: Promise<{ installationId: string }> };

async function handleUninstall(request: NextRequest, context: RouteContext) {
  const { userId, organizationId } = await getUserScopedDb(request, {
    resolveOrganization: true,
  });
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'slack-settings', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const { installationId } = await context.params;
  if (!z.string().uuid().safeParse(installationId).success) {
    throw createError.validation('Name the Slack workspace to remove');
  }

  const removed = await uninstallSlackWorkspace(getNeonDb(), { installationId, userId });
  if (!removed) throw createError.notFound('That Slack workspace is not one you installed');

  await recordAuditEvent({
    userId,
    eventType: 'connector_removed',
    request,
    endpoint: ENDPOINT,
    organizationId,
    detail: {
      resourceType: 'slack_installation',
      resourceId: removed.id,
      resourceName: removed.teamName,
      connectorId: 'slack-app',
      provider: 'slack',
    },
  });

  return NextResponse.json(
    ManagedCloudSlackInstallationRemovedSchema.parse({ removed: removed.id }),
  );
}

export const DELETE = withErrorHandler(handleUninstall);
