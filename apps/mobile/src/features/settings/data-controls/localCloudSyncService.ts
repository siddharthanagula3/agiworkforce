import {
  createManagedCloudChatClient,
  managedCloudConversationMessagesPath,
} from '@agiworkforce/cloud-contracts';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { api, apiFetch } from '@/services/api';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import {
  assertCloudAccountEpochCurrent,
  captureCloudAccountEpoch,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import type { ChatMessage } from '@/types/chat';

export interface LocalCloudSyncResult {
  conversationsSynced: number;
  messagesSynced: number;
  errors: string[];
  outcomeUnknown: boolean;
}

const MAX_CONVERSATIONS_TO_SYNC = 50;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TransferMessage = Readonly<Pick<ChatMessage, 'role' | 'content' | 'model'>>;
export interface LocalCloudSyncPlan {
  readonly account: Readonly<CloudAccountEpoch>;
  readonly mode: 'cloud';
  readonly conversations: readonly Readonly<{
    id: string;
    title: string;
    messages: readonly TransferMessage[];
  }>[];
  readonly conversationLimit: number;
  readonly messageLimit: number;
  readonly emptyChatsExcluded: number;
  readonly temporaryChatsExcluded: number;
  readonly conversationsOmitted: number;
  readonly messagesOmitted: number;
  readonly messageCount: number;
}

const consumedPlans = new WeakSet<LocalCloudSyncPlan>();

export function prepareLocalCloudSync(): LocalCloudSyncPlan {
  const account = captureCloudAccountEpoch();
  assertCloudAccountEpochCurrent(account);
  if (useChatAppModeStore.getState().appMode !== 'cloud') {
    throw new Error('Switch chat to AGI Cloud before preparing a copy.');
  }
  const state = useChatMessageStore.getState();
  const local = state.conversations.filter(
    (conversation) => executionModeForConversation(conversation) === 'local',
  );
  const eligible = local.filter((conversation) => !conversation.temporary);
  let messagesOmitted = 0;
  const selected = eligible.slice(0, MAX_CONVERSATIONS_TO_SYNC).map((conversation) => {
    const original = state.messages[conversation.id] ?? [];
    const messages = original
      .filter((message) => !message.isStreaming && !message.isQueued && !message.queueFailed)
      .slice(-MAX_MESSAGES_PER_CONVERSATION)
      .filter((message) => message.content.trim().length > 0)
      .map((message) =>
        Object.freeze({
          role: message.role,
          content: message.content,
          model: message.model,
        }),
      );
    messagesOmitted += original.length - messages.length;
    return Object.freeze({
      id: UUID_PATTERN.test(conversation.id) ? conversation.id : uuidv7(),
      title: conversation.title ?? 'Synced from Local Mode',
      messages: Object.freeze(messages),
    });
  });
  const conversations = selected.filter((conversation) => conversation.messages.length > 0);
  return Object.freeze({
    conversationLimit: MAX_CONVERSATIONS_TO_SYNC,
    messageLimit: MAX_MESSAGES_PER_CONVERSATION,
    emptyChatsExcluded: selected.length - conversations.length,
    account: Object.freeze({ ...account }),
    mode: 'cloud',
    conversations: Object.freeze(conversations),
    temporaryChatsExcluded: local.length - eligible.length,
    conversationsOmitted: Math.max(0, eligible.length - selected.length),
    messagesOmitted,
    messageCount: conversations.reduce(
      (count, conversation) => count + conversation.messages.length,
      0,
    ),
  });
}

export async function syncLocalConversationsToCloud(
  plan: LocalCloudSyncPlan,
  signal: AbortSignal,
  assertActive: () => void,
): Promise<LocalCloudSyncResult> {
  const assertCurrent = () => {
    assertActive();
    assertCloudAccountEpochCurrent(plan.account);
    if (signal.aborted || useChatAppModeStore.getState().appMode !== plan.mode) {
      throw new Error('This copy is no longer active.');
    }
  };
  assertCurrent();
  if (consumedPlans.has(plan)) throw new Error('This copy has already been started.');
  consumedPlans.add(plan);
  const client = createManagedCloudChatClient({
    fetchImpl: (input, init) => {
      assertCurrent();
      return apiFetch(input, init ?? {}, { accountEpoch: plan.account, signal });
    },
  });
  const result: LocalCloudSyncResult = {
    conversationsSynced: 0,
    messagesSynced: 0,
    errors: [],
    outcomeUnknown: false,
  };
  for (const conversation of plan.conversations) {
    assertCurrent();
    try {
      const created = await client.createConversation(
        {
          id: conversation.id,
          title: conversation.title,
        },
        { signal },
      );
      assertCurrent();
      if (created.id !== conversation.id) throw new Error('Unexpected copy destination');
      if (conversation.messages.length > 0) {
        const receipt = await api.post<{ saved?: unknown } | null>(
          `${managedCloudConversationMessagesPath(created.id)}/bulk`,
          { messages: conversation.messages },
          { accountEpoch: plan.account, signal },
        );
        assertCurrent();
        const saved = receipt?.saved;
        if (
          typeof saved !== 'number' ||
          !Number.isInteger(saved) ||
          saved < 0 ||
          saved > conversation.messages.length
        ) {
          throw new Error('Invalid copy receipt');
        }
        result.messagesSynced += saved;
        if (saved !== conversation.messages.length) {
          result.errors.push(
            `Only ${saved}/${conversation.messages.length} messages acknowledged for "${conversation.title}".`,
          );
          continue;
        }
      }
      result.conversationsSynced += 1;
    } catch {
      assertCurrent();
      result.outcomeUnknown = true;
      result.errors.push(`Could not confirm how much of "${conversation.title}" was copied.`);
      break;
    }
  }
  return result;
}
