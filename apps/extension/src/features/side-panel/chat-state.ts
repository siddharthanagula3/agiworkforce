export interface SidePanelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: boolean;
  timestamp: number;
}

/**
 * Resolve the visible user turn before it is admitted to Managed Cloud chat.
 * Attachment-only turns must never leave an enabled Send control as a silent
 * no-op. Keep filenames out of this trusted instruction channel because they
 * are user-controlled metadata.
 */
export function resolveComposerPrompt(text: string, attachmentCount: number): string | null {
  const trimmed = text.trim();
  if (trimmed) return trimmed;
  if (attachmentCount <= 0) return null;
  return attachmentCount === 1
    ? 'Please analyze the attached image.'
    : 'Please analyze the attached images.';
}

/** Mutates the active view in place and returns the number of discarded messages. */
export function trimChatMessages(messages: SidePanelChatMessage[], maximum: number): number {
  const overflow = Math.max(0, messages.length - Math.max(1, maximum));
  if (overflow > 0) messages.splice(0, overflow);
  return overflow;
}

/** Preserve partial output and terminate the same assistant record on stream failure. */
export function applyStreamFailure(
  messages: SidePanelChatMessage[],
  streamId: string,
  errorText: string,
  timestamp = Date.now(),
): void {
  const content = `Error: ${errorText}`;
  const existing = messages.find((message) => message.id === streamId);
  if (existing) {
    existing.content = existing.content ? `${existing.content}\n\n${content}` : content;
    existing.streaming = false;
    existing.error = true;
    return;
  }
  messages.push({
    id: streamId,
    role: 'assistant',
    content,
    error: true,
    timestamp,
  });
}

export function selectModelHistory(
  messages: readonly SidePanelChatMessage[],
  excludedMessageId?: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((message) => !message.error && message.id !== excludedMessageId)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function shouldRebuildMessageDom(input: {
  forceRebuild: boolean;
  renderedCount: number;
  messageCount: number;
}): boolean {
  return input.forceRebuild || input.renderedCount > input.messageCount;
}
