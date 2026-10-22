import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  SLACK_CHANNEL_TOOLS,
  SlackChannelPolicyListSchema,
  SlackChannelPolicyUpdateSchema,
} from '@agiworkforce/cloud-contracts';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  listSlackChannelPolicies,
  setSlackChannelPolicy,
} from '@/lib/slack/slack-channel-policies';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ installationId: string }> };

async function readInstallationId(context: RouteContext): Promise<string> {
  const { installationId } = await context.params;
  if (!z.string().uuid().safeParse(installationId).success) {
    throw createError.validation('Name the Slack workspace');
  }
  return installationId;
}

async function handleList(request: NextRequest, context: RouteContext) {
  const installationId = await readInstallationId(context);
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'slack-settings', `user:${userId}`);
  if (limited) return limited;
  return NextResponse.json(
    SlackChannelPolicyListSchema.parse(
      await listSlackChannelPolicies(db, getNeonDb(), userId, installationId),
    ),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handleSet(request: NextRequest, context: RouteContext) {
  const installationId = await readInstallationId(context);
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const limited = await withRateLimit(request, 'slack-settings', `user:${userId}`);
  if (limited) return limited;
  const parsed = SlackChannelPolicyUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) throw createError.validation('Choose a channel and what it may do');
  await setSlackChannelPolicy(db, userId, { installationId, ...parsed.data });
  await recordAuditEvent({
    userId,
    eventType: 'connector_setting_changed',
    request,
    organizationId,
    detail: {
      resourceType: 'slack_channel',
      resourceId: parsed.data.channelId,
      connectorId: 'slack-app',
      status: parsed.data.mode ?? 'default',
      ...(parsed.data.tools !== undefined && parsed.data.mode !== null
        ? { scopes: parsed.data.tools ?? [...SLACK_CHANNEL_TOOLS] }
        : {}),
    },
  });
  return NextResponse.json(
    SlackChannelPolicyListSchema.parse(
      await listSlackChannelPolicies(db, getNeonDb(), userId, installationId),
    ),
  );
}

export const GET = withErrorHandler(handleList);
export const PUT = withErrorHandler(handleSet);
