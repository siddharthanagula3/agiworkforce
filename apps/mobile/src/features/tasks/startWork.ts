import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import {
  DEFAULT_CLOUD_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { executionModeForSelection } from '@/src/features/chat/utils/conversationMode';
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';
import { buildAgiWorkGoalInput, type AgiWorkGoalInput } from './agiWorkGoal';

export const START_WORK_ERROR = 'This task could not be started';
export const START_WORK_EMPTY_GOAL_ERROR = 'Describe what this task should accomplish';

export interface StartCloudWorkRunInput {
  goal: string;
  constraints?: string;
  deliverable?: string;
  projectId?: string;
}

export interface StartCloudWorkRunResult {
  conversationId: string;
  goal: AgiWorkGoalInput;
}

export function cloudWorkRunTitle(goal: string): string {
  const trimmed = goal.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60).trimEnd()}…` : trimmed;
}

export function cloudWorkModelId(): string {
  const { selectedModel } = useModelStore.getState();
  if (executionModeForSelection(selectedModel, 'cloud') === 'cloud') return selectedModel;
  return getDefaultCloudModelIdForTier(useTierStore.getState().tier) ?? DEFAULT_CLOUD_MODEL_ID;
}

export async function startCloudWorkRun(
  input: StartCloudWorkRunInput,
  onRunStarted?: (runId: string) => void,
): Promise<StartCloudWorkRunResult> {
  const goal = buildAgiWorkGoalInput(input.goal, {
    ...(input.constraints ? { constraints: input.constraints } : {}),
    ...(input.deliverable ? { deliverable: input.deliverable } : {}),
  });
  if (!goal) throw new Error(START_WORK_EMPTY_GOAL_ERROR);

  const { createConversation, sendMessage } = useChatStore.getState();
  const conversationId = await createConversation(
    cloudWorkRunTitle(goal.goal),
    input.projectId ?? undefined,
  );

  let sendError: unknown;
  const accepted = await resolveOnAcceptedSend(
    (onAccepted) =>
      sendMessage(conversationId, goal.goal, cloudWorkModelId(), undefined, {
        workMode: 'agiwork',
        agiWorkGoal: goal,
        onAccepted,
        ...(onRunStarted ? { onRunStarted } : {}),
      }),
    (error) => {
      sendError = error;
    },
  );
  if (!accepted) {
    if (sendError instanceof Error && sendError.message) throw sendError;
    const reported = useChatStore.getState().error;
    throw new Error(reported && reported.trim() ? reported : START_WORK_ERROR);
  }

  return { conversationId, goal };
}
