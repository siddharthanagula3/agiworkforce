/**
 * Auto-tagging service.
 * Classifies conversations by content type (coding, research, writing, etc.)
 * and provides batch retrieval + filtering.
 */

import { api } from './api';

export type ConversationTag =
  | 'coding'
  | 'research'
  | 'writing'
  | 'brainstorm'
  | 'analysis'
  | 'debug'
  | 'creative'
  | 'general';

export interface TagInfo {
  id: ConversationTag;
  label: string;
  color: string; // hex color
  icon: string; // lucide icon name
}

export const TAG_CATALOG: TagInfo[] = [
  { id: 'coding', label: 'Coding', color: '#3b82f6', icon: 'Code2' },
  { id: 'research', label: 'Research', color: '#8b5cf6', icon: 'BookOpen' },
  { id: 'writing', label: 'Writing', color: '#10b981', icon: 'PenTool' },
  { id: 'brainstorm', label: 'Brainstorm', color: '#f59e0b', icon: 'Lightbulb' },
  { id: 'analysis', label: 'Analysis', color: '#06b6d4', icon: 'BarChart3' },
  { id: 'debug', label: 'Debug', color: '#ef4444', icon: 'Bug' },
  { id: 'creative', label: 'Creative', color: '#ec4899', icon: 'Palette' },
  { id: 'general', label: 'General', color: '#6b7280', icon: 'MessageSquare' },
];

/** Get tag info by ID. Falls back to 'general' if not found. */
export function getTagInfo(tagId: ConversationTag): TagInfo {
  return TAG_CATALOG.find((t) => t.id === tagId) ?? TAG_CATALOG[TAG_CATALOG.length - 1];
}

/** Request auto-classification for a single conversation. */
export async function classifyConversation(conversationId: string): Promise<ConversationTag> {
  const result = await api.post<{ tag: ConversationTag }>('/api/autotag/classify', {
    conversationId,
  });
  return result.tag;
}

/** Get tags for multiple conversations in one request. */
export async function batchGetTags(
  conversationIds: string[],
): Promise<Record<string, ConversationTag>> {
  const result = await api.post<{ tags: Record<string, ConversationTag> }>('/api/autotag/batch', {
    conversationIds,
  });
  return result.tags;
}

/** Get all conversation IDs that match a specific tag. */
export async function getConversationsByTag(tag: ConversationTag): Promise<string[]> {
  const params = new URLSearchParams({ tag });
  const result = await api.get<{ conversationIds: string[] }>(
    `/api/autotag/conversations?${params.toString()}`,
  );
  return result.conversationIds;
}
