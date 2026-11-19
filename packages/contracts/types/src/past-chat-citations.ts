export interface PastChatCitation {
  id: string;
  conversationId: string;
  messageId: string;
  title: string;
  createdAt: string;
}

export const PAST_CHAT_CITATIONS_HEADER = 'x-agi-past-chat-citations';
export const PAST_CHAT_CITATIONS_METADATA_KEY = 'pastChatSources';
export const PAST_CHAT_HIGHLIGHT_PARAM = 'highlightMessage';

function pastChatCitation(value: unknown): PastChatCitation | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, conversationId, messageId, title, createdAt } = value as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    typeof conversationId !== 'string' ||
    typeof messageId !== 'string' ||
    typeof title !== 'string' ||
    typeof createdAt !== 'string' ||
    !conversationId ||
    !messageId
  ) {
    return null;
  }
  return { id, conversationId, messageId, title, createdAt };
}

export function parsePastChatCitations(value: unknown): PastChatCitation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const citation = pastChatCitation(entry);
    return citation ? [citation] : [];
  });
}

export function pastChatCitationsFromMetadata(metadata: unknown): PastChatCitation[] {
  if (typeof metadata !== 'object' || metadata === null) return [];
  return parsePastChatCitations(
    (metadata as Record<string, unknown>)[PAST_CHAT_CITATIONS_METADATA_KEY],
  );
}

export function pastChatCitationDate(createdAt: string, locale?: string): string | null {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
