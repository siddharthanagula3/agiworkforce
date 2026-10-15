import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';

/**
 * What each chat client renders of a turn beyond Markdown, read from the
 * clients. The web chat, also served inside the desktop app, renders a fenced
 * email or writing block as a card through unified-chat's MarkdownContent; the
 * mobile app and the extensions show it as a code block.
 */
const WRITING_CARD_SURFACES: ReadonlySet<CloudChatSurface> = new Set<CloudChatSurface>([
  'web',
  'desktop',
]);

export function surfaceRendersWritingCards(surface: CloudChatSurface): boolean {
  return WRITING_CARD_SURFACES.has(surface);
}
