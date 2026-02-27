/**
 * Tag utility helpers for the auto-tagging system.
 * Maps tag IDs to Badge component colors, formatting, sorting, etc.
 */

import type { ConversationTag } from '@/services/autotag';

/** Map a conversation tag to the Badge component's color prop. */
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

/** Format a tag count for compact display (e.g. 1234 -> "1k"). */
export function formatTagCount(count: number): string {
  if (count >= 1000) return `${Math.floor(count / 1000)}k`;
  return String(count);
}

/** Sort tags by count (most used first). */
export function sortTagsByCount(
  tags: ConversationTag[],
  counts: Record<string, number>,
): ConversationTag[] {
  return [...tags].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
}

/** Check if a conversation has enough messages to be auto-tagged. */
export function shouldAutoTag(messageCount: number): boolean {
  return messageCount >= 3;
}
