import { api } from '@/services/api';

export function followUpsPath(conversationId: string, messageId: string): string {
  return `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/follow-ups`;
}

function readSuggestions(body: unknown): string[] {
  const raw = (body as { suggestions?: unknown } | null)?.suggestions;
  return Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    : [];
}

export async function fetchFollowUpSuggestions(
  conversationId: string,
  messageId: string,
  signal: AbortSignal,
): Promise<string[]> {
  return readSuggestions(
    await api.post<unknown>(followUpsPath(conversationId, messageId), undefined, { signal }),
  );
}
