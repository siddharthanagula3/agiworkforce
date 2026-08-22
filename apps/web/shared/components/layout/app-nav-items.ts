/**
 * The ONE primary-rail definition for the signed-in web app.
 *
 * Why this file exists: the rail used to be two hand-maintained arrays — one in
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
 * NO router, store, or React import lives here — the caller supplies `navigate`
 * (its own `router.push`) and `onOpenCustomize` (the settings modal opener),
 * which keeps this module a pure data definition that can be unit-tested.
 */

import {
  CalendarClock,
  FolderOpen,
  Layers,
  LibraryBig,
  ListChecks,
  MessageSquare,
  Settings,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
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
  /**
   * Route pushed on click. `null` means the entry opens the Settings modal in
   * place instead of navigating (CRIT-008: `/settings/general` only renders a
   * redirect back to `/chat`, which tore down whatever page the shell wrapped).
   */
  href: string | null;
  /** Derived from the live pathname — never hardcoded by a caller. */
  isActive: (pathname: string) => boolean;
  /**
   * Rendered only for an organisation admin or owner, and so it may only point
   * at an org-scoped route. Platform-operator surfaces are gated on an
   * allowlist this flag knows nothing about, so offering one here would be a
   * link that redirects straight back out.
   */
  adminOnly?: boolean;
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
  },
  // Artifacts — a finished, account-scoped artifacts gallery that had no entry
  // point anywhere in the signed-in app. The only link to it in the tree pointed
  // out of a dead shell (`WebShellV3`, zero mount points), so real user artifacts
  // were reachable only by typing the URL. Claude parity: artifacts are
  // first-class, independently addressable objects with their own primary-rail
  // destination, not one row inside a generic Library.
  //
  // Points at `/chat/artifacts`, NOT `/gallery`. `/gallery` is the same gallery
  // wrapped in the marketing Header + MarketingFooter, and it stays public for
  // SEO and for signed-out visitors browsing the Inspiration tab — so sending the
  // rail there dropped the user out of the product shell mid-session.
  // `/chat/artifacts` mounts the same `GalleryClient` inside `WebAppShell`.
  {
    id: 'artifacts',
    label: 'Artifacts',
    icon: Layers,
    href: '/chat/artifacts',
    isActive: (pathname) => isUnder(pathname, '/chat/artifacts'),
  },
  // Library — browse generated files without scrolling back to their origin
  // message (ChatGPT-Library / mobile-LibraryScreen parity).
  {
    id: 'library',
    label: 'Library',
    icon: LibraryBig,
    href: '/chat/library',
    isActive: (pathname) => isUnder(pathname, '/chat/library'),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: ListChecks,
    href: '/tasks',
    isActive: (pathname) => isUnder(pathname, '/tasks'),
  },
  {
    id: 'schedules',
    label: 'Schedules',
    icon: CalendarClock,
    href: '/chat/schedules',
    isActive: (pathname) => isUnder(pathname, '/chat/schedules'),
  },
  // Admin — directory sync is the org-scoped page an admin or owner can
  // actually use. The console at `/admin` itself is platform-operator only
  // (AGI_PLATFORM_ADMIN_USER_IDS), matching the cross-tenant APIs it drives, so
  // sending an org admin there would bounce them back to `/`.
  {
    id: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    href: '/admin/directory-sync',
    isActive: (pathname) => isUnder(pathname, '/admin'),
    adminOnly: true,
  },
  {
    id: 'customize',
    label: 'Customize',
    icon: Settings,
    // Opens General: that is where the user's name, work profile, and cross-chat
    // instructions are edited. Skills / Plugins / Connectors keep their own
    // plainly labelled sections inside the same modal.
    href: null,
    isActive: () => false,
  },
];

/**
 * Bind the rail to a surface's router + settings modal.
 *
 * `pathname` comes from `usePathname()`; pass it through unchanged so the
 * active entry tracks the real route.
 */
export function buildAppNavItems(options: {
  pathname: string;
  navigate: (href: string) => void;
  onOpenCustomize: () => void;
  /** Whether the signed-in user holds the admin or owner role. */
  isAdmin?: boolean;
}): SidebarNavItem[] {
  const { pathname, navigate, onOpenCustomize, isAdmin = false } = options;
  return APP_NAV_DESTINATIONS.filter((destination) => !destination.adminOnly || isAdmin).map(
    (destination) => {
      const { href } = destination;
      return {
        id: destination.id,
        label: destination.label,
        icon: destination.icon,
        onClick: href === null ? onOpenCustomize : () => navigate(href),
        isActive: destination.isActive(pathname),
      };
    },
  );
}
