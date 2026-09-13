import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { AgentTaskState } from '@agiworkforce/types';
import { getRun } from 'workflow/api';
import { withTimeout } from '@agiworkforce/utils';
import { createAgentEventStreamEmitter } from '@/app/api/llm/v1/chat/completions/lib/agent-event-stream';
import { WORKFLOW_WORLD_CALL_DEADLINE_MS } from '@/lib/deadline-policy';
import { logger } from '@/lib/logger';
import { appendCloudAgentEvents } from './cloud-agent-run-service';

export const CLOUD_AGENT_RUN_ABANDONED_CODE = 'run_abandoned';

export interface CloudAgentRunEnding {
  runId: string;
  userId: string;
  conversationId: string | null;
  turnId: string;
  model: string;
  lastEventSequence: number;
  state: Extract<AgentTaskState, 'failed' | 'cancelled'>;
  message: string;
  code: string;
  summary: string;
}

// The error a client can show plus the terminal state that settles the run row.
export async function explainCloudAgentRunEnding(
  db: DatabaseAdapter,
  ending: CloudAgentRunEnding,
): Promise<void> {
  const emitter = createAgentEventStreamEmitter({
    sessionId: ending.conversationId ?? ending.turnId,
    turnId: ending.turnId,
    responseModel: ending.model,
    initialSequence: ending.lastEventSequence + 1,
  });
  const envelopes = [
    emitter.emitWithEnvelope({
      type: 'error',
      message: ending.message,
      code: ending.code,
      retryable: true,
    }).envelope,
    emitter.emitWithEnvelope({
      type: 'task-state-changed',
      taskId: ending.turnId,
      state: ending.state,
      summary: ending.summary,
    }).envelope,
  ];

  try {
    await appendCloudAgentEvents(db, {
      userId: ending.userId,
      runId: ending.runId,
      envelopes,
    });
  } catch (error) {
    logger.warn(
      { error, runId: ending.runId },
      'A run was ended but its reason was not journalled',
    );
  }
}

// A terminal row is not enough: a run the world still holds is redelivered and
// burns a whole invocation limit each time.
export async function cancelCloudAgentWorkflowRun(workflowRunId: string): Promise<boolean> {
  try {
    await withTimeout(() => getRun(workflowRunId).cancel(), WORKFLOW_WORLD_CALL_DEADLINE_MS);
    return true;
  } catch (error) {
    logger.warn(
      { error, workflowRunId },
      'A stalled workflow run refused cancellation; the world may redeliver it',
    );
    return false;
  }
}

interface StalledRunRow extends Record<string, unknown> {
  conversation_id: string | null;
  request_id: string;
  model: string;
  last_event_sequence: number | string;
}

export interface StalledCloudAgentRun {
  runId: string;
  userId: string;
  workflowRunId: string;
  message: string;
  code: string;
  summary: string;
}

// The world is cancelled before the row is read, so a database fault cannot keep a
// dead run redelivering; the row is read here so the journal never continues from a
// stale sequence.
export async function endStalledCloudAgentRun(
  db: DatabaseAdapter,
  stalled: StalledCloudAgentRun,
): Promise<void> {
  await cancelCloudAgentWorkflowRun(stalled.workflowRunId);
  const rows = await db.query<StalledRunRow>(
    `select conversation_id, request_id, model, last_event_sequence
       from public.cloud_agent_runs
      where id = $1 and user_id = $2
      limit 1`,
    [stalled.runId, stalled.userId],
  );
  const row = rows[0];
  if (!row) return;
  await explainCloudAgentRunEnding(db, {
    runId: stalled.runId,
    userId: stalled.userId,
    conversationId: row.conversation_id,
    turnId: row.request_id,
    model: row.model,
    lastEventSequence: Number(row.last_event_sequence),
    state: 'failed',
    message: stalled.message,
    code: stalled.code,
    summary: stalled.summary,
  });
}
