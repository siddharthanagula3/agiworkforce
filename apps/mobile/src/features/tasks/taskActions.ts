import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { managedCloudChat } from '@/services/managedCloudChat';
import { confirmShareConversation } from '@/src/features/shared-links/shareConversation';

export function isCloudRunSettled(run: Pick<CloudAgentRun, 'state'>): boolean {
  return TERMINAL_AGENT_TASK_STATES.has(run.state);
}

export function rerunGoalFromRun(run: CloudAgentRun): string | null {
  if (!isCloudRunSettled(run)) return null;
  const goal = run.conversationPreview?.trim();
  return goal ? goal : null;
}

export function shareCloudRun(run: CloudAgentRun, title: string, isCurrent: () => boolean): void {
  const conversationId = run.conversationId;
  if (!conversationId) return;
  confirmShareConversation({
    conversationId,
    title,
    modelId: run.model ?? null,
    readMessages: async () => {
      const page = await managedCloudChat.getConversation(conversationId);
      return page.messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
      }));
    },
    isCurrent,
  });
}
