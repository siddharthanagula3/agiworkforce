const pendingSends = new Map<string, string>();

export function handOffConversationSend(conversationId: string, text: string): void {
  pendingSends.set(conversationId, text);
}

export function takeConversationSend(conversationId: string): string | null {
  const text = pendingSends.get(conversationId) ?? null;
  pendingSends.delete(conversationId);
  return text;
}
