import {
  MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH,
  managedCloudMessagePath,
} from '@agiworkforce/cloud-contracts';
import {
  classifyAssistantFence,
  type AssistantFenceEdit,
} from '@agiworkforce/unified-chat/assistant-fence';
import {
  applyAssistantFenceEdit,
  listEditableAssistantFences,
} from '@agiworkforce/unified-chat/assistant-fence-edits';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import { getConversationMessageStore } from '@/stores/chat/conversationRepository';
import {
  AssistantFenceEditError,
  type AssistantFenceEditRequest,
} from './assistantFenceEditRequest';

export { AssistantFenceEditError, type AssistantFenceEditRequest };

const BLOCK_CHANGED = 'This block changed. Reopen the chat before saving your edit.';

export function assistantFenceIdentity(language: string, source: string): string | null {
  const fence = classifyAssistantFence(language, source.trim());
  return fence.kind === 'email' || fence.kind === 'writing' || fence.kind === 'copy'
    ? fence.copyText
    : null;
}

export function resolveAssistantFenceEdit(
  markdown: string,
  request: AssistantFenceEditRequest,
): AssistantFenceEdit | 'ambiguous' | null {
  const language = request.language.toLowerCase();
  const matches = listEditableAssistantFences(markdown).filter(
    (fence) =>
      fence.language === language &&
      assistantFenceIdentity(fence.language, fence.source) === request.identity,
  );
  if (matches.length > 1) return 'ambiguous';
  const [match] = matches;
  return match ? { ...match, content: request.content } : null;
}

function savedContent(body: unknown): string {
  if (
    !body ||
    typeof body !== 'object' ||
    !('content' in body) ||
    typeof body.content !== 'string' ||
    body.content.length > MANAGED_CLOUD_CHAT_MAX_STORED_MESSAGE_LENGTH ||
    !('editRevision' in body) ||
    typeof body.editRevision !== 'string' ||
    !body.editRevision
  ) {
    throw new AssistantFenceEditError(
      'The server did not confirm the saved edit. Reopen the chat and try again.',
    );
  }
  return body.content;
}

const savingMessages = new Set<string>();

export async function saveAssistantFenceEdit(
  conversationId: string,
  messageId: string,
  request: AssistantFenceEditRequest,
): Promise<void> {
  const store = getConversationMessageStore(conversationId);
  const message = store
    .getState()
    .messages[conversationId]?.find((candidate) => candidate.id === messageId);
  if (!message || message.role !== 'assistant' || message.isStreaming) {
    throw new AssistantFenceEditError('Wait for this response to finish before editing.');
  }
  const edit = resolveAssistantFenceEdit(message.content, request);
  if (edit === 'ambiguous') {
    throw new AssistantFenceEditError(
      'This draft appears more than once in the answer, so the edit cannot be saved. Copy it instead.',
    );
  }
  const edited = edit ? applyAssistantFenceEdit(message.content, edit) : null;
  if (!edit || edited === null) throw new AssistantFenceEditError(BLOCK_CHANGED);
  if (savingMessages.has(messageId)) {
    throw new AssistantFenceEditError(
      'Another block in this message is saving. Try again when it finishes.',
    );
  }

  savingMessages.add(messageId);
  try {
    const conversation = store
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    const cloud =
      conversation !== undefined &&
      conversation.temporary !== true &&
      executionModeForConversation(conversation) === 'cloud';
    let content = edited;
    if (cloud) {
      const accountEpoch = captureCloudAccountEpoch();
      if (!isCloudAccountEpochCurrent(accountEpoch)) {
        throw new AssistantFenceEditError('Sign in again to save this edit.');
      }
      try {
        content = savedContent(
          await api.patch<unknown>(managedCloudMessagePath(conversationId, messageId), {
            fenceEdit: edit,
          }),
        );
      } catch (error) {
        if (error instanceof ApiHttpError && error.status === 409) {
          throw new AssistantFenceEditError(BLOCK_CHANGED);
        }
        throw error;
      }
      if (!isCloudAccountEpochCurrent(accountEpoch)) return;
    }

    let applied = false;
    store.setState((state) => {
      const rows = state.messages[conversationId];
      if (!rows) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: rows.map((row) => {
            if (row.id !== messageId || (!cloud && row.content !== message.content)) return row;
            applied = true;
            return { ...row, content };
          }),
        },
      };
    });
    if (!applied) throw new AssistantFenceEditError(BLOCK_CHANGED);
  } finally {
    savingMessages.delete(messageId);
  }
}
