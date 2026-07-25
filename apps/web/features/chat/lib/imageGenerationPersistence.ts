import {
  saveMessageToDb,
  notifyPersistenceFailure,
  EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
} from '@/lib/hooks/useChatStream';
import type { Message, MessageMetadata } from '@shared/stores/web-chat-store';

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

/**
 * PER-30 — a metadata patch that MERGES instead of replacing.
 *
 * `updateMessage` performs a shallow merge on the message, so passing
 * `metadata: {...}` REPLACES the whole metadata object. `applyImageError`
 * passed `metadata: undefined` on the non-paywall branch, and the paywall
 * branch passed an object containing only `paywall` — either way
 * `imageGenPrompt` / `imageGenAspect` / `imageGenModel` were discarded, which
 * are precisely the fields a retry needs. Callers must build their metadata
 * patch through this helper against the message's CURRENT metadata.
 */
export function mergeImageGenerationMetadata(
  previous: MessageMetadata | undefined,
  patch: Partial<MessageMetadata>,
): MessageMetadata {
  return { ...(previous ?? {}), ...patch };
}

/**
 * PER-29 — the metadata for entering the "regenerating" state.
 *
 * In-place regeneration used to clear `metadata.imageUrl` and set
 * `isStreaming: true` BEFORE awaiting the provider, with no try/catch around
 * the await. A failure therefore left a card that spun forever, with the
 * original image already gone and nothing persisted. The original URL is
 * preserved here (under `imageUrl`) so `imageGenerationFailureMetadata` can put
 * it back, and the card's spinner is driven by the message's `isStreaming`
 * flag, which the caller must clear in a `finally`.
 */
export function imageRegenerationPendingMetadata(
  previous: MessageMetadata | undefined,
  opts: { prompt: string; aspectRatio: string; modelId?: string },
): MessageMetadata {
  return mergeImageGenerationMetadata(previous, {
    toolType: 'image-generation',
    imageGenPrompt: opts.prompt,
    imageGenAspect: opts.aspectRatio,
    ...(opts.modelId !== undefined ? { imageGenModel: opts.modelId } : {}),
  });
}

/**
 * PER-29/PER-30 — the metadata for a failed (re)generation.
 *
 * Keeps every retry parameter, restores the previous image if there was one,
 * and never returns `undefined` (which would wipe the metadata object).
 */
export function imageGenerationFailureMetadata(
  previous: MessageMetadata | undefined,
  options: { paywall?: MessageMetadata['paywall'] } = {},
): MessageMetadata {
  return mergeImageGenerationMetadata(previous, {
    toolType: 'image-generation',
    ...(options.paywall ? { paywall: options.paywall } : {}),
  });
}

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
