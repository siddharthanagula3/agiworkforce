'use client';

/**
 * WebAppShell · persistent app-shell chrome (sidebar + content area) for
 * secondary authenticated web surfaces that are NOT the chat page — currently
 * the Projects hub (`/chat/projects`) and project detail (`/chat/projects/[id]`).
 *
 * Why this exists: those routes previously rendered bare `<main>` pages with a
 * back-arrow and no sidebar, so navigating to Projects dropped the user out of
 * the product shell. This wrapper mounts the same shared `@agiworkforce/ui`
 * <Sidebar> the live chat page uses (recents, projects, new-chat, search,
 * brand wordmark, account footer) so those routes stay inside the shell.
 *
 * The chat page (`WebChatPage`) keeps its own richer Sidebar wiring (streaming
 * state, dialogs, etc.) and is intentionally NOT refactored onto this shell —
 * this is the light-weight, navigation-focused variant for the project surfaces.
 *
 * Project data is loaded through the account-scoped managed-cloud session.
 * Signed-out visits never fire authenticated project requests and never reuse
 * project metadata from the previous Clerk account.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import {
  Settings,
  LogOut,
  ChevronUp,
  LibraryBig,
  CalendarClock,
  FolderOpen,
  ListChecks,
  Menu,
  MessageSquare,
  TerminalSquare,
} from 'lucide-react';
import {
  Sidebar,
  type SidebarSession,
  type SidebarProject,
  type SidebarNavItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import { useConversations } from '@/lib/hooks/useConversations';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useManagedCloudProjects, useProjectStore } from '@/features/projects';
import { SidebarWordmark } from '@shared/components/agi/SidebarWordmark';
import { webManagedCloudProjects } from '@/features/projects/services/managed-cloud-projects';
import { toast } from 'sonner';
import { getBillingPlanPricing } from '@agiworkforce/types';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { WorkspaceMenuItems } from '@/features/workspaces/components/WorkspaceMenuItems';

interface WebAppShellProps {
  children: React.ReactNode;
}

export function WebAppShell({ children }: WebAppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { openSettings } = useSettingsModal();
  const { signOut: clerkSignOut } = useClerk();
  const { user, logout, isLoading: isAuthLoading, initialized: isAuthInitialized } = useAuthStore();
  const subscription = useBillingStore((s) => s.subscription);
  const isBillingLoading = useBillingStore((s) => s.isLoading);
  const isBillingInitialized = useBillingStore((s) => s.initialized);

  const [collapsed, setCollapsed] = useState(false);

  // ---- Narrow-viewport navigation (WEB-APPSHELL-MOBILE-SIDEBAR-01) ----
  // Below 768px the persistent ~260px sidebar reduced every route on this
  // shell to a clipped strip. Narrow viewports get a compact header with an
  // "Open navigation" control and a modal drawer instead; desktop keeps the
  // persistent/collapsible sidebar. Tracked separately from the manual
  // collapse toggle so widening the window restores the user's choice.
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileNavDrawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 768px)');
    const update = () => setIsNarrowViewport(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  // Close the drawer after any navigation so it never lingers over the new route.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Escape closes; focus moves into the drawer on open and back to the
  // trigger on close (the cleanup also runs on unmount, which is harmless).
  useEffect(() => {
    if (!mobileNavOpen) return;
    const trigger = mobileNavTriggerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    mobileNavDrawerRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [mobileNavOpen]);

  // ---- Conversations (recents). useConversations auto-fetches, auth-gated. ----
  const {
    conversations,
    deleteConversation,
    updateConversation,
    isLoading: isConversationsLoading,
  } = useConversations();

  // ---- Projects ----
  const { projects: storeProjects } = useManagedCloudProjects();
  const toggleStar = useProjectStore((s) => s.toggleStar);
  const removeProjectFromStore = useProjectStore((s) => s.removeProject);

  const sidebarSessions = useMemo<SidebarSession[]>(
    () =>
      conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        pinned: c.isPinned ?? false,
        starred: c.isStarred ?? false,
        archived: c.isArchived ?? false,
        projectId: c.projectId ?? undefined,
        messageCount: c.messageCount,
      })),
    [conversations],
  );

  const sidebarProjects = useMemo<SidebarProject[]>(
    () =>
      storeProjects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        accentColor: p.accentColor,
        iconEmoji: p.iconEmoji,
        description: p.description,
        pinned: p.starred ?? false,
      })),
    [storeProjects],
  );

  // ---- Session row handlers (navigation-focused) ----
  const handleNewChat = useCallback(() => router.push('/chat'), [router]);
  const handleSelectSession = useCallback(
    (id: string) => router.push(`/chat/${encodeURIComponent(id)}`),
    [router],
  );
  const handleDeleteSession = useCallback(
    async (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      const label = convo?.title ? `"${convo.title}"` : 'this conversation';
      if (
        typeof window !== 'undefined' &&
        !window.confirm(`Delete ${label}? This can't be undone.`)
      )
        return;
      await deleteConversation(id);
    },
    [conversations, deleteConversation],
  );
  const handleRenameSession = useCallback(
    (id: string, title: string) => void updateConversation(id, { title }),
    [updateConversation],
  );
  const handlePinSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (convo) void updateConversation(id, { pinned: !convo.isPinned });
    },
    [conversations, updateConversation],
  );
  const handleStarSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (convo) void updateConversation(id, { starred: !convo.isStarred });
    },
    [conversations, updateConversation],
  );
  const handleArchiveSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (convo) void updateConversation(id, { archived: !convo.isArchived });
    },
    [conversations, updateConversation],
  );
  const handleMoveToProjectSession = useCallback(
    (sessionId: string, projectId: string) => void updateConversation(sessionId, { projectId }),
    [updateConversation],
  );

  // ---- Project row handlers ----
  const handleProjectOpen = useCallback(
    (projectId: string) => router.push(`/chat/projects/${encodeURIComponent(projectId)}`),
    [router],
  );
  const handleProjectNewChat = useCallback(
    // `?projectId=` is the ONE canonical project entry param for /chat.
    (projectId: string) => router.push(`/chat?projectId=${encodeURIComponent(projectId)}`),
    [router],
  );
  const handleProjectSettings = useCallback(
    (projectId: string) => router.push(`/chat/projects/${encodeURIComponent(projectId)}`),
    [router],
  );
  const handleProjectPin = useCallback((projectId: string) => toggleStar(projectId), [toggleStar]);
  const handleProjectDelete = useCallback(
    async (projectId: string) => {
      try {
        await webManagedCloudProjects.deleteProject(projectId);
        removeProjectFromStore(projectId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete project');
      }
    },
    [removeProjectFromStore],
  );
  const handleProjectCreate = useCallback(() => router.push('/chat/projects'), [router]);

  const sidebarNavItems = useMemo<SidebarNavItem[]>(
    () => [
      {
        id: 'chat-home',
        label: 'Chat',
        icon: MessageSquare,
        onClick: () => router.push('/chat'),
        isActive: pathname === '/chat',
      },
      {
        id: 'code',
        label: 'Code',
        icon: TerminalSquare,
        onClick: () => router.push('/chat/code'),
        isActive: pathname.startsWith('/chat/code'),
      },
      // Keep the section that owns this shell visible and selected. Without
      // this item the Projects hub/detail pages dropped their own primary nav
      // destination, even though the chat shell exposes it persistently.
      {
        id: 'projects',
        label: 'Projects',
        icon: FolderOpen,
        onClick: () => router.push('/chat/projects'),
        isActive: pathname.startsWith('/chat/projects'),
      },
      // Library — same persistent entry the chat page's sidebar carries, so
      // navigating between /projects and /library keeps the link visible.
      {
        id: 'library',
        label: 'Library',
        icon: LibraryBig,
        onClick: () => router.push('/chat/library'),
        isActive: pathname.startsWith('/chat/library'),
      },
      {
        id: 'tasks',
        label: 'Tasks',
        icon: ListChecks,
        onClick: () => router.push('/tasks'),
        isActive: pathname.startsWith('/tasks'),
      },
      {
        id: 'schedules',
        label: 'Schedules',
        icon: CalendarClock,
        onClick: () => router.push('/chat/schedules'),
        isActive: pathname.startsWith('/chat/schedules'),
      },
      {
        id: 'customize',
        label: 'Customize',
        icon: Settings,
        // CRIT-008: open the modal in place. `/settings/general` renders a
        // SettingsModalRedirect whose only job is to reopen this modal and
        // replace back to /chat, so routing there tore down and remounted
        // whatever page the shell was wrapping.
        onClick: () => openSettings('general'),
        isActive: false,
      },
    ],
    [openSettings, pathname, router],
  );

  // ---- Account footer ----
  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const userInitial = displayName.charAt(0).toUpperCase();
  const currentTier = subscription?.tier ?? 'free';
  // Capitalising the raw tier id rendered "Max_15x" for max_15x, which the
  // badge's `uppercase` class then showed as "MAX_15X". Use the catalog's own
  // label ("Max 15x") — the same source the chat sidebar and shared
  // UserProfile already use, so all three footers agree.
  const tierLabel = getBillingPlanPricing(currentTier).label;

  const handleLogout = useCallback(async () => {
    await logout();
    await clerkSignOut({ redirectUrl: '/login' });
  }, [clerkSignOut, logout]);

  const isAccountLoading =
    !isAuthInitialized || isAuthLoading || !isBillingInitialized || isBillingLoading;

  const footerSlot = isAccountLoading ? (
    <div
      role="status"
      aria-label="Loading account"
      className="flex w-full items-center gap-2 px-3 py-3"
    >
      <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5" aria-hidden>
        <span className="h-3 w-24 animate-pulse rounded bg-muted" />
        <span className="h-2.5 w-32 animate-pulse rounded bg-muted/70" />
      </span>
      <span className="sr-only">Loading account…</span>
    </div>
  ) : (
    <div className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${displayName}`}
            className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
                <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tierLabel}
                </span>
              </div>
              {user?.email && (
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              )}
            </div>
            <ChevronUp
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
              aria-hidden="true"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
          {user?.email && (
            <>
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <WorkspaceMenuItems onManage={() => openSettings('team')} />
          {/* CRIT-008: open in place — /settings/general only bounces to /chat. */}
          <DropdownMenuItem onClick={() => openSettings('general')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void handleLogout()}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const sharedSidebarProps = {
    sessions: sidebarSessions,
    projects: sidebarProjects,
    // The conversations hook cannot start until auth settles. Treat that
    // bootstrap interval as loading too, otherwise a signed-in reload briefly
    // claims the account has no conversations.
    isLoading: isAccountLoading || isConversationsLoading,
    mode: 'cloud' as const,
    headerSlot: <SidebarWordmark />,
    navItems: sidebarNavItems,
    footerSlot,
    onNewChat: handleNewChat,
    onSelect: handleSelectSession,
    onDelete: (id: string) => void handleDeleteSession(id),
    onRename: handleRenameSession,
    onTogglePin: handlePinSession,
    onStar: handleStarSession,
    onArchive: handleArchiveSession,
    onMoveToProject: handleMoveToProjectSession,
    onProjectOpen: handleProjectOpen,
    onProjectNewChat: handleProjectNewChat,
    onProjectSettings: handleProjectSettings,
    onProjectPin: handleProjectPin,
    onProjectDelete: handleProjectDelete,
    onProjectCreate: handleProjectCreate,
  };

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Desktop: persistent/collapsible sidebar. Narrow: replaced by the
          header trigger + modal drawer below (WEB-APPSHELL-MOBILE-SIDEBAR-01). */}
      {!isNarrowViewport && (
        <Sidebar
          {...sharedSidebarProps}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {isNarrowViewport && (
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-2">
            <button
              ref={mobileNavTriggerRef}
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
              aria-controls="webappshell-mobile-nav"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarWordmark />
          </header>
        )}

        {/* Content area — scrolls inside the shell (the outer wrapper is fixed). */}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
      </div>

      {isNarrowViewport && mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            data-testid="mobile-nav-backdrop"
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <div
            id="webappshell-mobile-nav"
            ref={mobileNavDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            tabIndex={-1}
            className="relative z-10 h-full w-[280px] max-w-[85vw] overflow-hidden bg-[hsl(var(--background))] shadow-xl outline-none"
          >
            <Sidebar {...sharedSidebarProps} collapsed={false} isMobile />
          </div>
        </div>
      )}
    </div>
  );
}
