import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import type { ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';

const STOP_CONFIRMATION_POLL_MS = 1_000;
const STOP_CONFIRMATION_ATTEMPTS = 30;

export async function cancelCloudRunAndConfirm(
  client: Pick<ManagedCloudAgentRunClient, 'cancelRun' | 'getRun'>,
  runId: string,
): Promise<boolean> {
  let state = (await client.cancelRun(runId)).state;
  for (
    let attempt = 0;
    attempt < STOP_CONFIRMATION_ATTEMPTS && !TERMINAL_AGENT_TASK_STATES.has(state);
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, STOP_CONFIRMATION_POLL_MS));
    state = (await client.getRun(runId, { limit: 1 })).run.state;
  }
  return TERMINAL_AGENT_TASK_STATES.has(state);
}
