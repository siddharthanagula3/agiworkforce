import type { MemoryFact } from '@agiworkforce/unified-chat';
import { fenceUntrustedMemoryContent } from '@agiworkforce/utils';

const MAX_FACTS = 50;
const MAX_TOTAL_CHARS = 4000;

export function buildMemorySystemContent(facts: readonly MemoryFact[]): string | null {
  if (!facts.length) return null;

  const lines: string[] = [];
  let used = 0;
  for (const fact of facts) {
    if (lines.length >= MAX_FACTS) break;
    const text = fact.text.trim();
    if (!text) continue;
    const line = `- ${text}`;
    if (used + line.length > MAX_TOTAL_CHARS) break;
    lines.push(line);
    used += line.length + 1;
  }

  if (!lines.length) return null;

  return fenceUntrustedMemoryContent(lines.join('\n'));
}

export function withMemorySystemMessage<T extends { role: string; content: string }>(
  history: T[],
  memoryContent: string | null,
): T[] {
  if (!memoryContent) return history;

  const head = history[0];
  if (head?.role === 'system') {
    const merged = { ...head, content: `${memoryContent}\n\n${head.content}` } as T;
    return [merged, ...history.slice(1)];
  }

  const systemMessage = { role: 'system', content: memoryContent } as unknown as T;
  return [systemMessage, ...history];
}
