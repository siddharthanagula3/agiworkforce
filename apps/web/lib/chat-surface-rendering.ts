import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';

/**
 * What each chat client renders of a turn beyond Markdown, read from the
 * clients. The web chat, also served inside the desktop app, renders a fenced
 * email or writing block as a card through unified-chat's MarkdownContent; the
 * mobile app and the extensions show it as a code block. The web chat and the
 * mobile app publish an artifact as a hosted page, where its window.agi calls
 * run; the desktop app publishes to a local file, and the extensions do not
 * publish.
 */
const WRITING_CARD_SURFACES: ReadonlySet<CloudChatSurface> = new Set<CloudChatSurface>([
  'web',
  'desktop',
]);

const ARTIFACT_APP_SURFACES: ReadonlySet<CloudChatSurface> = new Set<CloudChatSurface>([
  'web',
  'mobile',
]);

export function surfaceRendersWritingCards(surface: CloudChatSurface): boolean {
  return WRITING_CARD_SURFACES.has(surface);
}

export function surfacePublishesArtifactApps(surface: CloudChatSurface): boolean {
  return ARTIFACT_APP_SURFACES.has(surface);
}
