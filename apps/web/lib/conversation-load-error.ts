import type { ExternalToast } from 'sonner';

export const CONVERSATION_NOT_FOUND_MESSAGE =
  'This conversation is unavailable. It may have been deleted.';

const NOT_FOUND_TOAST_DURATION_MS = 8_000;

export function conversationUnavailableToastOptions(
  message: string,
  conversationId: string,
  retry: () => void,
): ExternalToast {
  const id = `conversation-unavailable-${conversationId}`;
  return message === CONVERSATION_NOT_FOUND_MESSAGE
    ? { id, duration: NOT_FOUND_TOAST_DURATION_MS }
    : { id, action: { label: 'Retry', onClick: retry } };
}
