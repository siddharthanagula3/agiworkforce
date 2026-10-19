const MENTION_AT_END = /(?:^|\s)@([^\s@]*)$/;

export function trailingMention(text: string): string | null {
  const match = MENTION_AT_END.exec(text);
  return match ? (match[1] ?? '') : null;
}

export function withoutTrailingMention(text: string): string {
  return text.replace(/@[^\s@]*$/, '');
}
