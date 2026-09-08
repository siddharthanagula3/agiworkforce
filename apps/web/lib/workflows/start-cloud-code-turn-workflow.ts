import 'server-only';

import { start } from 'workflow/api';

import { logger } from '@/lib/logger';
import { areDurableInitialTurnsEnabled } from './durable-initial-turns';
import { cloudCodeTurnWorkflow } from './cloud-code-turn-workflow';
import type { CloudCodeTurnWorkflowInput } from './cloud-code-turn-workflow-input';

export const DURABLE_CODE_TURNS_ENV = 'AGI_DURABLE_CODE_TURNS';

/**
 * Opt-in, unlike the chat surface's kill-switch, which is opt-out.
 *
 * The chat workflow has run durably in production for months; a durable Code
 * turn has never run anywhere. Defaulting it on would make an unobserved path
 * the one every account gets, and the failure mode of a durable start that goes
 * wrong is a turn that never answers. Off until someone has watched one work,
 * then this flag flips and the fallback below stops being the usual case.
 */
export function areDurableCodeTurnsEnabled(): boolean {
  const raw = process.env[DURABLE_CODE_TURNS_ENV]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

export type CloudCodeTurnTransport = 'durable' | 'inline';

export type CloudCodeTurnDegradeReason = 'not_enabled' | 'kill_switch' | 'workflow_start_failed';

export interface CloudCodeTurnStart {
  transport: CloudCodeTurnTransport;
  /** Null on the inline transport: there is no durable run to reattach to. */
  workflowRunId: string | null;
  degradedReason?: CloudCodeTurnDegradeReason;
}

/**
 * Hands the turn to the Workflow platform, or says why it could not.
 *
 * Never throws: a transport is a choice about where the work happens, and the
 * inline path runs the same turn request-scoped. What it must not do is fail
 * silently, so every refusal carries a reason the caller records. A drifted
 * input surfaces here as `workflow_start_failed` with the parse error logged,
 * rather than as a durable run that starts and dies where nobody is looking.
 */
export async function startCloudCodeTurnWorkflow(
  input: CloudCodeTurnWorkflowInput,
): Promise<CloudCodeTurnStart> {
  const degrade = (reason: CloudCodeTurnDegradeReason, error?: unknown): CloudCodeTurnStart => {
    logger.warn(
      {
        ...(error ? { error } : {}),
        reason,
        userId: input.userId,
        turnId: input.turnId,
        sessionId: input.sessionId,
      },
      'Durable Code turn transport unavailable; running this turn request-scoped',
    );
    return { transport: 'inline', workflowRunId: null, degradedReason: reason };
  };

  if (!areDurableCodeTurnsEnabled()) return degrade('not_enabled');
  if (!areDurableInitialTurnsEnabled()) return degrade('kill_switch');

  try {
    const workflowRun = await start(cloudCodeTurnWorkflow, [input]);
    logger.info(
      { userId: input.userId, turnId: input.turnId, workflowRunId: workflowRun.runId },
      'Code turn handed to the durable runner',
    );
    return { transport: 'durable', workflowRunId: workflowRun.runId };
  } catch (error) {
    return degrade('workflow_start_failed', error);
  }
}
