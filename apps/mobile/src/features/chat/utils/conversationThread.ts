import { resolveVisibleThread } from '@agiworkforce/cloud-contracts';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

type ThreadedConversation = Pick<ConversationSummary, 'activeLeafMessageId'>;

/**
 * A server that never sends `activeLeafMessageId` cannot hold siblings, so an
 * edit or a regenerate against it has no branch to create and must keep
 * replacing. `null` is the opposite answer: the server threads, this
 * conversation simply has not branched yet.
 */
export function isThreadingCapableConversation(
  conversation: ThreadedConversation | undefined,
): boolean {
  return conversation?.activeLeafMessageId !== undefined;
}

/**
 * The transcript as the reader sees it. A conversation with no leaf resolves to
 * its own array by identity, so every pre-threading conversation renders the
 * list it always did and no memo downstream sees a change that did not happen.
 */
export function visibleThreadFor(
  messages: ChatMessage[],
  conversation: ThreadedConversation | undefined,
): ChatMessage[] {
  return resolveVisibleThread(messages, conversation?.activeLeafMessageId ?? null);
}
