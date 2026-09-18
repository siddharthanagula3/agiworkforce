import 'server-only';

import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';
import { closeCloudAgentWorkflowStream } from './steps/close-cloud-agent-stream';
import { executeCloudAgentWorkflowInvocation } from './steps/execute-cloud-agent-invocation';
import { failCloudAgentWorkflow } from './steps/fail-cloud-agent-workflow';
import { ensureWorkPlanForRun, settleWorkPlanForRun } from './steps/work-plan-steps';

// Workflow mode bundles this module for a VM without require or Node built-ins;
// anything that logs or queries must stay behind the step imports above.
export async function cloudAgentWorkflow(rawInput: CloudAgentWorkflowInput): Promise<void> {
  'use workflow';

  let input = rawInput;
  try {
    await ensureWorkPlanForRun(input);
    for (;;) {
      const result = await executeCloudAgentWorkflowInvocation(input);
      if (result.kind === 'continue') {
        input = result.input;
        continue;
      }
      await settleWorkPlanForRun(input, 'completed');
      await closeCloudAgentWorkflowStream(input.runId);
      return;
    }
  } catch (error) {
    await failCloudAgentWorkflow(input, error);
    await settleWorkPlanForRun(input, 'failed');
    await closeCloudAgentWorkflowStream(input.runId);
    throw error;
  }
}
