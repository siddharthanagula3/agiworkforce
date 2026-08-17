export interface MentionMatch {
  query: string;
  startIndex: number;
}

const MENTION_PATTERN = /(?:^|\s)@([A-Za-z0-9_.\-/]*)$/;

export function matchMentionQuery(
  text: string,
  cursorIndex: number = text.length,
): MentionMatch | null {
  const beforeCursor = text.slice(0, Math.max(0, Math.min(cursorIndex, text.length)));
  const match = MENTION_PATTERN.exec(beforeCursor);
  if (!match) return null;
  const query = match[1] ?? '';
  return { query, startIndex: beforeCursor.length - query.length - 1 };
}
