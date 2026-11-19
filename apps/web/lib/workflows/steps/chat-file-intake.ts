import 'server-only';

import {
  createChatFileIntakeDeps,
  parseChatFileIntakeWorkflowInput,
  runChatFileIntakeStep,
  type ChatFileIntakeDirective,
  type ChatFileIntakeWorkflowInput,
} from '@/lib/server/chat-file-intake/steps';

export type {
  ChatFileIntakeDirective,
  ChatFileIntakeWorkflowInput,
} from '@/lib/server/chat-file-intake/steps';

function withSleepCap(
  directive: ChatFileIntakeDirective,
  longestSleepMs: number,
): ChatFileIntakeDirective {
  if (!('sleepMs' in directive) || directive.sleepMs === undefined) return directive;
  if (directive.sleepMs <= longestSleepMs) return directive;
  return { ...directive, sleepMs: longestSleepMs };
}

export async function chatFileIntakeWorkflowStep(
  rawInput: ChatFileIntakeWorkflowInput,
  workflowRunId: string,
  directive: ChatFileIntakeDirective,
): Promise<ChatFileIntakeDirective> {
  'use step';

  const input = parseChatFileIntakeWorkflowInput(rawInput);
  const deps = createChatFileIntakeDeps(input);
  const next = await runChatFileIntakeStep(
    deps,
    { intakeId: input.intakeId, runId: workflowRunId },
    directive,
  );
  return withSleepCap(next, deps.policy.intake.scanGiveUpMs);
}
