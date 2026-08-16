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

export function mergeImageGenerationMetadata(
  previous: MessageMetadata | undefined,
  patch: Partial<MessageMetadata>,
): MessageMetadata {
  return { ...(previous ?? {}), ...patch };
}

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

export async function persistImageGenerationAssistantMessage(params: {
  conversationId: string;
  messageId: string;
  model: string | undefined;
  metadata: MessageMetadata;
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

export function requireImageMessagePersistence(result: ImageMessagePersistenceResult): {
  messageId: string;
} {
  if (result.ok) return { messageId: result.messageId };
  throw result.error instanceof Error
    ? result.error
    : new Error('Image transcript persistence failed');
}
