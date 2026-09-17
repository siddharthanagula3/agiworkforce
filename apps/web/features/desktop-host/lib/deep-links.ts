import {
  desktopDeepLink,
  parseDesktopDeepLink,
  type DesktopDeepLink,
} from '@agiworkforce/local-runtime-contract';
import { isProductLinkTarget, productLinkPath } from '@agiworkforce/types';
import { SETTINGS_DEEP_LINK_QUERY_KEY } from '@/features/settings/lib/web-settings-sections';
import { isWebSettingsSection } from '@/features/settings/lib/web-settings-sections';

/**
 * Where the product starts. The shell opens here, a deep link resolves against
 * it, and a page the shell reached by mistake offers it instead of the
 * marketing home, which the shell does not host.
 */
export const PRODUCT_HOME_PATH = '/chat';

const CHAT_PATH = PRODUCT_HOME_PATH;
const PROJECT_PATH = `${PRODUCT_HOME_PATH}/projects`;

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
  if (isProductLinkTarget(link.target)) return productLinkPath(link.target, link.id);
  // A `agiworkforce-cloud://settings/...` link only ever arrives from the
  // shell, so the desktop-only sections are routable here.
  if (!isWebSettingsSection(link.id, true)) return null;
  return `${CHAT_PATH}?${SETTINGS_DEEP_LINK_QUERY_KEY}=${encodeURIComponent(link.id)}`;
}
