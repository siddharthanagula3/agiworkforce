import type { ChatMessage } from '@/types/chat';

export interface ReconcileLoadedCloudMessagesInput {
  serverMessages: ChatMessage[];
  requestStartMessages: ChatMessage[];
  currentMessages: ChatMessage[];
  dirtyMessageIds: Set<string>;
}

function keepLocalAttachments(server: ChatMessage, local: ChatMessage | undefined): ChatMessage {
  return server.attachments === undefined && local?.attachments?.length
    ? { ...server, attachments: local.attachments }
    : server;
}

function keepLocalSources(server: ChatMessage, local: ChatMessage | undefined): ChatMessage {
  return server.citations === undefined && local?.citations?.length
    ? { ...server, citations: local.citations }
    : server;
}

function keepLocalAnsweredInput(server: ChatMessage, local: ChatMessage | undefined): ChatMessage {
  return server.answeredToolInput === undefined &&
    server.pendingToolInput === undefined &&
    local?.answeredToolInput
    ? { ...server, answeredToolInput: local.answeredToolInput }
    : server;
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
  const reconciled = new Map(
    serverMessages.map((message) => [
      message.id,
      keepLocalAnsweredInput(
        keepLocalSources(
          keepLocalAttachments(message, currentById.get(message.id)),
          currentById.get(message.id),
        ),
        currentById.get(message.id),
      ),
    ]),
  );

  for (const message of requestStartMessages) {
    if (!currentById.has(message.id)) reconciled.delete(message.id);
  }

  for (const message of currentMessages) {
    const requestStartMessage = requestStartById.get(message.id);
    const changedDuringRequest =
      requestStartMessage === undefined || requestStartMessage !== message;
    const generating = message.isGeneratingImage === true || message.isGeneratingVideo === true;
    if (
      changedDuringRequest ||
      message.isStreaming ||
      generating ||
      dirtyMessageIds.has(message.id)
    ) {
      reconciled.set(message.id, message);
    }
  }

  return keepShownOrder(currentMessages, Array.from(reconciled.values()));
}

/**
 * The phone stamps a turn when it is sent and the server when it receives each
 * row, so whichever row of a turn adopts the server's stamp first would sort
 * past its neighbours. Rows already shown keep their shown order; only rows the
 * phone has not shown yet are placed by their own time.
 */
export function keepShownOrder(
  shownMessages: readonly ChatMessage[],
  nextMessages: readonly ChatMessage[],
): ChatMessage[] {
  const nextById = new Map(nextMessages.map((message) => [message.id, message]));
  const shownOrder = new Map<string, { key: string; index: number }>();
  let floor = '';
  shownMessages.forEach((message, index) => {
    const kept = nextById.get(message.id);
    if (!kept) return;
    const createdAt = kept.createdAt ?? '';
    const key = createdAt > floor ? createdAt : floor;
    shownOrder.set(message.id, { key, index });
    floor = key;
  });

  return [...nextMessages].sort((a, b) => {
    const left = shownOrder.get(a.id);
    const right = shownOrder.get(b.id);
    const byTime = (left?.key ?? a.createdAt ?? '').localeCompare(right?.key ?? b.createdAt ?? '');
    if (byTime !== 0) return byTime;
    if (left && right) return left.index - right.index;
    return a.id.localeCompare(b.id);
  });
}
