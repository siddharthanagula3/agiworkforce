import {
  desktopDeepLink,
  parseDesktopDeepLink,
  type DesktopDeepLink,
} from '@agiworkforce/local-runtime-contract';
import { SETTINGS_DEEP_LINK_QUERY_KEY } from '@/features/settings/lib/web-settings-sections';
import { isWebSettingsSection } from '@/features/settings/lib/web-settings-sections';

const CHAT_PATH = '/chat';
const PROJECT_PATH = '/chat/projects';

export function conversationDeepLink(conversationId: string): string {
  return desktopDeepLink('chat', conversationId);
}

/**
 * The in-app path a `agiworkforce-cloud://` link names, or null when it names
 * nothing this build can render. An unroutable link is dropped rather than
 * landing the user on a settings pane that says it has no content.
 */
export function deepLinkDestination(url: string): string | null {
  const link: DesktopDeepLink | null = parseDesktopDeepLink(url);
  if (!link) return null;

  if (link.target === 'chat') return `${CHAT_PATH}/${encodeURIComponent(link.id)}`;
  if (link.target === 'project') return `${PROJECT_PATH}/${encodeURIComponent(link.id)}`;
  if (!isWebSettingsSection(link.id)) return null;
  return `${CHAT_PATH}?${SETTINGS_DEEP_LINK_QUERY_KEY}=${encodeURIComponent(link.id)}`;
}
