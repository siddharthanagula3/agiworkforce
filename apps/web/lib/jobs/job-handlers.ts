import 'server-only';

import { driveImageGenerationJob } from '@/app/api/media/image/lib/image-job-drain';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import {
  buildDataExportArchiveVolume,
  expireDataExportArchive,
  sendDataExportReadyEmailJob,
} from '@/lib/server/data-export-archive';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import {
  eraseScheduledAccount,
  reEraseTombstonedAccount,
} from '@/lib/server/scheduled-account-erasure';
import { drainAuditDestination } from '@/lib/services/audit-streaming-service';
import {
  deliverDeveloperWebhookJob,
  queueDeveloperWebhookEvent,
} from '@/lib/services/developer-webhook-service';
import { sendScheduleCompletionEmail } from '@/lib/services/notification-email-service';
import { recordResearchReportSettledCost } from '@/lib/services/research-report-service';
import {
  loadSchedulePreferences,
  notifyScheduleCompleted,
} from '@/lib/services/schedule-notification-service';
import { quietHoursEndFor } from '@/lib/services/quiet-hours-service';
import { fireEventTriggerJob } from '@/lib/triggers/trigger-fire';
import {
  DEVICE_REVOCATION_REASONS,
  revocationIsStale,
  sendRelayRevocation,
  type DeviceRevocationReason,
  type RegistrationSinceRevocation,
} from '@/lib/device-steps/device-registry';

import type { JobHandlerContext, JobHandlerRegistry } from './job-drain';
import { PermanentJobError, enqueueJob } from './job-service';

type ScheduleNoticeStatus = 'success' | 'failed' | 'timeout' | 'awaiting_approval';

interface ScheduleNoticePayload {
  taskId: string;
  taskName: string;
  status: ScheduleNoticeStatus;
  runId: string;
  approvalStep?: number;
  approvalSummary?: string;
}

const SCHEDULE_NOTICE_STATUSES: readonly ScheduleNoticeStatus[] = [
  'success',
  'failed',
  'timeout',
  'awaiting_approval',
];

function requireAccount(context: JobHandlerContext): string {
  if (!context.job.userId) throw new PermanentJobError('This job carries no account to act for');
  return context.job.userId;
}

function readScheduleNotice(payload: Record<string, unknown>): ScheduleNoticePayload {
  const taskId = typeof payload['taskId'] === 'string' ? payload['taskId'] : '';
  const runId = typeof payload['runId'] === 'string' ? payload['runId'] : '';
  const taskName = typeof payload['taskName'] === 'string' ? payload['taskName'] : '';
  const status = SCHEDULE_NOTICE_STATUSES.find((candidate) => candidate === payload['status']);
  if (!taskId || !runId || !status) {
    throw new PermanentJobError('Schedule notification payload is malformed');
  }
  const approvalStep = payload['approvalStep'];
  const approvalSummary = payload['approvalSummary'];
  return {
    taskId,
    runId,
    taskName,
    status,
    ...(typeof approvalStep === 'number' ? { approvalStep } : {}),
    ...(typeof approvalSummary === 'string' ? { approvalSummary } : {}),
  };
}

function scheduleNoticeKey(prefix: string, notice: ScheduleNoticePayload): string {
  return notice.status === 'awaiting_approval'
    ? `${prefix}:${notice.runId}:approval:${notice.approvalStep ?? 0}`
    : `${prefix}:${notice.runId}`;
}

function readString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new PermanentJobError(`Job payload is missing ${key}`);
  }
  return value.trim();
}

async function announceScheduleCompletion(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const userId = requireAccount(context);
  const notice = readScheduleNotice(context.job.payload);
  const scopedDb = createClaimedUserScopedDb(context.db, {
    userId,
    organizationId: context.job.organizationId,
  });

  const preferences = await loadSchedulePreferences(scopedDb, userId);
  let emailQueued = false;
  if (preferences.email && preferences.email_address) {
    const heldUntil = await quietHoursEndFor(scopedDb, userId);
    await enqueueJob(context.db, {
      kind: 'email.schedule-completed',
      userId,
      organizationId: context.job.organizationId,
      idempotencyKey: scheduleNoticeKey('schedule-email', notice),
      payload: { ...notice },
      ...(heldUntil ? { runAfter: heldUntil } : {}),
    });
    emailQueued = true;
  }

  const delivered = await notifyScheduleCompleted(
    scopedDb,
    { userId, ...notice },
    { email: false },
  );
  await queueDeveloperWebhookEvent(
    scopedDb,
    userId,
    notice.status === 'awaiting_approval'
      ? 'task_run.needs_approval'
      : notice.status === 'success'
        ? 'task_run.completed'
        : 'task_run.failed',
    {
      task_id: notice.taskId,
      task_name: notice.taskName,
      run_id: notice.runId,
      status: notice.status,
      ...(notice.approvalSummary ? { approval_summary: notice.approvalSummary } : {}),
    },
    { attemptAfterResponse: false },
  );
  return { pushed: delivered.pushed, emailQueued };
}

async function sendScheduleCompletionEmailJob(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const userId = requireAccount(context);
  const notice = readScheduleNotice(context.job.payload);
  const scopedDb = createClaimedUserScopedDb(context.db, {
    userId,
    organizationId: context.job.organizationId,
  });

  const preferences = await loadSchedulePreferences(scopedDb, userId);
  if (!preferences.email || !preferences.email_address) return { skipped: 'opted_out' };

  const result = await sendScheduleCompletionEmail({
    to: preferences.email_address,
    taskName: notice.taskName,
    status: notice.status,
    ...(notice.approvalSummary ? { approvalSummary: notice.approvalSummary } : {}),
  });
  if (result.delivered) return { delivered: true, providerMessageId: result.providerMessageId };
  if (result.reason === 'not_configured') return { skipped: 'not_configured' };
  if (result.reason === 'invalid_recipient' || result.reason === 'rejected') {
    throw new PermanentJobError(`The provider refused the message: ${result.detail}`);
  }
  throw new Error(`Schedule email could not be sent (${result.reason}): ${result.detail}`);
}

async function deliverAuditStream(context: JobHandlerContext): Promise<Record<string, unknown>> {
  const organizationId = context.job.organizationId;
  if (!organizationId) throw new PermanentJobError('Audit stream job carries no workspace');
  const result = await drainAuditDestination(context.db, organizationId);
  if (result.status === 'failed') {
    throw new Error(result.error ?? 'The destination did not accept the delivery');
  }
  return {
    delivered: result.delivered,
    status: result.status,
    ...(result.error ? { detail: result.error } : {}),
  };
}

async function eraseAccountOnSchedule(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const subjectUserId = readString(context.job.payload, 'subjectUserId');
  const mode = context.job.payload['mode'] === 'resweep' ? 'resweep' : 'scheduled';
  const result =
    mode === 'resweep'
      ? await reEraseTombstonedAccount(subjectUserId)
      : await eraseScheduledAccount(subjectUserId);
  if (result.status === 'failed') {
    throw new Error(`Account erasure stopped at the ${result.stage} stage: ${result.detail}`);
  }
  return { mode, ...result };
}

async function purgeUploadObject(context: JobHandlerContext): Promise<Record<string, unknown>> {
  const objectKey = readString(context.job.payload, 'objectKey');
  await deleteProjectKnowledgeObject(objectKey);
  return { objectKey, deleted: true };
}

async function settleResearchReportCost(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const userId = requireAccount(context);
  const requestId = readString(context.job.payload, 'requestId');
  const settledCostMicrousd = context.job.payload['settledCostMicrousd'];
  if (typeof settledCostMicrousd !== 'number' || !Number.isFinite(settledCostMicrousd)) {
    throw new PermanentJobError('Research settlement payload carries no cost');
  }
  const scopedDb = createClaimedUserScopedDb(context.db, {
    userId,
    organizationId: context.job.organizationId,
  });
  await recordResearchReportSettledCost(scopedDb, { userId, requestId, settledCostMicrousd });
  return { requestId, settledCostMicrousd };
}

/**
 * A device unlinked while the relay was down still holds a live socket; this
 * retries the relay's revoke until it answers.
 */
async function retryRelayRevocation(context: JobHandlerContext): Promise<Record<string, unknown>> {
  const deviceId = readString(context.job.payload, 'deviceId');
  const reason = readString(context.job.payload, 'reason');
  if (!(DEVICE_REVOCATION_REASONS as readonly string[]).includes(reason)) {
    throw new PermanentJobError('Device revocation job names no known reason');
  }
  const userId = requireAccount(context);
  const revokedAt =
    typeof context.job.payload['revokedAt'] === 'string'
      ? context.job.payload['revokedAt']
      : context.job.createdAt;
  // A retry can run hours later. A device re-paired since then must not be
  // revoked by the stale job, so the registry is read again first.
  const [registration] = await createClaimedUserScopedDb(context.db, {
    userId,
    organizationId: context.job.organizationId,
  }).query<RegistrationSinceRevocation>(
    `select remote_enabled, last_seen_at::text as last_seen_at
       from device_registrations
      where id = $1 and user_id = $2
      limit 1`,
    [deviceId, userId],
  );
  if (revocationIsStale(reason as DeviceRevocationReason, revokedAt, registration ?? null)) {
    return { deviceId, skipped: 'device re-paired since the revocation' };
  }
  const relay = await sendRelayRevocation(deviceId, reason as DeviceRevocationReason);
  if (!relay.configured) throw new PermanentJobError('The signaling relay is not configured');
  if (!relay.reachable) throw new Error('The signaling relay did not take the revoke');
  return { deviceId, closed: relay.closed };
}

export const BACKGROUND_JOB_HANDLERS: JobHandlerRegistry = {
  'webhooks.signaling-device-revoke': retryRelayRevocation,
  'notifications.schedule-completed': announceScheduleCompletion,
  'email.schedule-completed': sendScheduleCompletionEmailJob,
  'webhooks.audit-stream-delivery': deliverAuditStream,
  'webhooks.developer-delivery': deliverDeveloperWebhookJob,
  'data-deletion.scheduled-account-erasure': eraseAccountOnSchedule,
  'file-processing.purge-upload-object': purgeUploadObject,
  'research.settle-report-cost': settleResearchReportCost,
  'event-triggers.fire': fireEventTriggerJob,
  'media-generation.image-attempt': driveImageGenerationJob,
  'data-export.build-archive': buildDataExportArchiveVolume,
  'data-export.expire-archive': expireDataExportArchive,
  'email.data-export-ready': sendDataExportReadyEmailJob,
};
