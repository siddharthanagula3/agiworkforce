import 'server-only';

import { createAgentEventStreamEmitter } from '@/app/api/llm/v1/chat/completions/lib/agent-event-stream';
import { upstreamFailureCopy } from '@/app/api/llm/v1/chat/completions/lib/upstream-error-copy';
import { appendCloudAgentEvent, getCloudAgentRun } from '@/lib/services/cloud-agent-run-service';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  parseCloudAgentWorkflowInput,
  type CloudAgentWorkflowInput,
} from '../cloud-agent-workflow-input';
import { writeDurableFrames } from './durable-stream-frames';
import { settleWorkflowInvocation } from './settle-workflow-invocation';

const CLOUD_AGENT_WORKFLOW_FAILED_MESSAGE = 'The durable agent workflow failed.';
const CLOUD_AGENT_WORKFLOW_FAILED_CODE = 'cloud_agent_workflow_failed';

// Classification needs Node (it logs and reads provider health), so it runs in the step.
export async function failCloudAgentWorkflow(
  rawInput: CloudAgentWorkflowInput,
  error: unknown,
): Promise<void> {
  'use step';

  const input = parseCloudAgentWorkflowInput(rawInput);
  const failure = upstreamFailureCopy(error, input.processed.provider);
  const db = getNeonDb();
  const snapshot = await getCloudAgentRun(db, {
    userId: input.userId,
    runId: input.runId,
    afterSequence: Number.MAX_SAFE_INTEGER,
    limit: 1,
  });
  const continuation = input.continuation;
  const turnId = continuation?.eventTurnId ?? input.processed.requestId;
  const emitter = createAgentEventStreamEmitter({
    sessionId: continuation?.eventSessionId ?? input.processed.conversationId ?? turnId,
    turnId,
    responseModel: input.processed.requestedModel,
    initialSequence: (snapshot?.run.lastEventSequence ?? -1) + 1,
  });
  const events = [
    emitter.emitWithEnvelope({
      type: 'error',
      message: failure.message || CLOUD_AGENT_WORKFLOW_FAILED_MESSAGE,
      code: failure.code || CLOUD_AGENT_WORKFLOW_FAILED_CODE,
      retryable: false,
    }),
    emitter.emitWithEnvelope({
      type: 'task-state-changed',
      taskId: turnId,
      state: 'failed',
      summary: 'Agent work ended with an error.',
    }),
    emitter.emitWithEnvelope({ type: 'stop', reason: 'error' }),
  ];

  for (const emitted of events) {
    await appendCloudAgentEvent(db, {
      userId: input.userId,
      runId: input.runId,
      envelope: emitted.envelope,
    });
  }

  await settleWorkflowInvocation(input, 'failed');

  await writeDurableFrames(
    input.runId,
    'failure',
    events.map((emitted) => emitted.sse),
  );
}
