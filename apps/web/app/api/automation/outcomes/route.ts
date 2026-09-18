import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AUTOMATION_SURFACES,
  BROWSER_SESSION_KINDS,
  settleAutomationAttempt,
  startAutomationAttempt,
  summarizeAutomationOutcomes,
  type AutomationOutcome,
} from '@agiworkforce/types';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  automationRunDiagnostics,
  recordAutomationOutcomes,
} from '@/lib/observability/automation-telemetry';

const MAX_BATCH = 200;
const MAX_TEXT = 300;

const VerificationSchema = z.object({
  check: z.string().min(1).max(MAX_TEXT),
  passed: z.boolean(),
  observed: z.string().max(MAX_TEXT).optional(),
});

/**
 * A success is not a field a client may set. It sends the check it ran and the
 * server settles the attempt, so a surface that never looked at its result
 * cannot report one.
 */
const ReportSchema = z.object({
  runId: z.string().min(1).max(128),
  action: z.string().min(1).max(120),
  surface: z.enum(AUTOMATION_SURFACES),
  deviceId: z.string().max(128).nullish(),
  sessionKind: z.enum(BROWSER_SESSION_KINDS).nullish(),
  startedAtMs: z.number().int().nonnegative(),
  settledAtMs: z.number().int().nonnegative(),
  claim: z.enum(['succeeded', 'refused', 'failed']),
  reason: z.string().max(MAX_TEXT).optional(),
  verification: VerificationSchema.optional(),
});

const IngestSchema = z.object({
  outcomes: z.array(ReportSchema).min(1).max(MAX_BATCH),
});

type Report = z.infer<typeof ReportSchema>;

function settle(report: Report): AutomationOutcome {
  const attempt = startAutomationAttempt({
    runId: report.runId,
    action: report.action,
    surface: report.surface,
    deviceId: report.deviceId ?? null,
    sessionKind: report.sessionKind ?? null,
    startedAtMs: report.startedAtMs,
  });

  if (report.claim === 'succeeded') {
    return settleAutomationAttempt(
      attempt,
      {
        claim: 'succeeded',
        verification: report.verification ?? {
          check: 'no post-action check was reported',
          passed: false,
        },
      },
      report.settledAtMs,
    );
  }

  return settleAutomationAttempt(
    attempt,
    { claim: report.claim, reason: report.reason ?? 'No reason was reported.' },
    report.settledAtMs,
  );
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getUserScopedDb(request);

  const parsed = IngestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid automation outcome payload', parsed.error.flatten());
  }

  const outcomes = parsed.data.outcomes.map(settle);
  const accepted = recordAutomationOutcomes(outcomes);
  const summary = summarizeAutomationOutcomes(outcomes);

  for (const runId of new Set(outcomes.map((outcome) => outcome.runId))) {
    logger.info(
      {
        userId,
        ...automationRunDiagnostics(
          runId,
          outcomes.filter((outcome) => outcome.runId === runId),
        ),
      },
      'Automation run outcomes recorded',
    );
  }

  return NextResponse.json({ accepted, summary });
}

export const POST = withErrorHandler(handlePost);
