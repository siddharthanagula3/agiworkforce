import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  PluginSubmissionDecisionSchema,
  type PluginSubmissionReviewResponse,
} from '@agiworkforce/cloud-contracts';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordNotification } from '@/lib/services/notification-service';
import {
  decideSubmission,
  readSubmissionForReview,
} from '@/lib/services/plugin-submission-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().uuid() });
const DIRECTORY_SETTINGS_SECTION = 'capabilities';

type RouteContext = { params: Promise<{ id: string }> };

async function submissionId(context: RouteContext): Promise<string> {
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) throw createError.notFound('That submission does not exist.');
  return params.data.id;
}

async function handleGet(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'admin-operator');
  if (limited) return limited;
  await requirePlatformAdmin(request);

  const submission = await readSubmissionForReview(getNeonDb(), await submissionId(context));
  if (!submission) throw createError.notFound('That submission does not exist.');
  const body: PluginSubmissionReviewResponse = { submission };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

function outcomeCopy(action: 'approve' | 'reject' | 'suspend', name: string, note: string | null) {
  if (action === 'approve') {
    return {
      title: `${name} is in the plugin directory`,
      message: 'Your plugin was approved. Anyone can now find and install it.',
      severity: 'success' as const,
    };
  }
  return {
    title:
      action === 'reject' ? `${name} was not approved` : `${name} was taken out of the directory`,
    message: note ?? '',
    severity: 'warning' as const,
  };
}

async function handlePost(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf as NextResponse;
  const limited = await withRateLimit(request, 'admin-operator');
  if (limited) return limited;
  const operator = await requirePlatformAdmin(request);

  const decision = await readValidatedJsonBody(
    request,
    PluginSubmissionDecisionSchema,
    'Invalid review decision',
  );
  const db = getNeonDb();
  const decided = await decideSubmission(
    db,
    await submissionId(context),
    decision,
    operator.userId,
  );
  if (!decided) throw createError.notFound('That submission does not exist.');

  await recordAuditEvent({
    userId: operator.userId,
    eventType: 'plugin_marketplace_changed',
    request,
    severity: decision.action === 'approve' ? 'info' : 'warning',
    detail: {
      resourceType: 'plugin_submission',
      resourceId: decided.id,
      resourceName: decided.pluginKey,
      version: decided.version,
      targetUserId: decided.submitterId,
      status: decided.status,
    },
  });
  const copy = outcomeCopy(decision.action, decided.name, decided.reviewNote);
  await recordNotification(db, {
    userId: decided.submitterId,
    category: 'general',
    severity: copy.severity,
    title: copy.title,
    message: copy.message,
    target: { kind: 'settings', id: DIRECTORY_SETTINGS_SECTION },
    dedupeKey: `plugin-submission:${decided.id}:${decided.status}`,
  });
  return NextResponse.json({ submission: decided });
}

export const GET = withCorsRoute(withErrorHandler(handleGet));
export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
