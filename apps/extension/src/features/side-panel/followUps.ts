import type { ConversationEntry } from '../background/conversation-history';
import { CornerDownRight, renderIcon } from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';

export const MAX_FOLLOW_UPS_SHOWN = 3;

export interface FollowUpTarget {
  cloudConversationId: string;
  cloudMessageId: string;
  mirrored: boolean;
}

export function followUpsPath(target: FollowUpTarget): string {
  return `/api/chat/conversations/${encodeURIComponent(target.cloudConversationId)}/messages/${encodeURIComponent(target.cloudMessageId)}/follow-ups`;
}

/**
 * The server writes follow-ups from a turn it has stored. A turn sent in a
 * conversation the server already holds is stored under its cloud id as it
 * streams; the first turn of a new one only once the mirror delivers it, which
 * `mirrored` reports. A stopped, failed or unfinished answer already has its
 * own next step on screen.
 */
export function followUpTargetFor(entry: ConversationEntry | undefined): FollowUpTarget | null {
  const cloudConversationId = entry?.cloudSync?.conversationId;
  const last = entry?.messages[entry.messages.length - 1];
  if (!cloudConversationId || !last || last.role !== 'assistant') return null;
  if (last.streaming || last.error || last.userStopped || last.streamCancellation) return null;
  if (!last.cloudMessageId || last.content.trim().length === 0) return null;
  return {
    cloudConversationId,
    cloudMessageId: last.cloudMessageId,
    mirrored:
      last.cloudSyncedAt !== undefined &&
      (last.cloudSyncedChars === undefined || last.cloudSyncedChars >= last.content.length),
  };
}

export function readFollowUpSuggestions(body: unknown): string[] {
  const raw = (body as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .slice(0, MAX_FOLLOW_UPS_SHOWN);
}

export function buildFollowUps(
  suggestions: readonly string[],
  onSelect: (question: string) => void,
): HTMLElement {
  const group = el('div', {
    id: 'sp-follow-ups',
    class: 'sp-follow-ups',
    role: 'group',
    'aria-label': t('spFollowUpsLabel'),
  });
  for (const suggestion of suggestions) {
    const button = el('button', {
      class: 'sp-follow-up',
      type: 'button',
      'aria-label': t('spFollowUpAsk', [suggestion]),
    });
    button.appendChild(renderIcon(CornerDownRight, 14));
    button.appendChild(el('span', { class: 'sp-follow-up__text' }, suggestion));
    button.addEventListener('click', () => onSelect(suggestion));
    group.appendChild(button);
  }
  return group;
}
