import 'server-only';

import { getWorkflowMetadata, sleep } from 'workflow';

import {
  chatFileIntakeWorkflowStep,
  type ChatFileIntakeDirective,
  type ChatFileIntakeWorkflowInput,
} from './steps/chat-file-intake';

export type { ChatFileIntakeWorkflowInput } from './steps/chat-file-intake';

const MAX_INTAKE_STEPS = 5_000;

/**
 * Inspect, scan, seal, prepare and index one large chat file. A run that stops
 * anywhere leaves its row leased, and the sweeper starts another at the step
 * the row's state names. The step caps every sleep at the scan's give-up
 * window, so a run always wakes to renew its lease before the lease passes.
 */
export async function chatFileIntakeWorkflow(input: ChatFileIntakeWorkflowInput): Promise<void> {
  'use workflow';

  const workflowRunId = getWorkflowMetadata().workflowRunId;
  let directive: ChatFileIntakeDirective = { next: 'start' };
  for (let step = 0; step < MAX_INTAKE_STEPS; step += 1) {
    const sleepMs = 'sleepMs' in directive ? (directive.sleepMs ?? 0) : 0;
    if (sleepMs > 0) await sleep(sleepMs);
    directive = await chatFileIntakeWorkflowStep(input, workflowRunId, directive);
    if (directive.next === 'end') return;
  }
}
