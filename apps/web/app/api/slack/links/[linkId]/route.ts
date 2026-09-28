import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ManagedCloudSlackAccountUnlinkedSchema } from '@agiworkforce/cloud-contracts';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { unlinkSlackAccount } from '@/lib/slack/slack-links';

const ENDPOINT = '/api/slack/links/[linkId]';

type RouteContext = { params: Promise<{ linkId: string }> };

async function handleUnlink(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request, {
    resolveOrganization: true,
  });
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'slack-settings', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const { linkId } = await context.params;
  if (!z.string().uuid().safeParse(linkId).success) {
    throw createError.validation('Name the Slack account to disconnect');
  }

  const removed = await unlinkSlackAccount(db, { userId, linkId });
  if (!removed) throw createError.notFound('That Slack account is not linked to you');

  await recordAuditEvent({
    userId,
    eventType: 'identity_unlinked',
    request,
    endpoint: ENDPOINT,
    organizationId,
    detail: {
      resourceType: 'slack_account',
      resourceId: linkId,
      provider: 'slack',
      subjectRef: `${removed.teamId}:${removed.slackUserId}`,
    },
  });

  return NextResponse.json(ManagedCloudSlackAccountUnlinkedSchema.parse({ removed: linkId }));
}

export const DELETE = withErrorHandler(handleUnlink);
