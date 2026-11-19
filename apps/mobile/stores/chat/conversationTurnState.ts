import type { LifecycleStatus } from '@agiworkforce/types';
import type { ChatMessage } from '@/types/chat';

const RUNNING_STEP = 'running' satisfies LifecycleStatus;
const FAILED_STEP = 'failed' satisfies LifecycleStatus;

const UNFINISHED_FINISH_REASONS: ReadonlySet<string> = new Set([
  'stopped',
  'cancelled',
  'canceled',
  'error',
  'length',
  'refusal',
  'content_filter',
]);

export function turnEndedCleanly(message: ChatMessage): boolean {
  if (message.status === 'error') return false;
  const metadata = message.metadata as Record<string, unknown> | undefined;
  if (metadata?.['streamError'] !== undefined) return false;
  const finishReason = metadata?.['finishReason'];
  return typeof finishReason !== 'string' || !UNFINISHED_FINISH_REASONS.has(finishReason);
}

function isImageTurn(message: ChatMessage): boolean {
  return (
    message.type === 'image' ||
    message.imageGenStatus !== undefined ||
    message.isGeneratingImage === true
  );
}

export function isImageGenerationChat(messages: readonly ChatMessage[]): boolean {
  const answers = messages.filter((message) => message.role === 'assistant');
  return answers.length > 0 && answers.every(isImageTurn);
}

export function settleRunningSteps(message: ChatMessage): ChatMessage {
  if (!message.steps?.some((step) => step.status === RUNNING_STEP)) return message;
  return {
    ...message,
    steps: message.steps.map((step) =>
      step.status === RUNNING_STEP ? { ...step, status: FAILED_STEP } : step,
    ),
  };
}
