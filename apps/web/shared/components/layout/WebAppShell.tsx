'use client';

/**
 * WebAppShell · persistent app-shell chrome (sidebar + content area) for
 * secondary authenticated web surfaces that are NOT the chat page, currently
 * the Projects hub (`/chat/projects`) and project detail (`/chat/projects/[id]`).
 *
 * Why this exists: those routes previously rendered bare `<main>` pages with a
 * back-arrow and no sidebar, so navigating to Projects dropped the user out of
 * the product shell. This wrapper mounts the same shared `@agiworkforce/ui`
 * <Sidebar> the live chat page uses (recents, projects, new-chat, search,
 * brand wordmark, account footer) so those routes stay inside the shell.
 *
 * The chat page (`WebChatPage`) keeps its own richer Sidebar wiring (streaming
 * state, dialogs, etc.) and is intentionally NOT refactored onto this shell.
 * this is the light-weight, navigation-focused variant for the project surfaces.
 *
 * Project data is loaded through the account-scoped managed-cloud session.
 * Signed-out visits never fire authenticated project requests and never reuse
 * project metadata from the previous Clerk account.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSignOut } from '@/lib/identity/client';
import { ChevronUp, Menu } from '@agiworkforce/icons';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  Sidebar,
  keepOpenForMenuEscape,
  useConfirm,
  type SidebarSession,
  type SidebarProject,
  type SidebarNavItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@agiworkforce/ui';
import { useConversations } from '@/lib/hooks/useConversations';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useUIStore } from '@shared/stores/layout-store';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useManagedCloudProjects, useProjectStore } from '@/features/projects';
import { SidebarWordmark } from '@shared/components/agi/SidebarWordmark';
import { buildAppNavItems } from '@shared/components/layout/app-nav-items';
import {
  conversationDeleteConfirm,
  projectDeleteConfirm,
} from '@shared/components/layout/sidebar-session-actions';
import { SidebarFreePlanNudge, SidebarPlanBadge } from '@shared/components/layout/SidebarPlanNudge';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { useIsWorkspaceAdmin } from '@shared/hooks/use-workspace-admin';
import { useUnreadConversations } from '@shared/hooks/use-unread-conversations';
import { webManagedCloudProjects } from '@/features/projects/services/managed-cloud-projects';
import { toast } from 'sonner';
import {
  getBillingPlanPricing,
  hasSelfServeUpgradePath,
  isFreeBillingPlanTier,
} from '@agiworkforce/types';
import { accountInitial, resolveAccountDisplayName } from '@agiworkforce/utils/display-name';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { AccountMenuItems } from '@shared/components/layout/AccountMenuItems';
import { useUpgradePlanFlow } from '@features/billing/hooks/use-upgrade-plan-flow';
import { ComposerFeedbackDialog } from '@/features/chat/components/Composer/ComposerFeedbackDialog';
import { KeyboardShortcutsDialog } from '@/features/chat/components/dialogs/KeyboardShortcutsDialog';
import { KEYBOARD_SHORTCUT_DOCS } from '@/features/chat/hooks/use-keyboard-shortcuts';
import { toUserMessage } from '@/lib/user-error-message';

// A fresh [] each render changes the identity every time and defeats the
// memoization below, which is what the exhaustive-deps warning was pointing at.
const EMPTY_NAV_IDS: string[] = [];

export const CONTENT_OVERLAY_ROOT_ID = 'webappshell-content-overlay-root';

interface WebAppShellProps {
  children: React.ReactNode;
  /** Rendered inside the narrow-viewport header, after the wordmark. */
  narrowHeaderSlot?: React.ReactNode;
}

export function WebAppShell({ children, narrowHeaderSlot }: WebAppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { openSettings } = useSettingsModal();
  const identitySignOut = useSignOut();
  const { user, logout, isLoading: isAuthLoading, initialized: isAuthInitialized } = useAuthStore();
  const isWorkspaceAdmin = useIsWorkspaceAdmin();
  const subscription = useBillingStore((s) => s.subscription);
  const isBillingLoading = useBillingStore((s) => s.isLoading);
  const isBillingInitialized = useBillingStore((s) => s.initialized);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);

  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Shared with WebChatPage's account menu (useUpgradePlanFlow) so the
  // dialog, mid-cycle confirm, and the real Stripe checkout call cannot
  // drift between the two surfaces.
  const { openUpgradeDialog, upgradeDialogs } = useUpgradePlanFlow({
    user,
    subscription,
    currentTier: subscription?.tier,
    billingPolicyReady,
    openSettings,
  });

  // Destructive-action confirmation (shell-nav-ia-gap-01): the product's own
  // AlertDialog with a red confirm, not `window.confirm`. `useConfirm` returns
  // an awaitable boolean, so the guards below keep the same shape.
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();

  // ---- Narrow-viewport navigation (WEB-APPSHELL-MOBILE-SIDEBAR-01) ----
  // Below 768px the persistent ~260px sidebar reduced every route on this
  // shell to a clipped strip. Narrow viewports get a compact header with an
  // "Open navigation" control and a modal drawer instead; desktop keeps the
  // persistent/collapsible sidebar. Tracked separately from the manual
  // collapse toggle so widening the window restores the user's choice.
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
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

  // ---- Conversations (recents). useConversations auto-fetches, auth-gated. ----
  const {
    conversations,
    deleteConversation,
    updateConversation,
    isLoading: isConversationsLoading,
    listError: conversationListError,
    fetchConversations,
  } = useConversations();

  // ---- Projects ----
  const { projects: storeProjects } = useManagedCloudProjects();
  const toggleStar = useProjectStore((s) => s.toggleStar);
  const removeProjectFromStore = useProjectStore((s) => s.removeProject);

  const { isUnread, toggleUnread } = useUnreadConversations();

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
        unread: isUnread(c.id),
      })),
    [conversations, isUnread],
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
      const confirmed = await confirmDestructive(conversationDeleteConfirm(convo?.title));
      if (!confirmed) return;
      await deleteConversation(id);
    },
    [confirmDestructive, conversations, deleteConversation],
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
  const handleMarkUnreadSession = useCallback((id: string) => toggleUnread(id), [toggleUnread]);
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
  // Rename opens the same project-home page as Settings: that page's own
  // kebab menu is where the rename field actually lives, this shell has no
  // settings dialog of its own to open inline.
  const handleProjectRename = handleProjectSettings;
  const handleProjectShare = useCallback(async (projectId: string) => {
    const url = `${window.location.origin}/chat/projects/${encodeURIComponent(projectId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Project link copied');
    } catch {
      toast.error('Could not copy the project link');
    }
  }, []);
  const handleProjectPin = useCallback((projectId: string) => toggleStar(projectId), [toggleStar]);
  const handleProjectDelete = useCallback(
    async (projectId: string) => {
      // The shared <Sidebar> invokes this straight from the project row's
      // three-dot menu with no confirmation of its own, so this shell deleted a
      // project on a single stray click, worse than the native confirm the chat
      // shell at least had. Same dialog and copy as ProjectSettingsDialog.
      const project = storeProjects.find((p) => p.id === projectId);
      const confirmed = await confirmDestructive(projectDeleteConfirm(project?.name));
      if (!confirmed) return;
      try {
        await webManagedCloudProjects.deleteProject(projectId);
        removeProjectFromStore(projectId);
      } catch (error) {
        toast.error(toUserMessage(error, 'Failed to delete project'));
      }
    },
    [confirmDestructive, removeProjectFromStore, storeProjects],
  );
  // The projects page owns the create dialog, so carry the intent across the
  // navigation: without ?new=1 this button lands the user on a list and the
  // "New project" they asked for never opens - the same control opens the
  // dialog directly when WebChatPage renders the sidebar.
  const handleProjectCreate = useCallback(() => router.push('/chat/projects?new=1'), [router]);

  // ONE rail definition, shared with WebChatPage, see `app-nav-items.ts` for
  // why (the two hand-maintained copies had drifted and this shell was the only
  // one exposing Tasks).
  const hiddenNavIds = useSettingsStore((state) => state.hiddenNavIds) ?? EMPTY_NAV_IDS;

  const sidebarNavItems = useMemo<SidebarNavItem[]>(
    () =>
      buildAppNavItems({
        pathname,
        navigate: (href) => router.push(href),
        isAdmin: isWorkspaceAdmin,
        hiddenIds: hiddenNavIds,
      }),
    [hiddenNavIds, isWorkspaceAdmin, pathname, router],
  );

  // ---- Account footer ----
  // Normalised through the shared helper: Clerk stores this profile as
  // "SIDDHARTHA NAGULA", and the raw value rendered a shouting, truncated
  // "SIDDHARTH…" in the sidebar while the greeting headline four inches away
  // said "Siddhartha". One rule, one source, every surface.
  const displayName = resolveAccountDisplayName(user?.name, user?.email);
  const userInitial = accountInitial(displayName);
  // `?? 'free'` alone would sell an upgrade to a paying subscriber whenever
  // `/api/me` answers 401 (that path clears `subscription` and records no
  // error). Gate the Free fallback on the same readiness test the chat shell
  // and the pricing page use.
  const currentTier = subscription?.tier ?? (billingPolicyReady ? 'free' : undefined);
  const isFreeTier = isFreeBillingPlanTier(currentTier);
  // Capitalising the raw tier id rendered "Max_15x" for max_15x, which the
  // badge's `uppercase` class then showed as "MAX_15X". Use the catalog's own
  // label ("Max 15x"), the same source the chat sidebar and shared
  // UserProfile already use, so all three footers agree.
  const tierLabel = currentTier ? getBillingPlanPricing(currentTier).label : null;

  const handleLogout = useCallback(async () => {
    await logout();
    await identitySignOut({ redirectUrl: '/login' });
  }, [identitySignOut, logout]);

  const isAccountLoading =
    !isAuthInitialized || isAuthLoading || !isBillingInitialized || isBillingLoading;

  // Shared between the expanded footer's dropdown and the collapsed rail's
  // compact trigger, and with WebChatPage's account menu via the shared
  // AccountMenuItems component, so none of them can drift into a different
  // menu.
  const accountMenuItems = (
    <AccountMenuItems
      email={user?.email}
      onManageWorkspace={() => openSettings('team')}
      onOpenSettings={() => openSettings('general')}
      onOpenHelp={() => router.push('/help')}
      onOpenFeedback={() => setFeedbackOpen(true)}
      onOpenKeyboardShortcuts={() => setKeyboardShortcutsOpen(true)}
      showUpgrade={hasSelfServeUpgradePath(currentTier)}
      onUpgrade={() => openUpgradeDialog()}
      onDownloadApps={() => router.push('/download')}
      onLogout={() => void handleLogout()}
    />
  );

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
      {isFreeTier && <SidebarFreePlanNudge onUpgrade={() => openSettings('billing')} />}
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
                <SidebarPlanBadge tierLabel={tierLabel} isFreeTier={isFreeTier} />
              </div>
              {user?.email && (
                <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
              )}
            </div>
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
          {accountMenuItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  // collapsedFooterSlot: the icon rail has no room for the full account row,
  // but still needs a way into Settings and the legal-reachability links.
  // without it, collapsing the sidebar hid all of that with no other entry
  // point on this shell.
  const collapsedFooterSlot = isAccountLoading ? undefined : (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Account menu for ${displayName}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {userInitial}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{displayName}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="end" className="w-56 mb-1">
          {accountMenuItems}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );

  const sharedSidebarProps = {
    sessions: sidebarSessions,
    projects: sidebarProjects,
    // The conversations hook cannot start until auth settles. Treat that
    // bootstrap interval as loading too, otherwise a signed-in reload briefly
    // claims the account has no conversations.
    isLoading: isAccountLoading || isConversationsLoading,
    error: conversationListError,
    onRetryLoad: () => void fetchConversations(),
    mode: 'cloud' as const,
    headerSlot: <SidebarWordmark />,
    navItems: sidebarNavItems,
    footerSlot,
    collapsedFooterSlot,
    getSessionHref: (session: SidebarSession) => `/chat/${encodeURIComponent(session.id)}`,
    onNewChat: handleNewChat,
    onSelect: handleSelectSession,
    onDelete: (id: string) => void handleDeleteSession(id),
    onRename: handleRenameSession,
    onTogglePin: handlePinSession,
    onStar: handleStarSession,
    onArchive: handleArchiveSession,
    onMarkUnread: handleMarkUnreadSession,
    onMoveToProject: handleMoveToProjectSession,
    onProjectOpen: handleProjectOpen,
    onProjectNewChat: handleProjectNewChat,
    onProjectRename: handleProjectRename,
    onProjectShare: (id: string) => void handleProjectShare(id),
    onProjectSettings: handleProjectSettings,
    onProjectPin: handleProjectPin,
    onProjectDelete: handleProjectDelete,
    onProjectCreate: handleProjectCreate,
  };

  // The shell ends where the consent banner begins rather than running under
  // it. The banner is fixed at z-50 and its card takes pointer events, so
  // anything the app painted in that strip was unreachable until it was
  // answered: measured at 390x844, where the banner is 267px tall, the
  // "Create Your First Schedule" button on /chat/schedules and Preview,
  // Download and Delete on /chat/library all sat underneath it. Padding the
  // scroll container was tried first and does nothing here - it lets the page
  // scroll further, but a fixed overlay still covers whatever ends up in that
  // strip at any scroll position. Shrinking the shell is what actually keeps
  // content out from under it.
  return (
    <div className="fixed inset-x-0 top-0 bottom-[var(--agi-consent-inset,0px)] flex overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text-primary)]">
      {/* Destructive-action confirm (delete conversation / delete project). */}
      {destructiveConfirmDialog}
      {upgradeDialogs}
      <ComposerFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} hideTrigger />
      <KeyboardShortcutsDialog
        open={keyboardShortcutsOpen}
        onOpenChange={setKeyboardShortcutsOpen}
        shortcuts={KEYBOARD_SHORTCUT_DOCS}
      />
      {/* Desktop: persistent/collapsible sidebar. Narrow: replaced by the
          header trigger + modal drawer below (WEB-APPSHELL-MOBILE-SIDEBAR-01). */}
      {!isNarrowViewport && (
        <Sidebar
          {...sharedSidebarProps}
          collapsed={collapsed}
          onToggleCollapse={() => setSidebarCollapsed(!collapsed)}
        />
      )}

      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        aria-hidden={isNarrowViewport && mobileNavOpen ? true : undefined}
        inert={isNarrowViewport && mobileNavOpen ? true : undefined}
      >
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
            {/* A surface with its own left column puts its title and drawer
                trigger here rather than stacking a second bar underneath. */}
            {narrowHeaderSlot}
          </header>
        )}

        {/* Content area, scrolls inside the shell (the outer wrapper is fixed). */}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>

        <div id={CONTENT_OVERLAY_ROOT_ID} className="pointer-events-none absolute inset-0" />
      </div>

      {isNarrowViewport && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            id="webappshell-mobile-nav"
            side="left"
            className="w-[280px] max-w-[85vw] gap-0 overflow-y-auto p-0"
            data-testid="mobile-nav-drawer"
            onEscapeKeyDown={keepOpenForMenuEscape}
            onCloseAutoFocus={(event) => {
              // The sheet is opened from a button outside it, so Radix has no
              // trigger to hand focus back to and would drop it on the body.
              event.preventDefault();
              mobileNavTriggerRef.current?.focus();
            }}
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar {...sharedSidebarProps} collapsed={false} width={280} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
