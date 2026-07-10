'use client';

/**
 * WebAppShell · persistent app-shell chrome (sidebar + content area) for
 * secondary authenticated web surfaces that are NOT the chat page — currently
 * the Projects hub (`/projects`) and project detail (`/projects/[id]`).
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
 * All data-loading effects here are gated on Clerk `isSignedIn` so a signed-out
 * visit to `/projects/[id]` never fires an authenticated fetch (keeps the
 * signed-out console clean — see e2e/public-auth-clean.spec.ts).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useClerk } from '@clerk/nextjs';
import { Settings, LogOut, ChevronUp } from 'lucide-react';
import {
  Sidebar,
  type SidebarSession,
  type SidebarProject,
  type SidebarNavItem,
} from '@agiworkforce/ui';
import { useChatProjectStore, type Project as UnifiedProject } from '@agiworkforce/unified-chat';
import { useConversations } from '@/lib/hooks/useConversations';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useBillingStore } from '@/stores/unified/auth';
import { useProjectStore } from '@/features/projects/stores/project-store';
import { SidebarWordmark } from '@/components/agi/SidebarWordmark';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

interface WebAppShellProps {
  children: React.ReactNode;
}

export function WebAppShell({ children }: WebAppShellProps) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const { user, logout } = useAuthStore();
  const subscription = useBillingStore((s) => s.subscription);

  const [collapsed, setCollapsed] = useState(false);

  // ---- Conversations (recents). useConversations auto-fetches, auth-gated. ----
  const { conversations, deleteConversation, updateConversation } = useConversations();
  const updateConversationInStore = useChatStore((s) => s.updateConversation);

  // ---- Projects ----
  const storeProjects = useChatProjectStore((s) => s.projects);
  const setStoreProjects = useChatProjectStore((s) => s.setProjects);
  const toggleStar = useChatProjectStore((s) => s.toggleStar);
  const removeProjectFromStore = useProjectStore((s) => s.removeProject);

  // Hydrate projects from the server for the sidebar list. Gated on isSignedIn
  // so a signed-out visit never fires the authenticated /api/projects call.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/projects?limit=100', { credentials: 'same-origin' });
        if (!res.ok) return;
        const json = (await res.json()) as { projects?: UnifiedProject[] };
        const serverProjects = Array.isArray(json.projects) ? json.projects : [];
        if (cancelled || serverProjects.length === 0) return;
        const serverIds = new Set(serverProjects.map((p) => p.id));
        const localOnly = useChatProjectStore
          .getState()
          .projects.filter((p) => !serverIds.has(p.id));
        setStoreProjects([...serverProjects, ...localOnly]);
      } catch {
        // Non-fatal: sidebar shows whatever is already in the store.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, setStoreProjects]);

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
      if (convo) updateConversationInStore(id, { isStarred: !convo.isStarred });
    },
    [conversations, updateConversationInStore],
  );
  const handleArchiveSession = useCallback(
    (id: string) => {
      const convo = conversations.find((c) => c.id === id);
      if (convo) updateConversationInStore(id, { isArchived: !convo.isArchived });
    },
    [conversations, updateConversationInStore],
  );
  const handleMoveToProjectSession = useCallback(
    (sessionId: string, projectId: string) => void updateConversation(sessionId, { projectId }),
    [updateConversation],
  );

  // ---- Project row handlers ----
  const handleProjectOpen = useCallback(
    (projectId: string) => router.push(`/projects/${encodeURIComponent(projectId)}`),
    [router],
  );
  const handleProjectNewChat = useCallback(
    (projectId: string) => router.push(`/chat?project=${encodeURIComponent(projectId)}`),
    [router],
  );
  const handleProjectSettings = useCallback(
    (projectId: string) => router.push(`/projects/${encodeURIComponent(projectId)}`),
    [router],
  );
  const handleProjectPin = useCallback((projectId: string) => toggleStar(projectId), [toggleStar]);
  const handleProjectDelete = useCallback(
    async (projectId: string) => {
      try {
        await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          method: 'DELETE',
          headers: await addCsrfHeaders(),
          credentials: 'same-origin',
        });
      } finally {
        removeProjectFromStore(projectId);
      }
    },
    [removeProjectFromStore],
  );
  const handleProjectCreate = useCallback(() => router.push('/projects'), [router]);

  const sidebarNavItems = useMemo<SidebarNavItem[]>(
    () => [
      {
        id: 'customize',
        label: 'Customize',
        icon: Settings,
        onClick: () => router.push('/settings/general'),
        isActive: false,
      },
    ],
    [router],
  );

  // ---- Account footer ----
  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const userInitial = displayName.charAt(0).toUpperCase();
  const currentTier = subscription?.tier ?? 'free';
  const tierLabel =
    currentTier === 'free' ? 'Free' : currentTier.charAt(0).toUpperCase() + currentTier.slice(1);

  const handleLogout = useCallback(async () => {
    await logout();
    await clerkSignOut({ redirectUrl: '/login' });
  }, [clerkSignOut, logout]);

  const footerSlot = (
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
          <DropdownMenuItem onClick={() => router.push('/settings/general')}>
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

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Sidebar
        sessions={sidebarSessions}
        projects={sidebarProjects}
        collapsed={collapsed}
        mode="cloud"
        headerSlot={<SidebarWordmark />}
        navItems={sidebarNavItems}
        footerSlot={footerSlot}
        onNewChat={handleNewChat}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onSelect={handleSelectSession}
        onDelete={(id) => void handleDeleteSession(id)}
        onRename={handleRenameSession}
        onTogglePin={handlePinSession}
        onStar={handleStarSession}
        onArchive={handleArchiveSession}
        onMoveToProject={handleMoveToProjectSession}
        onProjectOpen={handleProjectOpen}
        onProjectNewChat={handleProjectNewChat}
        onProjectSettings={handleProjectSettings}
        onProjectPin={handleProjectPin}
        onProjectDelete={handleProjectDelete}
        onProjectCreate={handleProjectCreate}
      />

      {/* Content area — scrolls inside the shell (the outer wrapper is fixed). */}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
