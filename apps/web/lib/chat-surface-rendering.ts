import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';

/**
 * What each chat client renders of a turn beyond Markdown, read from the
 * clients. The desktop app loads the web chat by default, which reports the
 * desktop surface, so both render the same: a fenced email or writing block as
 * a card through unified-chat's MarkdownContent, and an artifact published as
 * a hosted page, where its window.agi calls run. The mobile app also publishes
 * hosted artifacts but shows email and writing blocks as code blocks; the
 * extensions do neither.
 */
const WRITING_CARD_SURFACES: ReadonlySet<CloudChatSurface> = new Set<CloudChatSurface>([
  'web',
  'desktop',
]);

const ARTIFACT_APP_SURFACES: ReadonlySet<CloudChatSurface> = new Set<CloudChatSurface>([
  'web',
  'desktop',
  'mobile',
]);

export function surfaceRendersWritingCards(surface: CloudChatSurface): boolean {
  return WRITING_CARD_SURFACES.has(surface);
}

export function surfacePublishesArtifactApps(surface: CloudChatSurface): boolean {
  return ARTIFACT_APP_SURFACES.has(surface);
}
