import type { ChatMessage } from '@/types/chat';

export interface ReconcileLoadedCloudMessagesInput {
  serverMessages: ChatMessage[];
  requestStartMessages: ChatMessage[];
  currentMessages: ChatMessage[];
  dirtyMessageIds: Set<string>;
}

/**
 * A reload that lands mid-turn swaps in the server's copy of the question,
 * stamped when the server received it, while the live answer keeps the phone's
 * earlier stamp. Rows already on screen therefore keep their on-screen order,
 * and only rows the phone has not shown yet are placed by their own time.
 */
export function reconcileLoadedCloudMessages({
  serverMessages,
  requestStartMessages,
  currentMessages,
  dirtyMessageIds,
}: ReconcileLoadedCloudMessagesInput): ChatMessage[] {
  const requestStartById = new Map(requestStartMessages.map((message) => [message.id, message]));
  const currentById = new Map(currentMessages.map((message) => [message.id, message]));
  const reconciled = new Map(serverMessages.map((message) => [message.id, message]));

  for (const message of requestStartMessages) {
    if (!currentById.has(message.id)) reconciled.delete(message.id);
  }

  for (const message of currentMessages) {
    const requestStartMessage = requestStartById.get(message.id);
    const changedDuringRequest =
      requestStartMessage === undefined || requestStartMessage !== message;
    if (changedDuringRequest || message.isStreaming || dirtyMessageIds.has(message.id)) {
      reconciled.set(message.id, message);
    }
  }

  const shownOrder = new Map<string, { key: string; index: number }>();
  let floor = '';
  currentMessages.forEach((message, index) => {
    const kept = reconciled.get(message.id);
    if (!kept) return;
    const key = kept.createdAt > floor ? kept.createdAt : floor;
    shownOrder.set(message.id, { key, index });
    floor = key;
  });

  return Array.from(reconciled.values()).sort((a, b) => {
    const left = shownOrder.get(a.id);
    const right = shownOrder.get(b.id);
    const byTime = (left?.key ?? a.createdAt).localeCompare(right?.key ?? b.createdAt);
    if (byTime !== 0) return byTime;
    if (left && right) return left.index - right.index;
    return a.id.localeCompare(b.id);
  });
}
