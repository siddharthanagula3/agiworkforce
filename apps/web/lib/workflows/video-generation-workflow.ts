import 'server-only';

import { getWorkflowMetadata, sleep } from 'workflow';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  attachVideoGenerationWorkflow,
  getVideoGenerationJobForSystem,
  reconcileVideoGenerationBillingSettlement,
  recoverVideoProviderTaskAttachment,
  type VideoGenerationJob,
} from '@/lib/server/video-generation-jobs';
import { reconcileVideoGenerationJobWithRequiredTranscript } from '@/lib/services/video-job-reconciliation-service';
import { deliverPendingVideoIncidentAlert } from '@/lib/services/video-incident-alert-service';
import { VIDEO_PROVIDER_TASK_ATTACHMENT_GRACE_MS } from './video-generation-timing';

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_SUBMISSION_GRACE_MS = 2 * 60 * 1_000;
const PROVIDER_TASK_ATTACHMENT_RETRY_MS = 5_000;
const PROVIDER_TASK_ATTACHMENT_RECOVERY_MARGIN_MS = 3 * 60 * 1_000;
const PROVIDER_TASK_ATTACHMENT_RECOVERY_ATTEMPTS = Math.ceil(
  (VIDEO_PROVIDER_TASK_ATTACHMENT_GRACE_MS + PROVIDER_TASK_ATTACHMENT_RECOVERY_MARGIN_MS) /
    PROVIDER_TASK_ATTACHMENT_RETRY_MS,
);

export interface VideoGenerationWorkflowInput {
  version: 1;
  jobId: string;
  startedAtEpochMs: number;
}

export interface VideoGenerationWorkflowStepResult {
  terminal: boolean;
  status: VideoGenerationJob['status'] | 'missing' | 'detached' | 'unavailable';
  retryAfterSeconds: number;
}

export interface VideoProviderTaskAttachmentWorkflowInput {
  version: 1;
  jobId: string;
  providerTaskId: string;
}

export type VideoProviderTaskAttachmentStepResult = 'attached' | 'retry' | 'terminal';

function parseInput(value: VideoGenerationWorkflowInput): VideoGenerationWorkflowInput {
  if (
    value.version !== 1 ||
    !JOB_ID_PATTERN.test(value.jobId) ||
    !Number.isSafeInteger(value.startedAtEpochMs) ||
    value.startedAtEpochMs <= 0
  ) {
    throw new Error('Invalid durable video workflow input.');
  }
  return value;
}

function parseAttachmentInput(
  value: VideoProviderTaskAttachmentWorkflowInput,
): VideoProviderTaskAttachmentWorkflowInput {
  if (
    value.version !== 1 ||
    !JOB_ID_PATTERN.test(value.jobId) ||
    value.providerTaskId.length < 1 ||
    value.providerTaskId.length > 512
  ) {
    throw new Error('Invalid durable video provider-task attachment input.');
  }
  return value;
}

function isTerminal(status: VideoGenerationJob['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'outcome_unknown';
}

function nextDelaySeconds(job: VideoGenerationJob): number {
  const untilDue = Math.ceil((new Date(job.nextAttemptAt).getTime() - Date.now()) / 1_000);
  return Math.max(5, Math.min(Number.isFinite(untilDue) ? untilDue : 10, 600));
}

/**
 * One idempotent Node.js step. Provider submission deliberately remains in the
 * request boundary and is never a retrying Workflow step because neither Veo
 * nor Runway proves provider-side generation idempotency. Polling, rehosting,
 * and settlement are DB-claimed/idempotent and may safely resume here.
 */
export async function reconcileVideoGenerationWorkflowStep(
  rawInput: VideoGenerationWorkflowInput,
  workflowRunId: string,
): Promise<VideoGenerationWorkflowStepResult> {
  'use step';

  const input = parseInput(rawInput);
  const db = getNeonDb();
  let snapshot: VideoGenerationJob | null;
  try {
    snapshot = await getVideoGenerationJobForSystem(db, input.jobId);
  } catch {
    return { terminal: false, status: 'unavailable', retryAfterSeconds: 5 };
  }
  if (!snapshot) {
    return Date.now() - input.startedAtEpochMs < PROVIDER_SUBMISSION_GRACE_MS
      ? { terminal: false, status: 'missing', retryAfterSeconds: 5 }
      : { terminal: true, status: 'missing', retryAfterSeconds: 0 };
  }
  if (snapshot.workflowRunId && snapshot.workflowRunId !== workflowRunId) {
    // A start whose DB attachment failed is cancelled by the starter. If that
    // cancellation response was lost, this guard still prevents a detached or
    // superseded run from owning provider/billing work.
    return { terminal: true, status: 'detached', retryAfterSeconds: 0 };
  }
  if (!snapshot.workflowRunId) {
    // `start()` enqueues before the request can attach the returned run id.
    // A first step may therefore observe NULL even on the healthy path. Wait
    // only through the bounded pre-egress handoff; provider submission is
    // forbidden in SQL until a run id is attached.
    try {
      snapshot = await attachVideoGenerationWorkflow({
        db,
        jobId: snapshot.id,
        userId: snapshot.userId,
        workflowRunId,
      });
    } catch {
      if (Date.now() - input.startedAtEpochMs < PROVIDER_SUBMISSION_GRACE_MS) {
        return { terminal: false, status: snapshot.status, retryAfterSeconds: 5 };
      }
      return { terminal: true, status: 'detached', retryAfterSeconds: 0 };
    }
  }
  if (isTerminal(snapshot.status)) {
    if (snapshot.billingSettlementStatus === 'pending') {
      try {
        snapshot = (await reconcileVideoGenerationBillingSettlement(db, snapshot.id)) ?? snapshot;
      } catch {
        return { terminal: false, status: 'unavailable', retryAfterSeconds: 60 };
      }
      if (snapshot.billingSettlementStatus === 'pending') {
        return { terminal: false, status: snapshot.status, retryAfterSeconds: 60 };
      }
    }
    try {
      snapshot = await reconcileVideoGenerationJobWithRequiredTranscript(db, snapshot);
    } catch {
      // Terminal provider/billing state is already durable. Keep Workflow alive
      // so the next step retries the idempotent assistant-row projection only.
      return { terminal: false, status: 'unavailable', retryAfterSeconds: 60 };
    }
    if (snapshot.incidentAlertStatus === 'exhausted') {
      return { terminal: true, status: snapshot.status, retryAfterSeconds: 0 };
    }
    if (!(await deliverPendingVideoIncidentAlert(db, snapshot))) {
      return { terminal: false, status: snapshot.status, retryAfterSeconds: 60 };
    }
    return { terminal: true, status: snapshot.status, retryAfterSeconds: 0 };
  }

  // The workflow is attached before provider egress. Give the request boundary
  // time to persist its pre-egress marker/task identity; if that request died,
  // the shared reconciler will then settle the genuinely unstarted job failed.
  if (
    snapshot.status === 'submitting' &&
    !snapshot.providerStartedAt &&
    Date.now() - new Date(snapshot.createdAt).getTime() < PROVIDER_SUBMISSION_GRACE_MS
  ) {
    return { terminal: false, status: snapshot.status, retryAfterSeconds: 5 };
  }

  let reconciled: VideoGenerationJob;
  try {
    reconciled = await reconcileVideoGenerationJobWithRequiredTranscript(db, snapshot);
  } catch {
    // This includes a post-finalization transcript projection failure. The next
    // step re-reads the terminal row and cannot replay provider/billing work.
    return { terminal: false, status: 'unavailable', retryAfterSeconds: 60 };
  }
  if (isTerminal(reconciled.status) && reconciled.billingSettlementStatus === 'pending') {
    return { terminal: false, status: reconciled.status, retryAfterSeconds: 60 };
  }
  if (isTerminal(reconciled.status) && reconciled.incidentAlertStatus === 'exhausted') {
    return { terminal: true, status: reconciled.status, retryAfterSeconds: 0 };
  }
  if (isTerminal(reconciled.status) && !(await deliverPendingVideoIncidentAlert(db, reconciled))) {
    return { terminal: false, status: reconciled.status, retryAfterSeconds: 60 };
  }
  if (!isTerminal(reconciled.status) && reconciled.incidentAlertStatus === 'pending') {
    await deliverPendingVideoIncidentAlert(db, reconciled);
  }
  return {
    terminal: isTerminal(reconciled.status),
    status: reconciled.status,
    retryAfterSeconds: isTerminal(reconciled.status) ? 0 : nextDelaySeconds(reconciled),
  };
}

/**
 * Idempotent recovery step for the narrow provider-accepted/DB-attach window.
 * The provider id is serialized in Workflow's event log before the request
 * reports success, so process loss cannot erase the only copy of that id.
 */
export async function recoverVideoProviderTaskAttachmentWorkflowStep(
  rawInput: VideoProviderTaskAttachmentWorkflowInput,
): Promise<VideoProviderTaskAttachmentStepResult> {
  'use step';

  const input = parseAttachmentInput(rawInput);
  try {
    const db = getNeonDb();
    const snapshot = await getVideoGenerationJobForSystem(db, input.jobId);
    if (!snapshot || isTerminal(snapshot.status)) {
      return 'terminal';
    }
    if (snapshot.providerTaskId) {
      return snapshot.providerTaskId === input.providerTaskId ? 'attached' : 'terminal';
    }
    await recoverVideoProviderTaskAttachment({
      db,
      jobId: input.jobId,
      userId: snapshot.userId,
      providerTaskId: input.providerTaskId,
    });
    return 'attached';
  } catch {
    // Database attachment is idempotent. Keep the provider identity in the
    // durable workflow and retry without ever submitting provider work again.
    return 'retry';
  }
}

/** Durable no-client owner for one paid asynchronous video job. */
export async function videoGenerationWorkflow(input: VideoGenerationWorkflowInput): Promise<void> {
  'use workflow';

  const workflowRunId = getWorkflowMetadata().workflowRunId;
  for (;;) {
    const result = await reconcileVideoGenerationWorkflowStep(input, workflowRunId);
    if (result.terminal) return;
    await sleep(result.retryAfterSeconds * 1_000);
  }
}

/**
 * Durable handoff for a known provider id that could not be written in the
 * request. This workflow performs no provider egress; all retries are safe DB
 * attachment attempts. The primary workflow closes an unrecovered job as
 * outcome_unknown after its longer bounded attachment grace.
 */
export async function videoProviderTaskAttachmentWorkflow(
  input: VideoProviderTaskAttachmentWorkflowInput,
): Promise<void> {
  'use workflow';

  for (let attempt = 0; attempt < PROVIDER_TASK_ATTACHMENT_RECOVERY_ATTEMPTS; attempt += 1) {
    const result = await recoverVideoProviderTaskAttachmentWorkflowStep(input);
    if (result !== 'retry') return;
    await sleep(PROVIDER_TASK_ATTACHMENT_RETRY_MS);
  }
}
