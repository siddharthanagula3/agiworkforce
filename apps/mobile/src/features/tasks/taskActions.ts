import {
  MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { managedCloudChat } from '@/services/managedCloudChat';
import { confirmShareConversation } from '@/src/features/shared-links/shareConversation';

export function isCloudRunSettled(run: Pick<CloudAgentRun, 'state'>): boolean {
  return TERMINAL_AGENT_TASK_STATES.has(run.state);
}

const MAX_RERUN_LOOKUP_PAGES = 20;

export function canRerunCloudRun(run: CloudAgentRun): boolean {
  return isCloudRunSettled(run) && Boolean(run.conversationId);
}

export async function loadRerunGoal(
  run: CloudAgentRun,
  signal?: AbortSignal,
): Promise<string | null> {
  const conversationId = run.conversationId;
  if (!conversationId || !isCloudRunSettled(run)) return null;
  const startedAt = Date.parse(run.createdAt);
  let nearest: { goal: string; distanceMs: number } | null = null;
  let offset = 0;

  for (let page = 0; page < MAX_RERUN_LOOKUP_PAGES; page += 1) {
    const { messages, hasMore } = await managedCloudChat.getConversation(
      conversationId,
      { limit: MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE, offset },
      signal ? { signal } : {},
    );
    for (const message of messages) {
      const goal = message.role === 'user' ? message.content.trim() : '';
      if (!goal) continue;
      const sentAt = Date.parse(message.createdAt);
      const distanceMs =
        Number.isNaN(startedAt) || Number.isNaN(sentAt) ? 0 : Math.abs(sentAt - startedAt);
      if (!nearest || distanceMs < nearest.distanceMs) nearest = { goal, distanceMs };
    }
    if (!hasMore || messages.length === 0) break;
    offset += messages.length;
  }
  return nearest?.goal ?? null;
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
