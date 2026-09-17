import 'server-only';

import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { deleteProjectKnowledgeObject } from '@/lib/server/project-knowledge-object-storage';
import {
  eraseScheduledAccount,
  reEraseTombstonedAccount,
} from '@/lib/server/scheduled-account-erasure';
import { drainAuditDestination } from '@/lib/services/audit-streaming-service';
import { sendScheduleCompletionEmail } from '@/lib/services/notification-email-service';
import { recordResearchReportSettledCost } from '@/lib/services/research-report-service';
import {
  loadSchedulePreferences,
  notifyScheduleCompleted,
} from '@/lib/services/schedule-notification-service';
import { fireEventTriggerJob } from '@/lib/triggers/trigger-fire';

import type { JobHandlerContext, JobHandlerRegistry } from './job-drain';
import { PermanentJobError, enqueueJob } from './job-service';

type ScheduleNoticeStatus = 'success' | 'failed' | 'timeout';

interface ScheduleNoticePayload {
  taskId: string;
  taskName: string;
  status: ScheduleNoticeStatus;
  runId: string;
}

function requireAccount(context: JobHandlerContext): string {
  if (!context.job.userId) throw new PermanentJobError('This job carries no account to act for');
  return context.job.userId;
}

function readScheduleNotice(payload: Record<string, unknown>): ScheduleNoticePayload {
  const taskId = typeof payload['taskId'] === 'string' ? payload['taskId'] : '';
  const runId = typeof payload['runId'] === 'string' ? payload['runId'] : '';
  const taskName = typeof payload['taskName'] === 'string' ? payload['taskName'] : '';
  const status = payload['status'];
  if (!taskId || !runId || (status !== 'success' && status !== 'failed' && status !== 'timeout')) {
    throw new PermanentJobError('Schedule notification payload is malformed');
  }
  return { taskId, runId, taskName, status };
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
    await enqueueJob(context.db, {
      kind: 'email.schedule-completed',
      userId,
      organizationId: context.job.organizationId,
      idempotencyKey: `schedule-email:${notice.runId}`,
      payload: { ...notice },
    });
    emailQueued = true;
  }

  const delivered = await notifyScheduleCompleted(
    scopedDb,
    { userId, ...notice },
    { email: false },
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

export const BACKGROUND_JOB_HANDLERS: JobHandlerRegistry = {
  'notifications.schedule-completed': announceScheduleCompletion,
  'email.schedule-completed': sendScheduleCompletionEmailJob,
  'webhooks.audit-stream-delivery': deliverAuditStream,
  'data-deletion.scheduled-account-erasure': eraseAccountOnSchedule,
  'file-processing.purge-upload-object': purgeUploadObject,
  'research.settle-report-cost': settleResearchReportCost,
  'event-triggers.fire': fireEventTriggerJob,
};
