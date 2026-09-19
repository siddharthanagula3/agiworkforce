import 'server-only';

import { sleep } from 'workflow';

import type { CloudAgentWorkflowInput } from './cloud-agent-workflow-input';
import { clearCloudAgentDevice } from '../device-steps/device-clearance-step';
import { closeCloudAgentWorkflowStream } from './steps/close-cloud-agent-stream';
import { executeCloudAgentWorkflowInvocation } from './steps/execute-cloud-agent-invocation';
import { failCloudAgentWorkflow } from './steps/fail-cloud-agent-workflow';
import { ensureWorkPlanForRun, settleWorkPlanForRun } from './steps/work-plan-steps';

const DEVICE_PRESENCE_WAIT_BUDGET_MS = 60 * 60_000;

// A device that is merely asleep is waited for, never failed. When the budget
// runs out the device tools are withdrawn and the turn continues without them.
async function awaitDeviceClearance(
  input: CloudAgentWorkflowInput,
): Promise<CloudAgentWorkflowInput> {
  let clearance = await clearCloudAgentDevice(input);
  let waited = 0;
  while (clearance.decision === 'wait') {
    if (waited >= DEVICE_PRESENCE_WAIT_BUDGET_MS) {
      return (await clearCloudAgentDevice(clearance.input, true)).input;
    }
    await sleep(clearance.retryInMs);
    waited += clearance.retryInMs;
    clearance = await clearCloudAgentDevice(clearance.input);
  }
  return clearance.input;
}

// Workflow mode bundles this module for a VM without require or Node built-ins;
// anything that logs or queries must stay behind the step imports above.
export async function cloudAgentWorkflow(rawInput: CloudAgentWorkflowInput): Promise<void> {
  'use workflow';

  let input = rawInput;
  try {
    if (input.processed.chatRequest.work_mode === 'agiwork') {
      await ensureWorkPlanForRun(input);
    }
    for (;;) {
      if (input.processed.deviceHost) {
        input = await awaitDeviceClearance(input);
      }
      const result = await executeCloudAgentWorkflowInvocation(input);
      if (result.kind === 'continue') {
        input = result.input;
        continue;
      }
      if (input.processed.chatRequest.work_mode === 'agiwork') {
        await settleWorkPlanForRun(input, 'completed');
      }
      await closeCloudAgentWorkflowStream(input.runId);
      return;
    }
  } catch (error) {
    await failCloudAgentWorkflow(input, error);
    if (input.processed.chatRequest.work_mode === 'agiwork') {
      await settleWorkPlanForRun(input, 'failed');
    }
    await closeCloudAgentWorkflowStream(input.runId);
    throw error;
  }
}
