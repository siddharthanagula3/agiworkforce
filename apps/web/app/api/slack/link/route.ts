import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { postSlackMessage, readSlackUser } from '@/lib/slack/slack-api';
import { isSlackAppConfigured, slackAppOrigin, slackSettingsUrl } from '@/lib/slack/slack-config';
import type { SlackLinkPreview } from '@/lib/slack/slack-contract';
import { findSlackInstallationById } from '@/lib/slack/slack-installations';
import {
  SlackLinkConflictError,
  consumeSlackLinkRequest,
  isSlackLinkToken,
  linkSlackAccount,
  previewSlackLinkRequest,
} from '@/lib/slack/slack-links';
import { linkedMessage } from '@/lib/slack/slack-messages';
import {
  readWorkspaceName,
  slackPlanAllowed,
  slackRequiredPlans,
} from '@/lib/slack/slack-settings';

const ENDPOINT = '/api/slack/link';
const EXPIRED_LINK =
  'This link has expired or was already used. Send AGI Workforce a message in Slack to get a new one.';

const ConfirmSchema = z.object({ token: z.string() }).strict();

async function handlePreview(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request, {
    resolveOrganization: true,
  });
  const rateLimitResponse = await withRateLimit(request, 'slack-link', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;
  if (!isSlackAppConfigured()) {
    throw createError.serviceUnavailable('AGI Workforce in Slack is not available right now');
  }

  const token = new URL(request.url).searchParams.get('token');
  if (!isSlackLinkToken(token)) throw createError.validation('This link is not valid');
  const pending = await previewSlackLinkRequest(getNeonDb(), token);
  if (!pending) throw createError.notFound(EXPIRED_LINK);

  const preview: SlackLinkPreview = {
    teamName: pending.teamName,
    expiresAt: pending.expiresAt,
    workspaceName: await readWorkspaceName(db, userId, organizationId),
    planAllowed: await slackPlanAllowed(db, userId, organizationId),
    requiredPlans: slackRequiredPlans(),
  };
  return NextResponse.json(preview);
}

async function handleConfirm(request: NextRequest): Promise<NextResponse> {
  const { db, userId, organizationId } = await getUserScopedDb(request, {
    resolveOrganization: true,
  });
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'slack-link', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const origin = slackAppOrigin();
  if (!origin || !isSlackAppConfigured()) {
    throw createError.serviceUnavailable('AGI Workforce in Slack is not available right now');
  }
  const parsed = ConfirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isSlackLinkToken(parsed.data.token)) {
    throw createError.validation('This link is not valid');
  }
  if (!(await slackPlanAllowed(db, userId, organizationId))) {
    throw createError.forbidden(
      `AGI Workforce in Slack is available on ${slackRequiredPlans()} plans.`,
    );
  }

  const serviceDb = getNeonDb();
  const pending = await consumeSlackLinkRequest(serviceDb, parsed.data.token);
  if (!pending) throw createError.notFound(EXPIRED_LINK);
  const installation = await findSlackInstallationById(serviceDb, pending.installationId);
  if (!installation) throw createError.notFound(EXPIRED_LINK);

  const profile = await readSlackUser(installation.botToken, pending.slackUserId).catch(
    (error: unknown) => {
      logger.warn({ error, teamId: installation.teamId }, 'Slack profile was unreadable at link');
      return null;
    },
  );
  let linkId: string;
  try {
    linkId = await linkSlackAccount(db, {
      userId,
      organizationId,
      installationId: installation.id,
      slackUserId: pending.slackUserId,
      slackUserName: profile?.displayName ?? null,
    });
  } catch (error) {
    if (error instanceof SlackLinkConflictError) throw createError.conflict(error.message);
    throw error;
  }

  await recordAuditEvent({
    userId,
    eventType: 'identity_linked',
    request,
    endpoint: ENDPOINT,
    organizationId,
    detail: {
      resourceType: 'slack_account',
      resourceId: linkId,
      resourceName: installation.teamName,
      provider: 'slack',
      subjectRef: `${installation.teamId}:${pending.slackUserId}`,
    },
  });

  const welcome = linkedMessage(slackSettingsUrl(origin));
  await postSlackMessage(installation.botToken, {
    channel: pending.slackUserId,
    text: welcome.text,
    blocks: welcome.blocks,
  }).catch((error: unknown) => {
    logger.warn({ error, teamId: installation.teamId }, 'Slack link confirmation was not sent');
  });

  return NextResponse.json({ linked: true, teamName: installation.teamName });
}

export const GET = withErrorHandler(handlePreview);
export const POST = withErrorHandler(handleConfirm);
