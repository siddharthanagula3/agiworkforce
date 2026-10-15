import { desktopDeepLink } from '@/lib/tauri-electron/bridgeContract';
import { useNotificationTargetStore, type NotificationTargetKind } from './notificationTarget';

type NotificationPanel = 'automation' | 'scheduled' | 'agent-tasks';

interface PanelRoute {
  panel: NotificationPanel;
  item?: NotificationTargetKind;
}

const PANEL_ROUTES: ReadonlyMap<string, PanelRoute> = new Map<string, PanelRoute>([
  ['trigger', { panel: 'automation', item: 'trigger' }],
  ['schedule', { panel: 'scheduled', item: 'schedule' }],
  ['background-agent', { panel: 'agent-tasks', item: 'background-agent' }],
  ['agent-tasks', { panel: 'agent-tasks' }],
]);

const DEEP_LINK_SCHEMES = ['chat', 'settings'] as const;
type DeepLinkScheme = (typeof DEEP_LINK_SCHEMES)[number];

interface NotificationRoute {
  scheme: string;
  id: string;
}

function parseNotificationRoute(url: string | null | undefined): NotificationRoute | null {
  if (!url) return null;
  const separator = url.indexOf(':');
  if (separator <= 0 || separator === url.length - 1) return null;
  return { scheme: url.slice(0, separator), id: url.slice(separator + 1) };
}

function isDeepLinkScheme(scheme: string): scheme is DeepLinkScheme {
  return (DEEP_LINK_SCHEMES as readonly string[]).includes(scheme);
}

export function hasNotificationRoute(url: string | null | undefined): boolean {
  const route = parseNotificationRoute(url);
  return route !== null && (isDeepLinkScheme(route.scheme) || PANEL_ROUTES.has(route.scheme));
}

export async function openNotificationRoute(url: string | null | undefined): Promise<boolean> {
  const route = parseNotificationRoute(url);
  if (!route) return false;
  if (isDeepLinkScheme(route.scheme)) {
    const { routeDesktopDeepLink } = await import('@/lib/desktopDeepLinkRouter');
    return routeDesktopDeepLink(desktopDeepLink(route.scheme, route.id));
  }
  const panelRoute = PANEL_ROUTES.get(route.scheme);
  if (!panelRoute) return false;
  if (panelRoute.item) {
    useNotificationTargetStore.getState().request({ kind: panelRoute.item, id: route.id });
  }
  window.dispatchEvent(new CustomEvent('desktop:navigate-panel', { detail: panelRoute.panel }));
  return true;
}
