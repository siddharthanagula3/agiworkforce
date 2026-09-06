/**
 * The ONE primary-rail definition for the signed-in web app.
 *
 * Why this file exists: the rail used to be two hand-maintained arrays, one in
 * `WebChatPage` (the chat surface, which is also the app's default landing
 * screen) and one in `WebAppShell` (Projects / Library / Tasks). They drifted.
 * Verified live before this was extracted: `/chat` rendered 6 entries and
 * `/chat/library` rendered 7, so `Tasks` existed but was unreachable from the
 * screen most users never leave. `WebChatPage` also hardcoded
 * `isActive: true` for Chat and `false` for everything else, so the selection
 * was wrong the moment you opened `/chat/[sessionId]`.
 *
 * Both shells now call `buildAppNavItems`. Adding, removing, or reordering a
 * destination is a one-place change, and `isActive` is derived from the live
 * pathname instead of being asserted.
 *
 * NO router, store, or React import lives here, the caller supplies `navigate`
 * (its own `router.push`), which keeps this module a pure data definition
 * that can be unit-tested.
 */

import {
  CalendarClock,
  FolderOpen,
  LibraryBig,
  MessageSquare,
  ShieldCheck,
} from '@agiworkforce/icons';
import type { SidebarIconComponent, SidebarNavItem } from '@agiworkforce/ui';

/**
 * Sections that live UNDER `/chat` but are their own rail destination. A
 * pathname matching one of these is not the Chat surface, so `chat-home` must
 * not claim it; every other `/chat/...` path is a conversation and IS Chat.
 */
const CHAT_SECTION_PREFIXES = [
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
  /** Derived from the live pathname, never hardcoded by a caller. */
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
  // Library, one destination for everything the account has produced or
  // uploaded. Artifacts used to be a second rail entry over the same material:
  // the server already tags every `media_assets` row `surface: 'artifact' |
  // 'file'` in `classifyGeneratedFile`, and one generated file appeared in BOTH
  // destinations under two ids that could never dedupe, so deleting it here left
  // a stale card there. Library now carries that split as a filter instead, and
  // `/chat/artifacts` redirects onto it. `/gallery` keeps the public,
  // SEO-indexed gallery for signed-out visitors.
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
  // Admin, directory sync is the org-scoped page an admin or owner can
  // actually use. The console at `/admin` itself is platform-operator only
  // (AGI_PLATFORM_ADMIN_USER_IDS), matching the cross-tenant APIs it drives, so
  // sending an org admin there would bounce them back to `/`.
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
