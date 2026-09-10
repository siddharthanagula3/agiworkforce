import 'server-only';

import { getWorkflowMetadata, sleep } from 'workflow';

import { VIDEO_PROVIDER_TASK_ATTACHMENT_GRACE_MS } from './video-generation-timing';
import {
  reconcileVideoGenerationWorkflowStep,
  recoverVideoProviderTaskAttachmentWorkflowStep,
  type VideoGenerationWorkflowInput,
  type VideoProviderTaskAttachmentWorkflowInput,
} from './steps/reconcile-video-generation';

export type {
  VideoGenerationWorkflowInput,
  VideoGenerationWorkflowStepResult,
  VideoProviderTaskAttachmentStepResult,
  VideoProviderTaskAttachmentWorkflowInput,
} from './steps/reconcile-video-generation';

const PROVIDER_TASK_ATTACHMENT_RETRY_MS = 5_000;
const PROVIDER_TASK_ATTACHMENT_RECOVERY_MARGIN_MS = 3 * 60 * 1_000;
const PROVIDER_TASK_ATTACHMENT_RECOVERY_ATTEMPTS = Math.ceil(
  (VIDEO_PROVIDER_TASK_ATTACHMENT_GRACE_MS + PROVIDER_TASK_ATTACHMENT_RECOVERY_MARGIN_MS) /
    PROVIDER_TASK_ATTACHMENT_RETRY_MS,
);

export async function videoGenerationWorkflow(input: VideoGenerationWorkflowInput): Promise<void> {
  'use workflow';

  const workflowRunId = getWorkflowMetadata().workflowRunId;
  for (;;) {
    const result = await reconcileVideoGenerationWorkflowStep(input, workflowRunId);
    if (result.terminal) return;
    await sleep(result.retryAfterSeconds * 1_000);
  }
}

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
