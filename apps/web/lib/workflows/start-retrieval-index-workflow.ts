import 'server-only';

import { start } from 'workflow/api';

import { logger } from '@/lib/logger';
import { retrievalIndexWorkflow } from './retrieval-index-workflow';

export interface RetrievalIndexDispatch {
  documentId: string;
  userId: string;
  organizationId: string | null;
}

export async function startRetrievalIndexWorkflow(
  dispatch: RetrievalIndexDispatch,
): Promise<string> {
  const run = await start(retrievalIndexWorkflow, [
    {
      version: 1,
      documentId: dispatch.documentId,
      userId: dispatch.userId,
      organizationId: dispatch.organizationId,
    },
  ]);
  return run.runId;
}

/**
 * A run that fails to start leaves the document pending, and the
 * retrieval-index cron dispatches it on its next pass.
 */
export async function dispatchRetrievalIndexWorkflows(
  dispatches: readonly RetrievalIndexDispatch[],
): Promise<{ started: number; failed: number }> {
  let started = 0;
  let failed = 0;
  for (const dispatch of dispatches) {
    try {
      await startRetrievalIndexWorkflow(dispatch);
      started += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        { err: error, documentId: dispatch.documentId },
        '[retrieval] index workflow did not start; the cron sweep will retry it',
      );
    }
  }
  return { started, failed };
}
