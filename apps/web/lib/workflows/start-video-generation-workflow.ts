import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { start } from 'workflow/api';
import {
  attachVideoGenerationWorkflow,
  getVideoGenerationJob,
} from '@/lib/server/video-generation-jobs';
import {
  videoGenerationWorkflow,
  videoProviderTaskAttachmentWorkflow,
} from './video-generation-workflow';
import { VIDEO_WORKFLOW_START_DEADLINE_MS } from './video-generation-timing';

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Durable video workflow start exceeded its deadline.')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function startVideoGenerationWorkflowOwner(input: {
  jobId: string;
}): Promise<{ workflowRunId: string; cancel: () => Promise<void> }> {
  const run = await withDeadline(
    start(videoGenerationWorkflow, [
      {
        version: 1,
        jobId: input.jobId,
        startedAtEpochMs: Date.now(),
      },
    ]),
    VIDEO_WORKFLOW_START_DEADLINE_MS,
  );
  return { workflowRunId: run.runId, cancel: () => run.cancel() };
}

export async function startVideoGenerationWorkflowExecution(input: {
  db: DatabaseAdapter;
  jobId: string;
  userId: string;
}): Promise<{ workflowRunId: string }> {
  const run = await startVideoGenerationWorkflowOwner({ jobId: input.jobId });
  try {
    await attachVideoGenerationWorkflow({
      db: input.db,
      jobId: input.jobId,
      userId: input.userId,
      workflowRunId: run.workflowRunId,
    });
  } catch (error) {
    const current = await getVideoGenerationJob(input.db, input.jobId, input.userId).catch(
      () => null,
    );
    if (current?.workflowRunId !== run.workflowRunId) {
      await run.cancel().catch(() => undefined);
      throw error;
    }
  }
  return { workflowRunId: run.workflowRunId };
}

export async function startVideoProviderTaskAttachmentRecovery(input: {
  jobId: string;
  providerTaskId: string;
}): Promise<{ workflowRunId: string }> {
  const run = await start(videoProviderTaskAttachmentWorkflow, [
    {
      version: 1,
      jobId: input.jobId,
      providerTaskId: input.providerTaskId,
    },
  ]);
  return { workflowRunId: run.runId };
}
