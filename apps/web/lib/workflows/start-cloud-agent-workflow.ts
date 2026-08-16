import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { start, type WorkflowReadableStream } from 'workflow/api';

import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import type { ApprovalMode } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { attachCloudAgentWorkflow } from '@/lib/services/cloud-agent-execution-service';
import { cloudAgentWorkflow } from './cloud-agent-workflow';
import {
  buildCloudAgentWorkflowInput,
  type CloudAgentWorkflowInput,
} from './cloud-agent-workflow-input';

export interface StartCloudAgentWorkflowExecutionInput {
  db: DatabaseAdapter;
  runId: string;
  userId: string;
  processed: ProcessedRequest;
  mcpTools: WebMcpToolDef[];
  approvalMode: ApprovalMode;
  continuation?: CloudAgentWorkflowInput['continuation'];
  predecessorApproval?: CloudAgentWorkflowInput['predecessorApproval'];
}

export async function startCloudAgentWorkflowExecution(
  input: StartCloudAgentWorkflowExecutionInput,
): Promise<{ workflowRunId: string; readable: WorkflowReadableStream<Uint8Array> }> {
  const workflowInput = buildCloudAgentWorkflowInput(input);
  const workflowRun = await start(cloudAgentWorkflow, [workflowInput]);
  try {
    await attachCloudAgentWorkflow(input.db, {
      userId: input.userId,
      runId: input.runId,
      workflowRunId: workflowRun.runId,
    });
  } catch (error) {
    await workflowRun.cancel();
    throw error;
  }

  return {
    workflowRunId: workflowRun.runId,
    readable: workflowRun.getReadable<Uint8Array>(),
  };
}
