const OPEN_TAG = '<thinking>';
const CLOSE_TAG = '</thinking>';

export function longestTrailingTagPrefix(value: string, tag: string): number {
  const maxLength = Math.min(value.length, tag.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (value.endsWith(tag.slice(0, length))) return length;
  }
  return 0;
}

export type ThinkingTagPart =
  { type: 'text' | 'thinking'; text: string } | { type: 'thinking-start' | 'thinking-end' };

export class ThinkingTagSplitter {
  private buffer = '';
  private thinking = false;

  get isThinking(): boolean {
    return this.thinking;
  }

  get retainedCharacters(): number {
    return this.buffer.length;
  }

  push(text: string): ThinkingTagPart[] {
    this.buffer += text;
    return this.flush();
  }

  flush(isFinal = false): ThinkingTagPart[] {
    const parts: ThinkingTagPart[] = [];
    while (true) {
      const openIdx = this.buffer.indexOf(OPEN_TAG);
      const closeIdx = this.buffer.indexOf(CLOSE_TAG);
      if (!this.thinking && openIdx !== -1) {
        const before = this.buffer.slice(0, openIdx);
        if (before) parts.push({ type: 'text', text: before });
        this.thinking = true;
        parts.push({ type: 'thinking-start' });
        this.buffer = this.buffer.slice(openIdx + OPEN_TAG.length);
        continue;
      }
      if (this.thinking && closeIdx !== -1) {
        const reasoning = this.buffer.slice(0, closeIdx);
        if (reasoning) parts.push({ type: 'thinking', text: reasoning });
        this.thinking = false;
        parts.push({ type: 'thinking-end' });
        this.buffer = this.buffer.slice(closeIdx + CLOSE_TAG.length);
        continue;
      }
      const retained = isFinal
        ? 0
        : longestTrailingTagPrefix(this.buffer, this.thinking ? CLOSE_TAG : OPEN_TAG);
      const safe = this.buffer.slice(0, this.buffer.length - retained);
      if (safe) parts.push({ type: this.thinking ? 'thinking' : 'text', text: safe });
      this.buffer = this.buffer.slice(safe.length);
      return parts;
    }
  }

  closeThinking(): boolean {
    if (!this.thinking) return false;
    this.thinking = false;
    this.buffer = '';
    return true;
  }
}
