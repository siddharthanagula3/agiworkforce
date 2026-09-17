import { SETTINGS_NAV, type SettingsNavKey } from '@agiworkforce/ui';
import { productLinkUrl, type ProductLinkTarget } from '@agiworkforce/types';
import { WEB_APP_URL } from '../api/config';
import { openExternalUrl } from '../utils/navigation';
import { useChatStore } from '../stores/chat/chatStore';
import { useProjectStore } from '../stores/projectStore';
import {
  LEGACY_TAB_MAP,
  useSettingsDialogStore,
  type SettingsTab,
} from '../stores/settingsDialogStore';
import { parseDesktopDeepLink } from './tauri-electron/bridgeContract';

function navigatePanel(panel: 'chat' | 'projects'): void {
  window.dispatchEvent(new CustomEvent('desktop:navigate-panel', { detail: panel }));
}

function openConversation(id: string): boolean {
  const { conversations, selectConversation } = useChatStore.getState();
  if (!conversations.some((conversation) => conversation.id === id)) return false;
  selectConversation(id);
  navigatePanel('chat');
  return true;
}

function openProject(id: string): boolean {
  const { projects, setActiveProject } = useProjectStore.getState();
  if (!projects.some((project) => project.id === id)) return false;
  setActiveProject(id);
  navigatePanel('projects');
  return true;
}

function openOnWeb(target: ProductLinkTarget, id: string): boolean {
  void openExternalUrl(productLinkUrl(WEB_APP_URL, target, id));
  return true;
}

function openSettingsTab(id: string): boolean {
  const tab = id as SettingsTab;
  const canonical = (LEGACY_TAB_MAP[tab] ?? tab) as SettingsNavKey;
  if (!SETTINGS_NAV.some((entry) => entry.key === canonical)) return false;
  useSettingsDialogStore.getState().openSettings(tab);
  return true;
}

/**
 * Resolves one `agiworkforce-cloud://` link, whether the shell delivered it
 * from an external open or from a click on a notification the page itself
 * raised. Returns whether it navigated: an id naming nothing that exists leaves
 * the user where they are rather than opening an empty view.
 */
export function routeDesktopDeepLink(url: string): boolean {
  const link = parseDesktopDeepLink(url);
  if (!link) return false;
  switch (link.target) {
    case 'chat':
      return openConversation(link.id);
    case 'project':
      return openProject(link.id);
    case 'settings':
      return openSettingsTab(link.id);
    default:
      return openOnWeb(link.target, link.id);
  }
}

export function subscribeDesktopDeepLinkEvents(): () => void {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<{ url?: unknown } | null>).detail;
    if (detail && typeof detail.url === 'string') routeDesktopDeepLink(detail.url);
  };
  window.addEventListener('agi-deep-link', handle);
  return () => window.removeEventListener('agi-deep-link', handle);
}
