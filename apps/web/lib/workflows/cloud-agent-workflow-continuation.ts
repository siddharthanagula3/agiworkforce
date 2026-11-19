import { retargetMessagesToModel } from '@/app/api/llm/v1/chat/completions/lib/managed-failover';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import {
  parseCloudAgentWorkflowInput,
  type CloudAgentWorkflowInput,
} from './cloud-agent-workflow-input';

// A turn settles in its last invocation, so the rotated route travels with the continuation; reservations come off first.
export function continuationRequest(
  serving: ProcessedRequest,
): CloudAgentWorkflowInput['processed'] {
  const { managedUsage: _managedUsage, freeTrial: _freeTrial, ...rest } = serving;
  return rest as CloudAgentWorkflowInput['processed'];
}

export function workflowContinuation(
  input: CloudAgentWorkflowInput,
  serving: ProcessedRequest,
  checkpoint: {
    toolSchemaState?: ProcessedRequest['toolSchemaState'];
    sessionId: string;
    turnId: string;
    nextEventSequence: number;
    completedSteps: number;
    messages: ProcessedRequest['llmRequest']['messages'];
  },
): CloudAgentWorkflowInput {
  const processed = continuationRequest(serving);
  return parseCloudAgentWorkflowInput(
    JSON.parse(
      JSON.stringify({
        ...input,
        processed: {
          ...processed,
          toolSchemaState: checkpoint.toolSchemaState,
          llmRequest: {
            ...processed.llmRequest,
            messages: retargetMessagesToModel(
              checkpoint.messages,
              input.processed,
              serving.chatRequest.model,
            ),
          },
        },
        continuation: {
          eventSessionId: checkpoint.sessionId,
          eventTurnId: checkpoint.turnId,
          initialEventSequence: checkpoint.nextEventSequence,
          initialCompletedSteps: checkpoint.completedSteps,
          invocationContinuation: true,
        },
      }),
    ),
  );
}
