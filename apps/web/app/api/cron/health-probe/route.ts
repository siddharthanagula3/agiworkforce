import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { runHealthChecks, type HealthCheckResult } from '@/lib/server/health-check';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

/**
 * GET /api/cron/health-probe
 *
 * The first thing in this repo that can reach a human when production breaks.
 *
 * `/api/health` was already correct and already public — and nothing called it.
 * A health endpoint nobody polls is a page nobody reads: the platform could
 * have been returning 503 for a week and the only way to find out was to open
 * the browser. This job polls it on the cron clock and turns a failing check
 * into a message that leaves the building.
 *
 * It calls `runHealthChecks()` DIRECTLY rather than fetching `/api/health`,
 * matching the /status page: building a self-request URL from request headers
 * is a Host-header SSRF vector (security review 2026-06-11), and a self-HTTP
 * hop would report the platform unhealthy for reasons of its own.
 *
 * # Where the alert goes
 *
 * The on-call vendor is an unmade decision (PagerDuty/Opsgenie/BetterStack —
 * ExecutionPlan §Founder 8), so this uses the one delivery channel the repo
 * already owns: the Resend transport, addressed to the support fallback
 * mailbox, which `lib/support/handoff/config.ts` already requires to be a
 * MONITORED mailbox. No new environment variable, and nothing to wire when the
 * vendor is picked beyond adding a second dispatch here.
 *
 * # It fails loudly, never quietly
 *
 * An alerting path that swallows its own delivery failure is worse than no
 * alerting, because it reports success while the incident goes unread. This
 * route returns 500 in two cases: an alert was OWED and could not be delivered,
 * and the probe could not run the health checks at all. In both, the Vercel
 * cron log carries a failed invocation, which is the last signal left once
 * email is gone.
 *
 * # A hang is an outage too
 *
 * `runHealthChecks()` talks to Neon and to Stripe on a default-configured
 * client (stripe-node waits 80s per attempt and then retries), so the single
 * most likely production outage — a dependency that stops answering rather than
 * refusing — would otherwise stall this function until the platform killed it,
 * before any mail was sent. The check is therefore raced against
 * HEALTH_CHECK_TIMEOUT_MS, the same guard /status already puts around the same
 * function, and a timeout pages as CRITICAL rather than ending the run.
 * `maxDuration` leaves room for the race plus the outbound send.
 *
 * # Detection latency is a day, and that is the plan constraint
 *
 * Registered in vercel.json at `15 6 * * *` — daily, because the Hobby plan
 * REJECTS the deploy outright for any sub-daily cron
 * (PROD-VERCEL-DEPLOY-TOPOLOGY-01). Minute-level detection has to come from an
 * external uptime monitor pointed at `/api/health`; see
 * docs/runbooks/incident-response.md. Tighten this to a five-minute cadence the
 * day the project moves to Pro.
 */

export const runtime = 'nodejs';

/**
 * Budget for the whole invocation: the health-check race, then up to one
 * outbound Resend POST with its retry. Sibling crons that do outbound work
 * declare one for the same reason (reclaim-sandboxes 300, run-schedules 60);
 * without it the route inherits the platform default.
 */
export const maxDuration = 30;

/**
 * Longer than /status's 4s — a page that renders late is a worse trade than an
 * alert that waits — but far short of stripe-node's 80s-per-attempt default, so
 * a hung dependency still leaves time to mail a human inside `maxDuration`.
 */
const HEALTH_CHECK_TIMEOUT_MS = 8_000;

const TIMED_OUT = Symbol('health-check-timeout');

type AlertSeverity = 'critical' | 'warning';

interface ProbeSummary {
  status: HealthCheckResult['status'] | 'probe_failed';
  /** Whether this run owed anyone an alert at all. */
  alerted: boolean;
  delivery: 'not_needed' | 'delivered' | 'undeliverable';
  severity?: AlertSeverity;
  /** Why delivery failed. Never carries the health payload or any credential. */
  reason?: string;
}

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

function failingChecks(result: HealthCheckResult): string[] {
  return Object.entries(result.checks)
    .filter(([, check]) => check.status !== 'healthy')
    .map(([name]) => name);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

/**
 * The one detail each check carries. `database` and `stripe` report a message;
 * `environment` deliberately reports only a COUNT of missing variables, never
 * their names (health-check.ts withholds the names as an information-disclosure
 * risk). Without this branch an environment failure — one of the two conditions
 * that make the platform unhealthy — arrived with no detail at all.
 */
function checkDetail(
  check: HealthCheckResult['checks'][keyof HealthCheckResult['checks']],
): string {
  if ('message' in check && check.message) {
    return ` (${check.message})`;
  }
  if ('missingCount' in check && check.missingCount) {
    return ` (${check.missingCount} required environment variable(s) missing)`;
  }
  return '';
}

/**
 * A body a woken human can act on without opening a dashboard: what broke,
 * where, when, and the runbook that says what to do next.
 *
 * `failed` is always non-empty: the only callers are the two probe-failure
 * paths, which pass a literal, and the degraded/unhealthy path, where
 * health-check.ts's own status derivation guarantees at least one failing check.
 */
function buildAlert(
  severity: AlertSeverity,
  result: HealthCheckResult,
  failed: string[],
): { subject: string; text: string; html: string } {
  const environment = environmentLabel();
  const subject = `[AGI ${severity === 'critical' ? 'CRITICAL' : 'WARNING'}] ${environment} health ${result.status} · ${failed.join(', ')}`;

  const lines = [
    `Environment: ${environment}`,
    `Overall status: ${result.status}`,
    `Observed at: ${result.timestamp}`,
    `Failing checks: ${failed.join(', ')}`,
    '',
    'CHECKS',
    ...Object.entries(result.checks).map(
      ([name, check]) => `- ${name}: ${check.status}${checkDetail(check)}`,
    ),
    '',
    severity === 'critical'
      ? 'CRITICAL means the platform cannot serve requests. Follow docs/runbooks/incident-response.md.'
      : 'WARNING means billing is degraded while chat keeps working. Follow docs/runbooks/incident-response.md.',
  ];
  const text = lines.join('\n');

  return {
    subject,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  };
}

async function dispatchAlert(
  severity: AlertSeverity,
  result: HealthCheckResult,
  failed: string[],
): Promise<ProbeSummary> {
  const { subject, text, html } = buildAlert(severity, result, failed);
  const sent = await sendSupportEmail({
    to: getHandoffConfig().fallbackEmail,
    subject,
    text,
    html,
  });

  if (sent.delivered) {
    logger.error({ severity, status: result.status, failed }, 'Health probe alert dispatched');
    return { status: result.status, alerted: true, delivery: 'delivered', severity };
  }

  logger.error(
    { severity, status: result.status, failed, reason: sent.reason },
    'Health probe alert could NOT be delivered · no human has been told',
  );
  return {
    status: result.status,
    alerted: true,
    delivery: 'undeliverable',
    severity,
    reason: sent.reason,
  };
}

/**
 * Bounds the check so a dependency that hangs — rather than refusing — cannot
 * run out the function's wall clock before an alert is sent. The timer is
 * cleared either way so a resolved race does not hold the invocation open.
 */
async function runHealthChecksWithTimeout(): Promise<HealthCheckResult | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runHealthChecks(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), HEALTH_CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * The probe could not measure the platform. That is an incident of its own —
 * an unmeasured platform is an unmonitored one — so it pages CRITICAL and
 * fails the cron run regardless of whether the mail got out.
 */
async function pageProbeFailure(cause: string): Promise<NextResponse> {
  const summary = await dispatchAlert(
    'critical',
    {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'unhealthy', message: 'not measured' },
        stripe: { status: 'unhealthy', message: 'not measured' },
        environment: { status: 'unhealthy' },
      },
    },
    [`health-probe (${cause})`],
  );
  return NextResponse.json(
    { ...summary, status: 'probe_failed' satisfies ProbeSummary['status'] },
    { status: 500 },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized health probe cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let result: HealthCheckResult;
  try {
    const raced = await runHealthChecksWithTimeout();
    if (raced === TIMED_OUT) {
      logger.error(
        { timeoutMs: HEALTH_CHECK_TIMEOUT_MS },
        'Health probe timed out running the health checks · a dependency is hanging',
      );
      return await pageProbeFailure(`timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`);
    }
    result = raced;
  } catch (error) {
    // runHealthChecks catches per-check failures itself, so reaching here means
    // the check harness ITSELF is broken — which is an incident of its own and
    // must page rather than end the run quietly.
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Health probe could not run the health checks',
    );
    return await pageProbeFailure('checks threw');
  }

  if (result.status === 'healthy') {
    return NextResponse.json({
      status: result.status,
      alerted: false,
      delivery: 'not_needed',
    } satisfies ProbeSummary);
  }

  // `degraded` is Stripe-only: billing is broken while chat keeps working, so it
  // notifies at a lower severity instead of paging a whole-platform outage —
  // the distinction lib/server/health-check.ts asks callers to preserve.
  const severity: AlertSeverity = result.status === 'unhealthy' ? 'critical' : 'warning';
  const summary = await dispatchAlert(severity, result, failingChecks(result));

  return NextResponse.json(summary, { status: summary.delivery === 'delivered' ? 200 : 500 });
}
