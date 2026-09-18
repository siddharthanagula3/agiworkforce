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

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  automationRunDiagnostics,
  recordAutomationOutcomes,
  type AutomationDiagnostics,
} from '@/lib/observability/automation-telemetry';

const MAX_BATCH = 200;
const MAX_TEXT = 300;
const MAX_TARGET = 300;

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
  /** An origin or an app bundle id. A path or a query string is not one. */
  target: z.string().max(MAX_TARGET).nullish(),
  profileId: z.string().max(128).nullish(),
});

const IngestSchema = z.object({
  outcomes: z.array(ReportSchema).min(1).max(MAX_BATCH),
});

type Report = z.infer<typeof ReportSchema>;

/**
 * An origin, never a page. A caller that sends a full URL has its path and
 * query dropped here rather than in whatever reads the trail later.
 */
function auditTarget(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin;
  } catch {
    // Not a URL: an app bundle id or a window name, kept as sent.
  }
  return value.slice(0, MAX_TARGET);
}

const INSERT_RECEIPTS = `
  insert into automation_audit_events (
    user_id, organization_id, run_id, device_id, surface, action, target,
    session_kind, profile_id, status, reason, verified, verification_check,
    verification_passed, started_at, settled_at, duration_ms
  )
  select $1, $2::uuid, row.run_id, row.device_id, row.surface, row.action, row.target,
         row.session_kind, row.profile_id, row.status, row.reason, row.verified,
         row.verification_check, row.verification_passed,
         to_timestamp(row.started_at_ms / 1000.0), to_timestamp(row.settled_at_ms / 1000.0),
         row.duration_ms
    from jsonb_to_recordset($3::jsonb) as row(
      run_id text, device_id text, surface text, action text, target text,
      session_kind text, profile_id text, status text, reason text, verified boolean,
      verification_check text, verification_passed boolean,
      started_at_ms bigint, settled_at_ms bigint, duration_ms integer
    )`;

function receiptRow(outcome: AutomationOutcome, report: Report): Record<string, unknown> {
  return {
    run_id: outcome.runId,
    device_id: outcome.deviceId,
    surface: outcome.surface,
    action: outcome.action,
    target: auditTarget(report.target),
    session_kind: outcome.sessionKind,
    profile_id: report.profileId ?? null,
    status: outcome.status,
    reason: outcome.reason.slice(0, MAX_TEXT),
    verified: outcome.verified,
    verification_check: outcome.verification?.check ?? null,
    verification_passed: outcome.verification?.passed ?? null,
    started_at_ms: outcome.startedAtMs,
    settled_at_ms: outcome.settledAtMs,
    duration_ms: outcome.durationMs,
  };
}

/**
 * The trail is written before the response, and a write that fails takes the
 * request with it: an action nobody can account for afterwards is the defect
 * this route exists to close.
 */
async function writeReceipts(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.query(INSERT_RECEIPTS, [userId, organizationId, JSON.stringify(rows)]);
}

/** One enterprise audit event per run, which is what a SIEM reads. */
async function streamRunToAudit(
  request: NextRequest,
  userId: string,
  organizationId: string | null,
  surface: string,
  diagnostics: AutomationDiagnostics,
): Promise<void> {
  const { summary } = diagnostics;
  const failed = summary.failed > 0 || summary.refused > 0;
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: surface === 'desktop' ? 'computer_use_action' : 'browser_action',
    outcome: summary.failed > 0 ? 'failure' : summary.refused > 0 ? 'denied' : 'success',
    severity: failed ? 'warning' : 'info',
    request,
    surface,
    detail: {
      resourceType: 'automation_run',
      resourceId: diagnostics.runId,
      count: summary.total,
      status: `${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.refused} refused, ${summary.unverified} unverified`,
      ...(diagnostics.lastFailureReason ? { reason: diagnostics.lastFailureReason } : {}),
    },
  });
}

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

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const parsed = IngestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid automation outcome payload', parsed.error.flatten());
  }

  const reports = parsed.data.outcomes;
  const outcomes = reports.map(settle);

  await writeReceipts(
    db,
    userId,
    organizationId,
    outcomes.map((outcome, index) => receiptRow(outcome, reports[index] as Report)),
  );

  const accepted = recordAutomationOutcomes(outcomes);
  const summary = summarizeAutomationOutcomes(outcomes);

  for (const runId of new Set(outcomes.map((outcome) => outcome.runId))) {
    const forRun = outcomes.filter((outcome) => outcome.runId === runId);
    const diagnostics = automationRunDiagnostics(runId, forRun);
    logger.info({ userId, ...diagnostics }, 'Automation run outcomes recorded');
    await streamRunToAudit(
      request,
      userId,
      organizationId,
      forRun[0]?.surface ?? 'extension',
      diagnostics,
    );
  }

  return NextResponse.json({ accepted, summary });
}

export const POST = withErrorHandler(handlePost);
