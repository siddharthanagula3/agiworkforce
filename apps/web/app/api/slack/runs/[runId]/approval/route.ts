import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';

import {
  ManagedCloudScheduleRunApprovalSchema,
  ManagedCloudSlackRunDecisionSchema,
} from '@agiworkforce/cloud-contracts';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { SlackApprovalUnavailableError, claimSlackApproval } from '@/lib/slack/slack-assistant';
import { SlackRunApprovalError } from '@/lib/slack/slack-runs';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ENDPOINT = '/api/slack/runs/[runId]/approval';

type RouteContext = { params: Promise<{ runId: string }> };

async function handleDecision(request: NextRequest, context: RouteContext) {
  const { db, userId, organizationId } = await getUserScopedDb(request, {
    resolveOrganization: true,
  });
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;
  const rateLimitResponse = await withRateLimit(request, 'llm-completion', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const { runId } = await context.params;
  if (!z.string().uuid().safeParse(runId).success) {
    throw createError.validation('Name the Slack request to decide');
  }
  const parsed = ManagedCloudScheduleRunApprovalSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    throw createError.validation('An approval needs a decision and the tool calls it answers');
  }

  let resume: () => Promise<void>;
  try {
    resume = await claimSlackApproval({
      serviceDb: getNeonDb(),
      scopedDb: db,
      userId,
      runId,
      approval: parsed.data,
    });
  } catch (error) {
    if (error instanceof SlackRunApprovalError) {
      if (error.reason === 'not_found') throw createError.notFound(error.message);
      throw createError.conflict(error.message);
    }
    if (error instanceof SlackApprovalUnavailableError) throw createError.conflict(error.message);
    throw error;
  }

  await recordAuditEvent({
    userId,
    eventType: 'tool_approval_decided',
    request,
    endpoint: ENDPOINT,
    organizationId,
    detail: {
      resourceType: 'slack_run',
      resourceId: runId,
      status: parsed.data.decision,
      count: parsed.data.toolCallIds.length,
    },
  });

  after(resume);
  return NextResponse.json(
    ManagedCloudSlackRunDecisionSchema.parse({
      runId,
      decision: parsed.data.decision,
      status: 'resuming',
    }),
  );
}

export const POST = withErrorHandler(handleDecision);
