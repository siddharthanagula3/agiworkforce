import {
  saveMessageToDb,
  notifyPersistenceFailure,
  EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
} from '@/lib/hooks/useChatStream';
import type { Message, MessageMetadata } from '@/stores/chatStore';

type AuthTokenProvider = () => Promise<string>;
type UpdateMessageFn = (id: string, updates: Partial<Message>) => void;

/**
 * WEB-IMAGE-CHAT-PERSISTENCE-01: the composer's "Create image" flow
 * (handleGenerateImage / handleRegenerateImageInPlace in WebChatPage.tsx)
 * only ever touched the in-memory chatStore. The generated image bytes are
 * durably stored (app/api/media/image/generate/route.ts writes to Vercel
 * Blob + media_assets), but the chat MESSAGE recording that the generation
 * happened was never saved to web_messages, and chatStore's zustand
 * `persist` middleware explicitly excludes `messages` from localStorage —
 * so the turn vanished on reload despite the image itself being safe.
 *
 * These two helpers persist those turns the same way useChatStream's
 * sendMessage persists every other turn (see saveMessageToDb), so a reload
 * rehydrates the same metadata MessageBubble already renders live
 * (`metadata.toolType === 'image-generation'` → <ImageGenerationCard>).
 */

export function isTemporaryConversationById(
  conversations: Array<{ id: string; isTemporary?: boolean }>,
  conversationId: string,
): boolean {
  return Boolean(conversations.find((c) => c.id === conversationId)?.isTemporary);
}

/** Persists the user's image prompt as a normal user turn. */
export async function persistImageGenerationUserMessage(params: {
  conversationId: string;
  messageId: string;
  content: string;
  getAuthToken: AuthTokenProvider;
  updateMessage: UpdateMessageFn;
}): Promise<void> {
  const { conversationId, messageId, content, getAuthToken, updateMessage } = params;
  try {
    const saved = await saveMessageToDb(
      conversationId,
      { id: messageId, role: 'user', content },
      getAuthToken,
    );
    if (saved?.id && saved.id !== messageId) {
      updateMessage(messageId, { id: saved.id });
    }
  } catch (err) {
    notifyPersistenceFailure('user', err);
  }
}

/**
 * Persists the assistant's image-generation turn. Shared by
 * handleGenerateImage (new message) and handleRegenerateImageInPlace (update
 * in place, same message id) — the route is idempotent on the client-supplied
 * id (ON CONFLICT), so calling this again for an existing id upserts rather
 * than duplicating.
 */
export async function persistImageGenerationAssistantMessage(params: {
  conversationId: string;
  messageId: string;
  model: string | undefined;
  metadata: MessageMetadata;
  getAuthToken: AuthTokenProvider;
  updateMessage: UpdateMessageFn;
}): Promise<void> {
  const { conversationId, messageId, model, metadata, getAuthToken, updateMessage } = params;
  try {
    const saved = await saveMessageToDb(
      conversationId,
      {
        id: messageId,
        role: 'assistant',
        // Image-only turn: content is intentionally empty. The DB schema
        // rejects empty/whitespace content, so use the same zero-width
        // placeholder useChatStream uses for tool-only turns (see
        // EMPTY_ASSISTANT_CONTENT_PLACEHOLDER) rather than dropping the
        // image card on save.
        content: EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
        model,
        metadata,
      },
      getAuthToken,
    );
    if (saved?.id && saved.id !== messageId) {
      updateMessage(messageId, { id: saved.id });
    }
  } catch (err) {
    notifyPersistenceFailure('assistant', err);
  }
}
