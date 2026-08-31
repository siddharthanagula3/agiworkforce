export interface RetryableTurnMessage {
  id: string;
  role: string;
  error?: unknown;
}

/**
 * The user turn a failed send should offer to resend, or null when there is
 * nothing to retry.
 *
 * A dropped turn leaves the user's message trailing with no reply, so the
 * error banner offers to resend it rather than making the reader hunt for the
 * regenerate action on a message whose reply never arrived.
 *
 * Scanning backwards stops at the first assistant turn that succeeded: past
 * that point the conversation is settled, and offering to resend an older turn
 * would silently discard everything after it.
 */
export function retryableUserMessageId(
  messages: readonly RetryableTurnMessage[],
  isStreaming: boolean,
): string | null {
  if (isStreaming) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    if (!candidate) continue;
    if (candidate.role === 'user') return candidate.id;
    if (candidate.role === 'assistant' && !candidate.error) return null;
  }
  return null;
}
