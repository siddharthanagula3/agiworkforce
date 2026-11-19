import 'server-only';

import { start } from 'workflow/api';

import { logger } from '@/lib/logger';
import { chatFileIntakeWorkflow } from './chat-file-intake-workflow';

export interface ChatFileIntakeDispatch {
  intakeId: string;
  userId: string;
  organizationId: string | null;
}

export async function startChatFileIntakeWorkflow(
  dispatch: ChatFileIntakeDispatch,
): Promise<string> {
  const run = await start(chatFileIntakeWorkflow, [
    {
      version: 1,
      intakeId: dispatch.intakeId,
      userId: dispatch.userId,
      organizationId: dispatch.organizationId,
    },
  ]);
  return run.runId;
}

/**
 * A run that fails to start leaves the row leased; the sweeper dispatches it
 * again once the lease has passed.
 */
export async function dispatchChatFileIntakeWorkflows(
  dispatches: readonly ChatFileIntakeDispatch[],
): Promise<{ started: number; failed: number }> {
  let started = 0;
  let failed = 0;
  for (const dispatch of dispatches) {
    try {
      await startChatFileIntakeWorkflow(dispatch);
      started += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        { err: error, intakeId: dispatch.intakeId },
        '[chat-files] intake workflow did not start; the sweeper will retry it',
      );
    }
  }
  return { started, failed };
}
