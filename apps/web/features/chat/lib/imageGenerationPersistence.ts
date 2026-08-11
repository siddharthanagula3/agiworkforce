import {
  saveMessageToDb,
  notifyPersistenceFailure,
  EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
} from '@/lib/hooks/useChatStream';
import { CHAT_MESSAGE_PERSISTENCE_TIMEOUT_MS } from '@shared/config/network';
import type { Message, MessageMetadata } from '@shared/stores/web-chat-store';

type AuthTokenProvider = () => Promise<string>;
type UpdateMessageFn = (id: string, updates: Partial<Message>) => void;

export type ImageMessagePersistenceResult =
  | { ok: true; messageId: string }
  | { ok: false; error: unknown };

async function withImageMessagePersistenceDeadline<T>(
  save: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new Error('Image transcript persistence timed out')),
    CHAT_MESSAGE_PERSISTENCE_TIMEOUT_MS,
  );
  try {
    return await save(controller.signal);
  } finally {
    clearTimeout(deadline);
  }
}

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
 * These helpers persist those turns the same way useChatStream's
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
    imageRetryAt: undefined,
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
  options: { paywall?: MessageMetadata['paywall']; retryAt?: string } = {},
): MessageMetadata {
  return mergeImageGenerationMetadata(previous, {
    toolType: 'image-generation',
    ...(options.paywall ? { paywall: options.paywall } : {}),
    imageRetryAt: options.retryAt,
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
}): Promise<ImageMessagePersistenceResult> {
  const { conversationId, messageId, content, getAuthToken, updateMessage } = params;
  try {
    const saved = await withImageMessagePersistenceDeadline((signal) =>
      saveMessageToDb(conversationId, { id: messageId, role: 'user', content }, getAuthToken, {
        signal,
      }),
    );
    if (saved?.id && saved.id !== messageId) {
      updateMessage(messageId, { id: saved.id });
    }
    return { ok: true, messageId: saved.id };
  } catch (err) {
    notifyPersistenceFailure('user', err);
    return { ok: false, error: err };
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
  /** Visible terminal failure copy; image/video-only success and refusal rows omit it. */
  content?: string;
  getAuthToken: AuthTokenProvider;
  updateMessage: UpdateMessageFn;
}): Promise<ImageMessagePersistenceResult> {
  const { conversationId, messageId, model, metadata, content, getAuthToken, updateMessage } =
    params;
  try {
    const saved = await withImageMessagePersistenceDeadline((signal) =>
      saveMessageToDb(
        conversationId,
        {
          id: messageId,
          role: 'assistant',
          // Media-only success and refusal turns intentionally render from
          // metadata. The DB schema rejects empty/whitespace content, so use the
          // same zero-width placeholder useChatStream uses for tool-only turns.
          // Generic terminal failures carry their visible sentence instead.
          content: content || EMPTY_ASSISTANT_CONTENT_PLACEHOLDER,
          model,
          metadata,
        },
        getAuthToken,
        { signal },
      ),
    );
    if (saved?.id && saved.id !== messageId) {
      updateMessage(messageId, { id: saved.id });
    }
    return { ok: true, messageId: saved.id };
  } catch (err) {
    notifyPersistenceFailure('assistant', err);
    return { ok: false, error: err };
  }
}

/**
 * Convert the persistence mechanic's explicit result into control flow for a
 * durability-sensitive action. Best-effort callers may inspect/ignore the
 * result; paid image actions call this before crossing the provider boundary
 * and after receiving an asset so neither failure can look successful.
 */
export function requireImageMessagePersistence(result: ImageMessagePersistenceResult): {
  messageId: string;
} {
  if (result.ok) return { messageId: result.messageId };
  throw result.error instanceof Error
    ? result.error
    : new Error('Image transcript persistence failed');
}
