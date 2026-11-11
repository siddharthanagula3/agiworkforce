import { markdownRenderedText } from '@agiworkforce/unified-chat/markdown-document';

export type RenderedTextCache = Map<string, string>;

interface SearchableGroup {
  readonly messages: ReadonlyArray<{ readonly content?: unknown }>;
}

export function matchingGroupIndexes(
  groups: readonly SearchableGroup[],
  query: string,
  cache: RenderedTextCache,
): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    cache.clear();
    return [];
  }
  const used = new Set<string>();
  const matches: number[] = [];
  groups.forEach((group, index) => {
    const hit = group.messages.some((message) => {
      if (typeof message.content !== 'string') return false;
      used.add(message.content);
      let text = cache.get(message.content);
      if (text === undefined) {
        text = markdownRenderedText(message.content).toLowerCase();
        cache.set(message.content, text);
      }
      return text.includes(needle);
    });
    if (hit) matches.push(index);
  });
  for (const content of cache.keys()) {
    if (!used.has(content)) cache.delete(content);
  }
  return matches;
}
