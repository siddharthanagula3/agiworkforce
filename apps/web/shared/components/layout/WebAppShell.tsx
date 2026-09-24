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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useCurrentUser, useSignOut } from '@/lib/identity/client';
import { ChevronUp, Menu } from '@agiworkforce/icons';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  Sidebar,
  MOBILE_NAV_DRAWER_WIDTH,
  keepOpenForMenuEscape,
  useConfirmAction,
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
import { SidebarBrandRow } from '@shared/components/layout/SidebarBrandRow';
import { buildAppNavItems } from '@shared/components/layout/app-nav-items';
import { useShellLayout } from '@shared/components/layout/app-shell-layout';
import {
  conversationDeleteConfirm,
  conversationHref,
  conversationShareHref,
  projectDeleteConfirm,
  runSessionRowAction,
} from '@shared/components/layout/sidebar-session-actions';
import {
  copyProjectLink,
  deleteProjectOptimistically,
  projectHref,
  projectNewChatHref,
  toggleProjectPin,
} from '@shared/components/layout/sidebar-project-actions';
import { toSidebarSessions } from '@shared/components/layout/sidebar-session-rows';
import { SidebarFreePlanNudge, SidebarPlanBadge } from '@shared/components/layout/SidebarPlanNudge';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { useIsWorkspaceAdmin } from '@shared/hooks/use-workspace-admin';
import { useDisabledWorkspaceFeatures } from '@shared/hooks/use-workspace-policy';
import { useUnreadConversations } from '@shared/hooks/use-unread-conversations';
import {
  getBillingPlanPricing,
  hasSelfServeUpgradePath,
  isFreeBillingPlanTier,
} from '@agiworkforce/types';
import { accountInitial, resolveAccountDisplayName } from '@agiworkforce/utils/display-name';
import { CODE_ROUTES } from '@/features/code/code-surface';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { GlobalSearchDialog } from '@/features/chat/components/dialogs/GlobalSearchDialog';
import { getWorstUsagePercent, useManagedUsageSummary } from '@/lib/hooks/useManagedUsageSummary';
import { AccountMenuItems } from '@shared/components/layout/AccountMenuItems';
import { helpHrefForPath } from '@/lib/support/help-entry-points';
import { useUpgradePlanFlow } from '@features/billing/hooks/use-upgrade-plan-flow';
import { ComposerFeedbackDialog } from '@/features/chat/components/Composer/ComposerFeedbackDialog';
import { KeyboardShortcutsDialog } from '@/features/chat/components/dialogs/KeyboardShortcutsDialog';
import {
  KEYBOARD_SHORTCUT_DOCS,
  useKeyboardShortcuts,
} from '@/features/chat/hooks/use-keyboard-shortcuts';
import { onAppCommand } from '@shared/lib/app-commands';
import { resolveAccountIdentity, type AccountIdentity } from './account-identity';

// A fresh [] each render changes the identity every time and defeats the
// memoization below, which is what the exhaustive-deps warning was pointing at.
const EMPTY_NAV_IDS: string[] = [];

export const CONTENT_OVERLAY_ROOT_ID = 'webappshell-content-overlay-root';

interface WebAppShellProps {
  children: React.ReactNode;
  /** Rendered inside the narrow-viewport header, after the wordmark. */
  narrowHeaderSlot?: React.ReactNode;
  /**
   * A surface that owns its own left column sets this to false: it keeps every
   * provider, dialog and overlay this shell mounts and loses only the app
   * navigation, which would otherwise render as a second sidebar beside it.
   */
  rail?: boolean;
}

export function WebAppShell({ children, narrowHeaderSlot, rail = true }: WebAppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { openSettings } = useSettingsModal();
  const identitySignOut = useSignOut();
  const { user: identityUser } = useCurrentUser();
  const { user, logout, isLoading: isAuthLoading, initialized: isAuthInitialized } = useAuthStore();
  const isWorkspaceAdmin = useIsWorkspaceAdmin();
  const disabledFeatures = useDisabledWorkspaceFeatures();
  const subscription = useBillingStore((s) => s.subscription);
  const isBillingLoading = useBillingStore((s) => s.isLoading);
  const isBillingInitialized = useBillingStore((s) => s.initialized);
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  const canonicalUser = useBillingStore((state) => state.user);
  const providerUser = useMemo<AccountIdentity | null>(() => {
    if (!identityUser) return null;
    const name =
      identityUser.fullName ||
      [identityUser.firstName, identityUser.lastName].filter(Boolean).join(' ') ||
      identityUser.username ||
      undefined;
    const email = identityUser.email ?? identityUser.emails[0];
    return {
      id: identityUser.id,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    };
  }, [identityUser]);
  const accountUser = resolveAccountIdentity(canonicalUser, user, providerUser);

  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);
  const navOpenerRef = useRef<HTMLElement | null>(null);
  const restoreMobileNavFocusRef = useRef(true);
  const openMobileNav = useCallback(() => {
    restoreMobileNavFocusRef.current = true;
    navOpenerRef.current = document.activeElement as HTMLElement | null;
    setMobileNavOpen(true);
  }, []);
  const openAfterMobileNavClose = useCallback((open: () => void) => {
    restoreMobileNavFocusRef.current = false;
    setMobileNavOpen(false);
    open();
  }, []);
  const openShellSettings = useCallback(
    (section: Parameters<typeof openSettings>[0]) =>
      openAfterMobileNavClose(() => openSettings(section)),
    [openAfterMobileNavClose, openSettings],
  );

  // Shared with WebChatPage's account menu (useUpgradePlanFlow) so the
  // dialog, mid-cycle confirm, and the real Stripe checkout call cannot
  // drift between the two surfaces.
  const { openUpgradeDialog, upgradeDialogs } = useUpgradePlanFlow({
    user,
    subscription,
    currentTier: subscription?.tier,
    billingPolicyReady,
    openSettings: openShellSettings,
  });

  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirmAction();

  // ---- Viewport tiers (WEB-APPSHELL-MOBILE-SIDEBAR-01) ----
  // Below 768px the persistent ~260px sidebar reduced every route on this
  // shell to a clipped strip. Compact viewports get a header with an "Open
  // navigation" control and a modal drawer; a tablet in portrait keeps the
  // icon rail and expands it over the content; wider windows keep the
  // persistent/collapsible sidebar. Tracked separately from the manual
  // collapse toggle so widening the window restores the user's choice.
  const shellLayout = useShellLayout();
  const isNarrowViewport = shellLayout.tier === 'compact';
  const showsRail = rail && shellLayout.sidebarMode !== 'drawer';

  // Close the drawer after any navigation so it never lingers over the new route.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // A rotation or an iPad split-view resize re-flows the shell, and the reading
  // position in the content is what the user loses when it does.
  const mainContentRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef(0);
  useEffect(() => {
    const element = mainContentRef.current;
    if (!element) return;
    const remember = () => {
      contentScrollRef.current = element.scrollTop;
    };
    element.addEventListener('scroll', remember, { passive: true });
    return () => element.removeEventListener('scroll', remember);
  }, []);
  useLayoutEffect(() => {
    const element = mainContentRef.current;
    if (!element || contentScrollRef.current <= 0) return;
    element.scrollTop = contentScrollRef.current;
  }, [shellLayout.tier, shellLayout.orientation]);

  // The same overlay commands the chat surface answers, so a native menu item
  // or a keyboard shortcut reaches them on the project surfaces too.
  useEffect(() => {
    const stopSearch = onAppCommand('open-search', () =>
      openAfterMobileNavClose(() => setSearchDialogOpen(true)),
    );
    const stopShortcuts = onAppCommand('open-shortcuts', () =>
      openAfterMobileNavClose(() => setKeyboardShortcutsOpen(true)),
    );
    return () => {
      stopSearch();
      stopShortcuts();
    };
  }, [openAfterMobileNavClose]);

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
    hasMoreConversations,
    isLoadingMoreConversations,
    loadMoreConversations,
  } = useConversations();

  // ---- Projects ----
  const { projects: storeProjects } = useManagedCloudProjects();
  const updateProjectInStore = useProjectStore((s) => s.updateProject);
  const removeProjectFromStore = useProjectStore((s) => s.removeProject);
  const setStoreProjects = useProjectStore((s) => s.setProjects);

  const { isUnread, toggleUnread } = useUnreadConversations();

  const sidebarSessions = useMemo<SidebarSession[]>(
    () => toSidebarSessions(conversations, { isUnread }),
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
  const handleOpenCode = useCallback(() => router.push(CODE_ROUTES.root), [router]);
  const handleOpenSearch = useCallback(() => {
    openAfterMobileNavClose(() => setSearchDialogOpen(true));
  }, [openAfterMobileNavClose]);
  const handleOpenUsage = useCallback(() => openShellSettings('usage'), [openShellSettings]);

  const { usage: managedUsageSummary } = useManagedUsageSummary();
  const managedBudgetPercent = useMemo(
    () => getWorstUsagePercent(managedUsageSummary),
    [managedUsageSummary],
  );
  const handleSelectSession = useCallback(
    (id: string) => router.push(conversationHref(id)),
    [router],
  );
  const handleDeleteSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      openAfterMobileNavClose(() =>
        confirmDestructive({
          ...conversationDeleteConfirm(convo?.title),
          onConfirm: () => runSessionRowAction('delete', () => deleteConversation(id)),
        }),
      );
    },
    [confirmDestructive, conversations, deleteConversation, openAfterMobileNavClose],
  );
  const handleRenameSession = useCallback(
    (id: string, title: string) =>
      void runSessionRowAction('rename', () => updateConversation(id, { title })),
    [updateConversation],
  );
  const handlePinSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      void runSessionRowAction(convo.isPinned ? 'unpin' : 'pin', () =>
        updateConversation(id, { pinned: !convo.isPinned }),
      );
    },
    [conversations, updateConversation],
  );
  const handleArchiveSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (!convo) return;
      void runSessionRowAction(convo.isArchived ? 'restore' : 'archive', () =>
        updateConversation(id, { archived: !convo.isArchived }),
      );
    },
    [conversations, updateConversation],
  );
  const handleMarkUnreadSession = useCallback((id: string) => toggleUnread(id), [toggleUnread]);
  const handleShareSession = useCallback(
    (id: string) => router.push(conversationShareHref(id)),
    [router],
  );
  const handleMoveToProjectSession = useCallback(
    (sessionId: string, projectId: string) =>
      void runSessionRowAction('moveToProject', () => updateConversation(sessionId, { projectId })),
    [updateConversation],
  );

  // ---- Project row handlers ----
  const handleProjectOpen = useCallback(
    (projectId: string) => router.push(projectHref(projectId)),
    [router],
  );
  const handleProjectNewChat = useCallback(
    // `?projectId=` is the ONE canonical project entry param for /chat.
    (projectId: string) => router.push(projectNewChatHref(projectId)),
    [router],
  );
  const handleProjectSettings = useCallback(
    (projectId: string) => router.push(projectHref(projectId)),
    [router],
  );
  // Rename opens the same project-home page as Settings: that page's own
  // kebab menu is where the rename field actually lives, this shell has no
  // settings dialog of its own to open inline.
  const handleProjectRename = handleProjectSettings;
  const handleProjectShare = useCallback((projectId: string) => copyProjectLink(projectId), []);
  const handleProjectPin = useCallback(
    (projectId: string) => {
      const project = storeProjects.find((p) => p.id === projectId);
      if (!project) return;
      void toggleProjectPin(project, (id, starred) => updateProjectInStore(id, { starred }));
    },
    [storeProjects, updateProjectInStore],
  );
  const handleProjectDelete = useCallback(
    (projectId: string) => {
      // The shared <Sidebar> invokes this straight from the project row's
      // three-dot menu with no confirmation of its own, so this shell deleted a
      // project on a single stray click, worse than the native confirm the chat
      // shell at least had. Same dialog and copy as ProjectSettingsDialog.
      const project = storeProjects.find((p) => p.id === projectId);
      if (!project) return;
      openAfterMobileNavClose(() =>
        confirmDestructive({
          ...projectDeleteConfirm(project.name),
          onConfirm: () =>
            deleteProjectOptimistically(project, removeProjectFromStore, (restored) =>
              setStoreProjects([...useProjectStore.getState().projects, restored]),
            ),
        }),
      );
    },
    [
      confirmDestructive,
      openAfterMobileNavClose,
      removeProjectFromStore,
      setStoreProjects,
      storeProjects,
    ],
  );
  // The projects page owns the create dialog, so carry the intent across the
  // navigation: without ?new=1 this button lands the user on a list and the
  // "New project" they asked for never opens - the same control opens the
  // dialog directly when WebChatPage renders the sidebar.
  const handleProjectCreate = useCallback(() => router.push('/chat/projects?new=1'), [router]);

  // The collapse control and Cmd/Ctrl+B mean the same thing: with no persistent
  // rail there is nothing to collapse, so both toggle the drawer instead.
  const handleToggleSidebar = useCallback(() => {
    if (shellLayout.sidebarMode === 'persistent') {
      setSidebarCollapsed(!collapsed);
      return;
    }
    if (mobileNavOpen) {
      setMobileNavOpen(false);
      return;
    }
    openMobileNav();
  }, [collapsed, mobileNavOpen, openMobileNav, setSidebarCollapsed, shellLayout.sidebarMode]);

  const handleShowShortcuts = useCallback(
    () => openAfterMobileNavClose(() => setKeyboardShortcutsOpen(true)),
    [openAfterMobileNavClose],
  );

  // The shortcuts dialog on this shell lists four chords that only the chat
  // page used to bind. A surface with no rail leaves Cmd/Ctrl+B unclaimed.
  useKeyboardShortcuts({
    onNewChat: handleNewChat,
    onSearch: handleOpenSearch,
    onShowShortcuts: handleShowShortcuts,
    onToggleSidebar: rail ? handleToggleSidebar : undefined,
  });

  // ONE rail definition, shared with WebChatPage, see `app-nav-items.ts` for
  // why (the two hand-maintained copies had drifted and this shell was the only
  // one exposing Tasks).
  const hiddenNavIds = useSettingsStore((state) => state.hiddenNavIds) ?? EMPTY_NAV_IDS;
  const { t } = useTranslation('common');

  const sidebarNavItems = useMemo<SidebarNavItem[]>(
    () =>
      buildAppNavItems({
        pathname,
        navigate: (href) => router.push(href),
        isAdmin: isWorkspaceAdmin,
        hiddenIds: hiddenNavIds,
        disabledFeatures,
        translate: (key, fallback) => t(key, { defaultValue: fallback }),
      }),
    [disabledFeatures, hiddenNavIds, isWorkspaceAdmin, pathname, router, t],
  );

  // ---- Account footer ----
  // Normalised through the shared helper: Clerk stores this profile as
  // "SIDDHARTHA NAGULA", and the raw value rendered a shouting, truncated
  // "SIDDHARTH…" in the sidebar while the greeting headline four inches away
  // said "Siddhartha". One rule, one source, every surface.
  const displayName = resolveAccountDisplayName(accountUser?.name, accountUser?.email);
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
      email={accountUser?.email}
      onManageWorkspace={() => openShellSettings('team')}
      onOpenSettings={() => openShellSettings('general')}
      onOpenHelp={() => router.push(helpHrefForPath(pathname))}
      onOpenFeedback={() => openAfterMobileNavClose(() => setFeedbackOpen(true))}
      onOpenKeyboardShortcuts={handleShowShortcuts}
      showUpgrade={hasSelfServeUpgradePath(currentTier)}
      onUpgrade={() => openAfterMobileNavClose(openUpgradeDialog)}
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
        <span className="h-3 w-24 animate-pulse rounded-compact bg-muted" />
        <span className="h-2.5 w-32 animate-pulse rounded-compact bg-muted/70" />
      </span>
      <span className="sr-only">Loading account…</span>
    </div>
  ) : (
    <div className="w-full">
      {isFreeTier && <SidebarFreePlanNudge onUpgrade={() => openShellSettings('billing')} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${displayName}`}
            className="flex w-full items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[13px] font-medium text-foreground">{displayName}</p>
                <SidebarPlanBadge tierLabel={tierLabel} isFreeTier={isFreeTier} />
              </div>
              {accountUser?.email && (
                <p className="truncate text-caption text-muted-foreground">{accountUser.email}</p>
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
    hasMoreSessions: hasMoreConversations,
    isLoadingMoreSessions: isLoadingMoreConversations,
    onLoadMoreSessions: () => void loadMoreConversations(),
    mode: 'cloud' as const,
    headerSlot: <SidebarBrandRow />,
    navItems: sidebarNavItems,
    footerSlot,
    collapsedFooterSlot,
    getSessionHref: (session: SidebarSession) => conversationHref(session.id),
    onNewChat: handleNewChat,
    onOpenCode: disabledFeatures.includes('code') ? undefined : handleOpenCode,
    onOpenSearch: handleOpenSearch,
    showUsageWidget: currentTier !== undefined && !isFreeTier && managedUsageSummary !== null,
    budgetPercent: managedBudgetPercent,
    onOpenUsage: handleOpenUsage,
    onSelect: handleSelectSession,
    onDelete: (id: string) => void handleDeleteSession(id),
    onRename: handleRenameSession,
    onTogglePin: handlePinSession,
    onArchive: handleArchiveSession,
    onRestore: handleArchiveSession,
    onShare: handleShareSession,
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
  // it. The banner is fixed at z-[var(--z-dropdown)] and its card takes pointer events, so
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
      <GlobalSearchDialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen} />
      <ComposerFeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} hideTrigger />
      <KeyboardShortcutsDialog
        open={keyboardShortcutsOpen}
        onOpenChange={setKeyboardShortcutsOpen}
        shortcuts={KEYBOARD_SHORTCUT_DOCS}
      />
      {/* Desktop: persistent/collapsible sidebar. Tablet portrait: the icon
          rail, expanding into the drawer. Compact: the header trigger + modal
          drawer below (WEB-APPSHELL-MOBILE-SIDEBAR-01). */}
      {showsRail && (
        <Sidebar
          {...sharedSidebarProps}
          collapsed={shellLayout.sidebarMode === 'rail' ? true : collapsed}
          onToggleCollapse={handleToggleSidebar}
        />
      )}

      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        aria-hidden={rail && mobileNavOpen ? true : undefined}
        inert={rail && mobileNavOpen ? true : undefined}
      >
        {isNarrowViewport && (
          <header
            data-app-header=""
            className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-2"
          >
            {rail && (
              <button
                ref={mobileNavTriggerRef}
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileNavOpen}
                aria-controls="webappshell-mobile-nav"
                onClick={openMobileNav}
                className="flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <SidebarWordmark />
            {/* A surface with its own left column puts its title and drawer
                trigger here rather than stacking a second bar underneath. */}
            {narrowHeaderSlot}
          </header>
        )}

        {/* Content area, scrolls inside the shell (the outer wrapper is fixed). */}
        <div
          id="main-content"
          ref={mainContentRef}
          role="main"
          tabIndex={-1}
          data-shell-tier={shellLayout.tier}
          data-shell-orientation={shellLayout.orientation}
          className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [scrollbar-width:thin]"
        >
          {children}
        </div>

        <div id={CONTENT_OVERLAY_ROOT_ID} className="pointer-events-none absolute inset-0" />
      </div>

      {rail && shellLayout.sidebarMode !== 'persistent' && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            id="webappshell-mobile-nav"
            side="left"
            style={{ width: MOBILE_NAV_DRAWER_WIDTH }}
            className="max-w-[85vw] gap-0 overflow-y-auto overscroll-contain p-0 [scrollbar-width:thin]"
            data-testid="mobile-nav-drawer"
            onEscapeKeyDown={keepOpenForMenuEscape}
            onCloseAutoFocus={(event) => {
              // The sheet is opened from a button outside it, so Radix has no
              // trigger to hand focus back to and would drop it on the body.
              event.preventDefault();
              if (!restoreMobileNavFocusRef.current) {
                restoreMobileNavFocusRef.current = true;
                return;
              }
              const opener = navOpenerRef.current;
              if (opener?.isConnected) opener.focus();
              else mobileNavTriggerRef.current?.focus();
            }}
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar {...sharedSidebarProps} collapsed={false} width={MOBILE_NAV_DRAWER_WIDTH} />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
