
import type { ConversationTag } from '@/services/autotag';

export function tagToBadgeColor(
  tag: ConversationTag,
): 'blue' | 'purple' | 'green' | 'yellow' | 'teal' | 'red' | 'gray' {
  const map: Record<
    ConversationTag,
    'blue' | 'purple' | 'green' | 'yellow' | 'teal' | 'red' | 'gray'
  > = {
    coding: 'blue',
    research: 'purple',
    writing: 'green',
    brainstorm: 'yellow',
    analysis: 'teal',
    debug: 'red',
    creative: 'purple',
    general: 'gray',
  };
  return map[tag] ?? 'gray';
}

export function formatTagCount(count: number): string {
  if (count >= 1000) return `${Math.floor(count / 1000)}k`;
  return String(count);
}

export function sortTagsByCount(
  tags: ConversationTag[],
  counts: Record<string, number>,
): ConversationTag[] {
  return [...tags].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}

export function shouldAutoTag(messageCount: number): boolean {
  return messageCount >= 3;
}
