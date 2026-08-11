import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import {
  claimVideoIncidentAlert,
  claimVideoSettlementIncidentById,
  claimVideoSettlementIncidentByReservation,
  completeVideoIncidentAlert,
  completeVideoSettlementIncident,
  countExhaustedVideoIncidentAlerts,
  countExhaustedVideoSettlementIncidentAlerts,
  getVideoGenerationJobForSystem,
  getVideoSettlementIncident,
  listPendingVideoIncidentAlertIds,
  listPendingVideoSettlementIncidentIds,
  type VideoGenerationJob,
  type VideoSettlementIncident,
} from '@/lib/server/video-generation-jobs';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

/**
 * Alert the monitored support channel when a video billing settlement is
 * immediately terminal. Pending settlements remain owned by the normal credit
 * reconciler; succeeded settlements need no human. No user identifiers or
 * amounts leave the database in this operational alert.
 */
export async function deliverPendingVideoIncidentAlert(
  db: DatabaseAdapter,
  job: VideoGenerationJob,
): Promise<boolean> {
  if (job.incidentAlertStatus === 'exhausted') return false;
  if (job.incidentAlertStatus !== 'pending') return true;

  const claimToken = randomUUID();
  const claimed = await claimVideoIncidentAlert({ db, jobId: job.id, claimToken });
  if (!claimed) {
    // A concurrent owner may have completed delivery between the caller's
    // snapshot and this claim. Only a durable delivered marker is success.
    const current = await getVideoGenerationJobForSystem(db, job.id);
    return current?.incidentAlertStatus === 'delivered';
  }

  const environment = environmentLabel();
  const observedAt = claimed.terminalAt ?? claimed.updatedAt;
  const incidentDescription =
    claimed.status === 'submitting' ||
    claimed.status === 'queued' ||
    claimed.status === 'processing'
      ? 'A durable video provider task remained active beyond the escalation window. It is still being polled and has not been refunded or abandoned.'
      : claimed.status === 'outcome_unknown'
        ? 'A durable video provider outcome could not be verified. The job remains recorded for provider-cost review.'
        : 'A durable video job reached a terminal credit-settlement state.';
  const text = [
    `Environment: ${environment}`,
    `Recorded at: ${observedAt}`,
    `Incident job id: ${claimed.id}`,
    '',
    incidentDescription,
    'The provider/job incident remains recorded in video_generation_jobs.',
    '',
    'NEXT STEP',
    `select id, status, provider, provider_failure_code, billing_outcome, billing_settlement_status, incident_alert_status, incident_alert_last_error from public.video_generation_jobs where id = '${claimed.id}'::uuid;`,
  ].join('\n');
  const sent = await sendSupportEmail({
    to: getHandoffConfig().fallbackEmail,
    subject: `[AGI WARNING] ${environment} video billing settlement requires review`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${text}</pre>`,
    idempotencyKey: `video-billing:${job.id}`,
  });

  const error = sent.delivered ? undefined : `${sent.reason}: ${sent.detail}`;
  let recorded: VideoGenerationJob | null = null;
  try {
    recorded = await completeVideoIncidentAlert({
      db,
      jobId: job.id,
      claimToken,
      delivered: sent.delivered,
      ...(error ? { error } : {}),
    });
  } catch (recordError) {
    // If the commit succeeded but its response was lost, the row is the source
    // of truth. A provider idempotency key protects the subsequent retry when
    // the write definitely did not commit.
    const current = await getVideoGenerationJobForSystem(db, job.id).catch(() => null);
    if (sent.delivered && current?.incidentAlertStatus === 'delivered') return true;
    logger.error(
      {
        event: 'video_billing_incident_alert_marker_failed',
        jobId: job.id,
        error: recordError instanceof Error ? recordError.message : String(recordError),
      },
      'Video billing incident alert marker could not be recorded',
    );
    return false;
  }
  if (!sent.delivered) {
    logger.error(
      { event: 'video_billing_incident_alert_undeliverable', jobId: job.id, reason: sent.reason },
      'Video billing incident alert could not be delivered',
    );
  }
  if (sent.delivered && recorded?.incidentAlertStatus !== 'delivered') {
    logger.error(
      { event: 'video_billing_incident_alert_delivery_unrecorded', jobId: job.id },
      'Video billing incident alert was delivered but its marker was not recorded',
    );
  }
  return sent.delivered && recorded?.incidentAlertStatus === 'delivered';
}

export interface VideoIncidentAlertSweepSummary {
  found: number;
  delivered: number;
  pending: number;
  exhausted: number;
}

async function deliverClaimedVideoSettlementIncident(
  db: DatabaseAdapter,
  incident: VideoSettlementIncident,
  claimToken: string,
): Promise<boolean> {
  const environment = environmentLabel();
  const text = [
    `Environment: ${environment}`,
    `Recorded at: ${incident.completedAt ?? 'unknown'}`,
    `Incident settlement id: ${incident.id}`,
    '',
    'A video reservation reached terminal credit settlement without another durable alert owner.',
    'The incident remains recorded in credit_settlement_jobs.',
    '',
    'NEXT STEP',
    `select id, status, last_error_code, last_error, video_incident_alert_status, video_incident_alert_last_error from public.credit_settlement_jobs where id = '${incident.id}'::uuid;`,
  ].join('\n');
  const sent = await sendSupportEmail({
    to: getHandoffConfig().fallbackEmail,
    subject: `[AGI WARNING] ${environment} video reservation settlement requires review`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${text}</pre>`,
    idempotencyKey: `video-billing-settlement:${incident.id}`,
  });
  const error = sent.delivered ? undefined : `${sent.reason}: ${sent.detail}`;

  let recorded: VideoSettlementIncident | null = null;
  try {
    recorded = await completeVideoSettlementIncident({
      db,
      incidentId: incident.id,
      claimToken,
      delivered: sent.delivered,
      ...(error ? { error } : {}),
    });
  } catch (recordError) {
    const current = await getVideoSettlementIncident(db, incident.id).catch(() => null);
    if (sent.delivered && current?.alertStatus === 'delivered') return true;
    logger.error(
      {
        event: 'video_orphan_settlement_alert_marker_failed',
        incidentId: incident.id,
        error: recordError instanceof Error ? recordError.message : String(recordError),
      },
      'Video reservation incident alert marker could not be recorded',
    );
    return false;
  }

  if (!sent.delivered) {
    logger.error(
      { event: 'video_orphan_settlement_alert_undeliverable', incidentId: incident.id },
      'Video reservation incident alert could not be delivered',
    );
  }
  return sent.delivered && recorded?.alertStatus === 'delivered';
}

export async function deliverVideoSettlementIncidentByReservation(input: {
  db: DatabaseAdapter;
  userId: string;
  idempotencyKey: string;
}): Promise<boolean> {
  const claimToken = randomUUID();
  const incident = await claimVideoSettlementIncidentByReservation({
    ...input,
    claimToken,
  });
  if (!incident) return false;
  return deliverClaimedVideoSettlementIncident(input.db, incident, claimToken);
}

async function deliverVideoSettlementIncidentById(
  db: DatabaseAdapter,
  incidentId: string,
): Promise<boolean> {
  const claimToken = randomUUID();
  const incident = await claimVideoSettlementIncidentById({ db, incidentId, claimToken });
  if (!incident) {
    const current = await getVideoSettlementIncident(db, incidentId);
    return current?.alertStatus === 'delivered';
  }
  return deliverClaimedVideoSettlementIncident(db, incident, claimToken);
}

/**
 * Daily safety-net owner for alerts whose primary Workflow never existed or
 * whose delivery path was temporarily unavailable. Missing pre-0105 schema is
 * an empty queue; once the table exists, a malformed/inaccessible schema is a
 * real failure and propagates to the scheduler.
 */
export async function deliverDueVideoIncidentAlerts(
  db: DatabaseAdapter,
  limit = 20,
): Promise<VideoIncidentAlertSweepSummary> {
  // Resend may consume two 10-second attempts per alert. Keep one total send
  // per invocation so this safety net fits the shortest deployed function
  // budget, and prioritize pre-job settlements because no primary Workflow
  // owns them. Attempt-count ordering in the repository prevents one failing
  // oldest incident from starving newer obligations.
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 1));
  const settlementIds = await listPendingVideoSettlementIncidentIds(db, boundedLimit);
  const ids =
    settlementIds.length < boundedLimit
      ? await listPendingVideoIncidentAlertIds(db, boundedLimit - settlementIds.length)
      : [];
  const exhausted =
    (await countExhaustedVideoIncidentAlerts(db)) +
    (await countExhaustedVideoSettlementIncidentAlerts(db));
  let delivered = 0;
  let pending = 0;

  for (const jobId of ids) {
    const job = await getVideoGenerationJobForSystem(db, jobId);
    if (!job) continue;
    if (job.incidentAlertStatus !== 'pending') continue;
    if (await deliverPendingVideoIncidentAlert(db, job)) delivered += 1;
    else pending += 1;
  }

  for (const incidentId of settlementIds) {
    if (await deliverVideoSettlementIncidentById(db, incidentId)) delivered += 1;
    else pending += 1;
  }

  return {
    found: ids.length + settlementIds.length + exhausted,
    delivered,
    pending,
    exhausted,
  };
}
