import {
  AUTOMATION_OUTCOME_MAX_BATCH,
  AUTOMATION_OUTCOME_MAX_REASON_CHARS,
  settleAutomationAttempt,
  type AutomationAttempt,
  type AutomationOutcome,
  type AutomationSettlement,
  type AutomationVerification,
} from '@agiworkforce/types';

import { deviceInstallId } from '../cloud-bridge/deviceHeartbeat';
import { FREE_TRIAL_GATEWAY, getAuthToken } from '../cloud-bridge/freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';
import { telemetryOrigin } from '../../background/policy';

export const AUTOMATION_OUTCOMES_PATH = '/api/automation/outcomes';
export const AUTOMATION_AUDIT_OUTBOX_KEY = 'agi_automation_audit_outbox';

/**
 * The batch the ingest accepts, mirrored by apps/desktop's outbox. The route
 * caps the array and the reason string itself, so a report that exceeds either
 * is rejected whole rather than truncated server side.
 */
export const AUTOMATION_AUDIT_BATCH_SIZE = AUTOMATION_OUTCOME_MAX_BATCH;
const REASON_MAX_CHARS = AUTOMATION_OUTCOME_MAX_REASON_CHARS;

/**
 * A receipt survives a service-worker restart because it is queued in
 * chrome.storage before the flush is attempted: an action nobody can account
 * for afterwards is exactly what the trail exists to prevent.
 */
export interface AutomationAuditReport {
  readonly eventId: string;
  readonly runId: string;
  readonly action: string;
  readonly surface: 'extension';
  readonly deviceId: string | null;
  readonly sessionKind: 'user-chrome';
  readonly startedAtMs: number;
  readonly settledAtMs: number;
  readonly claim: 'succeeded' | 'refused' | 'failed';
  readonly reason?: string;
  readonly verification?: AutomationVerification;
  readonly target: string | null;
}

export interface RecordedAutomationAction {
  readonly outcome: AutomationOutcome;
  readonly report: AutomationAuditReport;
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;

/**
 * A path or query names the page and can carry a token or a search; the trail
 * keeps which site, never which page, wherever a URL appears in a sentence.
 */
function withOriginsOnly(text: string): string {
  return text.replace(URL_IN_TEXT, (url) => telemetryOrigin(url) ?? '[url]');
}

function boundedReason(reason: string): string {
  return withOriginsOnly(reason).slice(0, REASON_MAX_CHARS);
}

/**
 * A check describes what was looked at; an observation is a structural fact
 * about the page, never its content. Page text reaching the trail would make a
 * compliance record into a transcript of everything the run read.
 */
function boundedVerification(verification: AutomationVerification): AutomationVerification {
  return {
    check: boundedReason(verification.check),
    passed: verification.passed,
    ...(verification.observed ? { observed: boundedReason(verification.observed) } : {}),
  };
}

export function buildAutomationAuditReport(
  attempt: AutomationAttempt,
  settlement: AutomationSettlement,
  input: { deviceId: string | null; target: string | null; eventId: string; nowMs?: number },
): RecordedAutomationAction {
  const outcome = settleAutomationAttempt(attempt, settlement, input.nowMs ?? Date.now());
  return {
    outcome,
    report: {
      eventId: input.eventId,
      runId: attempt.runId,
      action: attempt.action,
      surface: 'extension',
      deviceId: input.deviceId,
      sessionKind: 'user-chrome',
      startedAtMs: attempt.startedAtMs,
      settledAtMs: outcome.settledAtMs,
      claim: settlement.claim,
      ...(settlement.claim === 'succeeded'
        ? { verification: boundedVerification(settlement.verification) }
        : { reason: boundedReason(settlement.reason) }),
      target: telemetryOrigin(input.target),
    },
  };
}

async function readOutbox(): Promise<AutomationAuditReport[]> {
  try {
    const stored = await chrome.storage.local.get([AUTOMATION_AUDIT_OUTBOX_KEY]);
    const queued = stored[AUTOMATION_AUDIT_OUTBOX_KEY];
    return Array.isArray(queued) ? (queued as AutomationAuditReport[]) : [];
  } catch {
    return [];
  }
}

async function writeOutbox(reports: readonly AutomationAuditReport[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [AUTOMATION_AUDIT_OUTBOX_KEY]: reports });
  } catch {
    return;
  }
}

/**
 * The oldest receipts are dropped rather than the newest refused: a queue that
 * stopped accepting would make the trail silently stop at the moment a run went
 * wrong, which is the moment it is read for.
 */
async function enqueue(report: AutomationAuditReport): Promise<void> {
  const queued = await readOutbox();
  queued.push(report);
  await writeOutbox(queued.slice(-AUTOMATION_AUDIT_BATCH_SIZE));
}

export async function recordAutomationAction(
  attempt: AutomationAttempt,
  settlement: AutomationSettlement,
  target: string | null,
): Promise<AutomationOutcome> {
  const deviceId = await deviceInstallId().catch(() => null);
  const { outcome, report } = buildAutomationAuditReport(attempt, settlement, {
    deviceId,
    target,
    eventId: crypto.randomUUID(),
  });
  await enqueue(report);
  return outcome;
}

let flushing: Promise<boolean> | null = null;

async function postOutbox(
  reports: readonly AutomationAuditReport[],
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;
  const response = await fetchImpl(`${FREE_TRIAL_GATEWAY}${AUTOMATION_OUTCOMES_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    body: JSON.stringify({ outcomes: reports }),
  });
  if (!response.ok) return false;
  const body = (await response.json().catch(() => null)) as { accepted?: unknown } | null;
  return body?.accepted === reports.length;
}

/**
 * Receipts are removed only once the ingest confirms it took every one of them.
 * A partial accept leaves the queue intact, so a retry re-sends the batch and
 * the route's per-user unique key settles the duplicate.
 */
export function flushAutomationAuditOutbox(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  flushing ??= (async () => {
    const queued = await readOutbox();
    if (queued.length === 0) return true;
    const batch = queued.slice(0, AUTOMATION_AUDIT_BATCH_SIZE);
    const accepted = await postOutbox(batch, fetchImpl).catch(() => false);
    if (!accepted) return false;
    const remaining = (await readOutbox()).slice(batch.length);
    await writeOutbox(remaining);
    return true;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export function resetAutomationAuditFlushForTests(): void {
  flushing = null;
}
