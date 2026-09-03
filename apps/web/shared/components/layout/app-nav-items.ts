import {
  CalendarClock,
  FolderOpen,
  LibraryBig,
  MessageSquare,
  ShieldCheck,
  TerminalSquare,
} from '@agiworkforce/icons';
import type { SidebarIconComponent, SidebarNavItem } from '@agiworkforce/ui';

/**
 * Sections that live UNDER `/chat` but are their own rail destination. A
 * pathname matching one of these is not the Chat surface, so `chat-home` must
 * not claim it; every other `/chat/...` path is a conversation and IS Chat.
 */
const CHAT_SECTION_PREFIXES = [
  '/chat/code',
  '/chat/projects',
  '/chat/artifacts',
  '/chat/library',
  '/chat/schedules',
  '/chat/customize',
] as const;

function isChatSectionPath(pathname: string): boolean {
  return CHAT_SECTION_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** `/x` matches `/x` and `/x/anything`, never `/xyz`. */
function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export interface AppNavDestination {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  /** Route pushed on click. */
  href: string;
  isActive: (pathname: string) => boolean;
  /**
   * Rendered only for an organisation admin or owner, and so it may only point
   * at an org-scoped route. Platform-operator surfaces are gated on an
   * allowlist this flag knows nothing about, so offering one here would be a
   * link that redirects straight back out.
   */
  adminOnly?: boolean;
  /**
   * Entries the user may hide from the rail. Chat is deliberately not
   * hideable: it is where "new chat" and the conversation list live, so a rail
   * without it has no way back to the product's main surface.
   */
  hideable?: boolean;
}

/**
 * The rail, in render order. Every signed-in surface shows all of these except
 * the entries marked `adminOnly`.
 */
export const APP_NAV_DESTINATIONS: readonly AppNavDestination[] = [
  {
    id: 'chat-home',
    label: 'Chat',
    icon: MessageSquare,
    href: '/chat',
    isActive: (pathname) => isUnder(pathname, '/chat') && !isChatSectionPath(pathname),
  },
  {
    id: 'code',
    label: 'Code',
    icon: TerminalSquare,
    href: '/chat/code',
    isActive: (pathname) => isUnder(pathname, '/chat/code'),
    hideable: true,
  },
  // Persistent Projects entry (claude.ai parity). The Projects *section* in the
  // sidebar body only renders once the user has at least one project, so a
  // zero-project user would otherwise have no way to reach the hub.
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderOpen,
    href: '/chat/projects',
    isActive: (pathname) => isUnder(pathname, '/chat/projects'),
    hideable: true,
  },
  {
    id: 'library',
    label: 'Library',
    icon: LibraryBig,
    href: '/chat/library',
    isActive: (pathname) =>
      isUnder(pathname, '/chat/library') || isUnder(pathname, '/chat/artifacts'),
    hideable: true,
  },
  {
    id: 'schedules',
    label: 'Schedules',
    icon: CalendarClock,
    href: '/chat/schedules',
    isActive: (pathname) => isUnder(pathname, '/chat/schedules'),
    hideable: true,
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    href: '/admin/directory-sync',
    isActive: (pathname) => isUnder(pathname, '/admin'),
    hideable: true,
    adminOnly: true,
  },
];

/**
 * Bind the rail to a surface's router.
 *
 * `pathname` comes from `usePathname()`; pass it through unchanged so the
 * active entry tracks the real route.
 */
export function buildAppNavItems(options: {
  pathname: string;
  navigate: (href: string) => void;
  /** Whether the signed-in user holds the admin or owner role. */
  isAdmin?: boolean;
  /**
   * Destination ids the user chose to hide. A non-hideable entry stays whatever
   * this contains, so a stale or hand-edited value cannot empty the rail.
   */
  hiddenIds?: readonly string[];
}): SidebarNavItem[] {
  const { pathname, navigate, isAdmin = false, hiddenIds = [] } = options;
  return APP_NAV_DESTINATIONS.filter((destination) => !destination.adminOnly || isAdmin)
    .filter((destination) => !(destination.hideable && hiddenIds.includes(destination.id)))
    .map((destination) => {
      const { href } = destination;
      return {
        id: destination.id,
        label: destination.label,
        icon: destination.icon,
        onClick: () => navigate(href),
        isActive: destination.isActive(pathname),
      };
    });
}
