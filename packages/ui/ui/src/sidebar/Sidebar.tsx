'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  List,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Upload,
} from '@agiworkforce/icons';
import { cn } from '../cn';
import { useUiTranslation } from '../i18n';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../primitives/Tooltip';
import { isMenuPanelOpen, Menu, MenuItem, MenuSeparator } from './Menu';
import { SearchOverlay } from './SearchOverlay';
import { SessionItem, type SessionItemHandlers } from './SessionItem';
import { getTemporalGroup, TEMPORAL_LABELS, toSafeDate } from './temporal';
import { resolveProjectIcon, resolveProjectAccentHex, hasKnownProjectIcon } from './project-icons';
import type {
  SidebarMode,
  SidebarNavItem,
  SidebarProject,
  SidebarSession,
  SidebarTemporalGroup,
} from './types';

export interface SidebarProps extends SessionItemHandlers {
  sessions: SidebarSession[];
  activeSessionId?: string;
  projects?: SidebarProject[];
  isLoading?: boolean;
  error?: string | null;
  onRetryLoad?: () => void;

  className?: string;
  collapsed?: boolean;
  width?: number;
  isSimpleMode?: boolean;

  mode?: SidebarMode;
  budgetPercent?: number;
  showUsageWidget?: boolean;

  onNewChat: () => void;
  onToggleCollapse?: () => void;
  onOpenSearch?: () => void;
  onOpenUsage?: () => void;

  onProjectOpen?: (projectId: string) => void;
  onProjectNewChat?: (projectId: string) => void;
  onProjectRename?: (projectId: string) => void;
  onProjectShare?: (projectId: string) => void;
  onProjectSettings?: (projectId: string) => void;
  onProjectPin?: (projectId: string) => void;
  onProjectDelete?: (projectId: string) => void;
  onProjectCreate?: () => void;

  getSessionHref?: (session: SidebarSession) => string;

  navItems?: SidebarNavItem[];
  renderNavLink?: (item: SidebarNavItem) => React.ReactNode;
  navExtraSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  collapsedFooterSlot?: React.ReactNode;
  headerSlot?: React.ReactNode;
}

const DEFAULT_EXPANDED: SidebarTemporalGroup[] = ['today', 'yesterday', 'thisWeek'];
const COLLAPSED_RAIL_WIDTH = 52;
const ROW_FOCUSABLE_SELECTOR = 'a, button';

export function Sidebar(props: SidebarProps) {
  const {
    sessions,
    activeSessionId,
    projects = [],
    isLoading = false,
    error = null,
    onRetryLoad,
    className,
    collapsed = false,
    width = 260,
    isSimpleMode = false,
    budgetPercent = 0,
    showUsageWidget = false,
    onNewChat,
    onToggleCollapse,
    onOpenSearch,
    onOpenUsage,
    onProjectOpen,
    onProjectNewChat,
    onProjectRename,
    onProjectShare,
    onProjectSettings,
    onProjectPin,
    onProjectDelete,
    onProjectCreate,
    getSessionHref,
    navItems,
    renderNavLink,
    navExtraSlot,
    footerSlot,
    collapsedFooterSlot,
    headerSlot,
    onSelect,
    onRename,
    onDelete,
    onTogglePin,
    onStar,
    onArchive,
    onRestore,
    onShare,
    onMoveToProject,
    onOpenCustomInstructions,
    onMarkUnread,
  } = props;

  const { t } = useUiTranslation('chat');
  const { t: tCommon } = useUiTranslation('common');

  const modKeySymbol =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  const [internalSearchOpen, setInternalSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<SidebarTemporalGroup>>(
    new Set(DEFAULT_EXPANDED),
  );
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [projectsSectionCollapsed, setProjectsSectionCollapsed] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [projectShowAllChats, setProjectShowAllChats] = useState<Set<string>>(new Set());
  const [projectsHeaderMenuOpen, setProjectsHeaderMenuOpen] = useState(false);
  const [organizeMode, setOrganizeMode] = useState<'by-project' | 'one-list'>('by-project');

  const projectListEnabled = Boolean(
    onProjectOpen || onProjectNewChat || onProjectRename || onProjectSettings || onProjectDelete,
  );

  const pinnedProjects = useMemo(
    () => (projectListEnabled ? projects.filter((p) => p.pinned) : []),
    [projects, projectListEnabled],
  );

  const unpinnedProjects = useMemo(
    () => (projectListEnabled ? projects.filter((p) => !p.pinned) : []),
    [projects, projectListEnabled],
  );

  const PROJECTS_SHOW_LIMIT = 5;
  const visibleUnpinnedProjects = showAllProjects
    ? unpinnedProjects
    : unpinnedProjects.slice(0, PROJECTS_SHOW_LIMIT);

  const handleOpenSearch = useCallback(() => {
    if (onOpenSearch) onOpenSearch();
    else setInternalSearchOpen(true);
  }, [onOpenSearch]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [projects]);

  const archivedCount = useMemo(
    () => sessions.filter((s) => s.archived === true).length,
    [sessions],
  );

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    let base = showArchived
      ? sessions.filter((s) => s.archived === true)
      : sessions.filter((s) => !s.archived);
    if (organizeMode === 'by-project' && projectListEnabled) {
      base = base.filter((s) => !s.projectId);
    }
    if (!term) return base;
    return base.filter((s) =>
      `${s.title ?? ''} ${s.lastMessage ?? s.preview ?? ''}`.toLowerCase().includes(term),
    );
  }, [sessions, searchQuery, showArchived, organizeMode, projectListEnabled]);

  const pinned = useMemo(
    () =>
      filtered
        .filter((s) => s.pinned)
        .sort((a, b) => toSafeDate(b.updatedAt).getTime() - toSafeDate(a.updatedAt).getTime()),
    [filtered],
  );

  const grouped = useMemo(() => {
    const groups = new Map<SidebarTemporalGroup, SidebarSession[]>();
    filtered
      .filter((s) => !s.pinned)
      .forEach((s) => {
        const group = getTemporalGroup(toSafeDate(s.updatedAt));
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(s);
      });
    groups.forEach((arr) =>
      arr.sort((a, b) => toSafeDate(b.updatedAt).getTime() - toSafeDate(a.updatedAt).getTime()),
    );
    return groups;
  }, [filtered]);

  const visible = useMemo(() => {
    const out: SidebarSession[] = [...pinned];
    grouped.forEach((arr, group) => {
      if (expandedGroups.has(group)) out.push(...arr);
    });
    return out;
  }, [pinned, grouped, expandedGroups]);

  /*
   * `visible` counts RENDERED rows, so collapsing every temporal group emptied
   * it and the rail claimed "No conversations yet" directly under a group
   * header reading "(50)". Emptiness is a property of the filtered set, not of
   * which groups happen to be open.
   */
  const hasMatchingConversations = filtered.length > 0 || pinned.length > 0;

  /*
   * A failed list is not an empty account. Emptiness is only claimable when
   * nothing was ever loaded AND nothing failed: a 429 on the recents fetch told
   * an account with 50 chats to "Start a new chat", and a later refresh failing
   * over an already-populated rail must leave those rows alone.
   */
  const showLoadFailure = sessions.length === 0 && !isLoading && Boolean(error);

  const toggleGroup = useCallback((group: SidebarTemporalGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef(false);

  const activeRowIndex = useMemo(() => {
    if (focusedIndex >= 0 && focusedIndex < visible.length) return focusedIndex;
    const activeIdx = visible.findIndex((s) => s.id === activeSessionId);
    return activeIdx >= 0 ? activeIdx : 0;
  }, [focusedIndex, visible, activeSessionId]);

  const rowButtonAt = useCallback((index: number): HTMLElement | null => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-sidebar-session-index="${index}"]`,
    );
    return row?.querySelector<HTMLElement>(ROW_FOCUSABLE_SELECTOR) ?? null;
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const rows = container.querySelectorAll<HTMLElement>('[data-sidebar-session-index]');
    rows.forEach((row) => {
      const index = Number(row.dataset['sidebarSessionIndex']);
      const button = row.querySelector<HTMLElement>(ROW_FOCUSABLE_SELECTOR);
      if (!button) return;
      button.tabIndex = index === activeRowIndex ? 0 : -1;
    });
    if (pendingFocusRef.current) {
      pendingFocusRef.current = false;
      rowButtonAt(activeRowIndex)?.focus();
    }
    // `focusedIndex` is a dependency even though `activeRowIndex` is derived
    // from it: -1 -> 0 leaves `activeRowIndex` at 0 (its no-selection default),
    // so without it the FIRST ArrowDown would update the highlight but never
    // move real focus, exactly the divergence this fix exists to remove.
  }, [activeRowIndex, focusedIndex, visible, rowButtonAt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (internalSearchOpen) return;
      if (visible.length === 0) return;
      // A row's own "..." menu owns arrow/home/end navigation while it is
      // open (see Menu.tsx) - without this guard, this bubble-phase list
      // handler can still act on the same keystroke, moving list focus out
      // from under the open menu and taking real DOM focus with it.
      if (isMenuPanelOpen()) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        pendingFocusRef.current = true;
        setFocusedIndex((p) => (p + 1 >= visible.length ? 0 : p + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        pendingFocusRef.current = true;
        setFocusedIndex((p) => (p - 1 < 0 ? visible.length - 1 : p - 1));
      } else if (e.key === 'Home' && focusedIndex >= 0) {
        e.preventDefault();
        pendingFocusRef.current = true;
        setFocusedIndex(0);
      } else if (e.key === 'End' && focusedIndex >= 0) {
        e.preventDefault();
        pendingFocusRef.current = true;
        setFocusedIndex(visible.length - 1);
      } else if (e.key === 'Escape' && focusedIndex >= 0) {
        e.preventDefault();
        rowButtonAt(focusedIndex)?.blur();
        setFocusedIndex(-1);
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
        const button = rowButtonAt(focusedIndex);
        if (button && button.contains(target)) return;
        e.preventDefault();
        const conv = visible[focusedIndex];
        if (conv) {
          onSelect(conv.id);
          setFocusedIndex(-1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [internalSearchOpen, visible, focusedIndex, onSelect, rowButtonAt]);

  const handleListFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-sidebar-session-index]');
    if (!row) return;
    const index = Number(row.dataset['sidebarSessionIndex']);
    if (Number.isNaN(index)) return;
    setFocusedIndex(index);
  }, []);

  const handleListBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as HTMLElement | null;
    if (next && event.currentTarget.contains(next)) return;
    setFocusedIndex(-1);
  }, []);

  const renderSessionRow = useCallback(
    (session: SidebarSession) => {
      const globalIndex = visible.findIndex((c) => c.id === session.id);
      return (
        <div key={session.id} data-sidebar-session-index={globalIndex}>
          <SessionItem
            session={session}
            isActive={session.id === activeSessionId}
            isKeyboardFocused={globalIndex === focusedIndex}
            projectName={session.projectId ? projectNameById.get(session.projectId) : undefined}
            projects={projects}
            simple={isSimpleMode}
            href={getSessionHref?.(session)}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onStar={onStar}
            onArchive={onArchive}
            onRestore={onRestore}
            onShare={onShare}
            onMoveToProject={onMoveToProject}
            onOpenCustomInstructions={onOpenCustomInstructions}
            onMarkUnread={onMarkUnread}
          />
        </div>
      );
    },
    [
      visible,
      activeSessionId,
      focusedIndex,
      projectNameById,
      projects,
      isSimpleMode,
      getSessionHref,
      onSelect,
      onRename,
      onDelete,
      onTogglePin,
      onStar,
      onArchive,
      onRestore,
      onShare,
      onMoveToProject,
      onOpenCustomInstructions,
      onMarkUnread,
    ],
  );

  const defaultRenderNavLink = useCallback((item: SidebarNavItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        onClick={item.onClick}
        aria-current={item.isActive ? 'page' : undefined}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
          item.isActive
            ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{item.label}</span>
        {item.badge != null && (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">{item.badge}</span>
        )}
      </button>
    );
  }, []);

  const resolvedNavItems = navItems ?? EMPTY_NAV_ITEMS;

  if (collapsed) {
    const toggleLabel = t('sidebar.toggleSidebar', 'Toggle sidebar');
    return (
      <TooltipProvider delayDuration={200}>
        <nav
          aria-label={t('sidebar.navLabel', 'Chat history')}
          className="flex flex-col border-r border-[var(--chat-border-subtle)] bg-[var(--chat-sidebar-bg)] transition-all duration-300 ease-in-out"
          style={{ width: COLLAPSED_RAIL_WIDTH }}
        >
          <div className="flex flex-col items-center gap-2 py-3">
            <RailButton label={toggleLabel} icon={PanelLeft} onClick={onToggleCollapse} />
            <RailButton
              label={t('sidebar.newChatAction', 'New chat')}
              icon={SquarePen}
              onClick={onNewChat}
            />
            <RailButton
              label={tCommon('search', 'Search')}
              icon={Search}
              onClick={handleOpenSearch}
            />
            {resolvedNavItems.map((item) => (
              <RailButton
                key={item.id}
                label={item.label}
                icon={item.icon}
                isActive={item.isActive}
                onClick={item.onClick}
              />
            ))}
          </div>
          {collapsedFooterSlot && (
            <div className="mt-auto flex flex-col items-center gap-1 border-t border-[hsl(var(--border))] py-3">
              {collapsedFooterSlot}
            </div>
          )}
        </nav>
      </TooltipProvider>
    );
  }

  return (
    <>
      {!onOpenSearch && (
        <SearchOverlay
          open={internalSearchOpen}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          results={filtered}
          activeSessionId={activeSessionId}
          onSelect={onSelect}
          onClose={() => {
            setInternalSearchOpen(false);
            setSearchQuery('');
          }}
        />
      )}

      <nav
        aria-label={t('sidebar.navLabel', 'Chat history')}
        className={cn(
          // inset-auto is load-bearing: the root is positioned only so its own
          // descendants can anchor to it, and it is never itself offset. Without
          // saying so, a narrow container resolved its inline end to 100% and
          // pushed the whole sidebar exactly one container-width off-canvas,
          // which is what left the mobile drawer rendering as an empty panel.
          'relative inset-auto flex flex-col border-r border-[var(--chat-border-subtle)] bg-[var(--chat-sidebar-bg)] transition-[width] duration-300 ease-in-out',
          className,
        )}
        style={{ width }}
      >
        {/* Header: brand wordmark (optional) + collapse + compose + search */}
        <div className="border-b border-[hsl(var(--border))] p-4">
          {/* Brand row, only rendered when a surface supplies a headerSlot
              (e.g. the web app-shell wordmark). Surfaces that pass no headerSlot
              stay byte-identical to the previous layout. */}
          {headerSlot && <div className="mb-3 flex items-center">{headerSlot}</div>}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={t('sidebar.toggleSidebar', 'Toggle sidebar')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onNewChat}
                aria-label={t('sidebar.newChatAction', 'New chat')}
                className="flex items-center gap-2 rounded-lg bg-[hsl(var(--muted))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
              >
                <SquarePen className="h-4 w-4" />
                {t('newChat', 'New Chat')}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenSearch}
            className="flex w-full items-center gap-2 rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
          >
            <Search className="h-4 w-4" />
            <span>{tCommon('search', 'Search')}</span>
            <span className="ml-auto flex items-center gap-1">
              <kbd className="rounded bg-[hsl(var(--card))] px-1.5 py-0.5 text-xs">
                {modKeySymbol}
              </kbd>
              <kbd className="rounded bg-[hsl(var(--card))] px-1.5 py-0.5 text-xs">K</kbd>
            </span>
          </button>
        </div>

        {/* Nav rows, filters and the conversation list share one scroll region.
            They used to be siblings of the pinned footer, so on a short viewport
            (1280x600) the fixed header, nav and footer left the `flex-1` list a
            20px window that could not fit even its own "Chats" heading. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
          {/* Nav rows (Projects / Skills / surface-provided) */}
          {!isSimpleMode && resolvedNavItems.length > 0 && (
            <div className="shrink-0 space-y-0.5 border-b border-[hsl(var(--border))] px-2 py-1.5">
              {resolvedNavItems.map((item) => (renderNavLink ?? defaultRenderNavLink)(item))}
            </div>
          )}

          {/* Archive toggle. The project folder filter that used to lead this row
              was never wired: no caller passed `onSelectProjectFilter`, so
              picking a project called `undefined?.()` and the trigger stayed
              on "All". Projects are reached from the rail and the Projects
              section below, which is also where claude.ai scopes them. */}
          {!isSimpleMode && archivedCount > 0 && (
            <div className="flex shrink-0 items-center justify-end px-3 py-2">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                aria-label={
                  showArchived
                    ? t('sidebar.showActive', 'Show active')
                    : t('sidebar.archivedCount', 'Archived ({{count}})', { count: archivedCount })
                }
                title={
                  showArchived
                    ? t('sidebar.showActive', 'Show active')
                    : t('sidebar.archivedCount', 'Archived ({{count}})', { count: archivedCount })
                }
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  // --chat-* rather than --warning-*: this component renders on
                  // desktop too, which loads chat.css but not foundation.css.
                  // Measured on the sidebar surface: 6.55:1 light, 8.34:1 dark.
                  showArchived
                    ? 'bg-[var(--chat-warning-bg)] text-[var(--chat-warning-fg)]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                )}
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Conversation list.
            AUDIT-FIX GOV-31: the roving-tabindex container, it owns the row
            refs, syncs the highlight with real focus, and releases it on blur. */}
          <div ref={listRef} className="flex-1" onFocus={handleListFocus} onBlur={handleListBlur}>
            <div className="p-2">
              {/* Projects section, header + pinned sub-section + unpinned list */}
              {projectListEnabled && (pinnedProjects.length > 0 || unpinnedProjects.length > 0) && (
                <div className="mb-4">
                  {/* Section header row: "Projects" + collapse chevron + "+" + "..." */}
                  <div className="group/projhdr mb-1 flex items-center gap-1 px-2 py-0.5">
                    <button
                      type="button"
                      onClick={() => setProjectsSectionCollapsed((v) => !v)}
                      aria-label={
                        projectsSectionCollapsed
                          ? t('sidebar.expandProjects', 'Expand projects')
                          : t('sidebar.collapseProjects', 'Collapse projects')
                      }
                      className="flex min-h-6 min-w-0 flex-1 items-center gap-1 text-[13px] font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                    >
                      <span>{t('sidebar.projects', 'Projects')}</span>
                      <ChevronRight
                        className={cn(
                          'h-3 w-3 shrink-0 transition-transform',
                          !projectsSectionCollapsed && 'rotate-90',
                        )}
                      />
                    </button>
                    {/* Right-side actions (ChatGPT pattern): hidden at rest, revealed
                      on header hover or keyboard focus-within (a11y: hover-only
                      affordances must also appear on focus), and pinned visible
                      while the "…" menu is open. Rendered only when the relevant
                      handlers are present. */}
                    <div
                      className={cn(
                        'flex shrink-0 items-center gap-0.5 transition-opacity',
                        'opacity-0 group-hover/projhdr:opacity-100 group-focus-within/projhdr:opacity-100 [@media(hover:none)]:opacity-100',
                        projectsHeaderMenuOpen && 'opacity-100',
                      )}
                    >
                      {onProjectCreate && (
                        <button
                          type="button"
                          aria-label={t('sidebar.newProject', 'New project')}
                          title={t('sidebar.newProject', 'New project')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onProjectCreate();
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                      {/* "..." opens the ChatGPT-style "Organize chats" menu */}
                      <Menu
                        align="end"
                        onOpenChange={setProjectsHeaderMenuOpen}
                        trigger={({ toggle }) => (
                          <button
                            type="button"
                            aria-label={t('sidebar.organizeChats', 'Organize chats')}
                            title={t('sidebar.organizeChats', 'Organize chats')}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle();
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
                          >
                            <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
                          </button>
                        )}
                        menuClassName="w-52"
                      >
                        {({ close }) => (
                          <>
                            {/* Non-interactive section label */}
                            <div className="px-2 py-1 text-[12px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                              {t('sidebar.organizeChats', 'Organize chats')}
                            </div>
                            <MenuSeparator />
                            <MenuItem
                              close={close}
                              onSelect={() => setOrganizeMode('one-list')}
                              icon={<List className="h-4 w-4" />}
                              trailing={
                                organizeMode === 'one-list' ? (
                                  <Check className="h-3.5 w-3.5 text-[hsl(var(--foreground))]" />
                                ) : undefined
                              }
                            >
                              {t('sidebar.organizeOneList', 'In one list')}
                            </MenuItem>
                            <MenuItem
                              close={close}
                              onSelect={() => setOrganizeMode('by-project')}
                              icon={<Folder className="h-4 w-4" />}
                              trailing={
                                organizeMode === 'by-project' ? (
                                  <Check className="h-3.5 w-3.5 text-[hsl(var(--foreground))]" />
                                ) : undefined
                              }
                            >
                              {t('sidebar.organizeByProject', 'By project')}
                            </MenuItem>
                          </>
                        )}
                      </Menu>
                    </div>
                  </div>

                  {!projectsSectionCollapsed && (
                    <>
                      {/* Pinned sub-section */}
                      {pinnedProjects.length > 0 && (
                        <div className="mb-2">
                          <div className="mb-0.5 px-3 py-0.5 text-[13px] font-semibold text-[hsl(var(--muted-foreground))]">
                            {t('sidebar.pinned', 'Pinned')}
                          </div>
                          {pinnedProjects.map((project) => (
                            <ProjectRow
                              key={project.id}
                              project={project}
                              sessions={sessions}
                              activeSessionId={activeSessionId}
                              expandedProjectIds={expandedProjectIds}
                              setExpandedProjectIds={setExpandedProjectIds}
                              projectShowAllChats={projectShowAllChats}
                              setProjectShowAllChats={setProjectShowAllChats}
                              onOpen={onProjectOpen}
                              onNewChat={onProjectNewChat}
                              onRename={onProjectRename}
                              onShare={onProjectShare}
                              onSettings={onProjectSettings}
                              onPin={onProjectPin}
                              onDelete={onProjectDelete}
                              onSelectSession={onSelect}
                              getSessionHref={getSessionHref}
                            />
                          ))}
                        </div>
                      )}

                      {/* Unpinned list */}
                      {visibleUnpinnedProjects.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          sessions={sessions}
                          activeSessionId={activeSessionId}
                          expandedProjectIds={expandedProjectIds}
                          setExpandedProjectIds={setExpandedProjectIds}
                          projectShowAllChats={projectShowAllChats}
                          setProjectShowAllChats={setProjectShowAllChats}
                          onOpen={onProjectOpen}
                          onNewChat={onProjectNewChat}
                          onRename={onProjectRename}
                          onShare={onProjectShare}
                          onSettings={onProjectSettings}
                          onPin={onProjectPin}
                          onDelete={onProjectDelete}
                          onSelectSession={onSelect}
                          getSessionHref={getSessionHref}
                        />
                      ))}
                      {!showAllProjects && unpinnedProjects.length > PROJECTS_SHOW_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllProjects(true)}
                          className="mt-0.5 w-full rounded-md px-3 py-1.5 text-left text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                        >
                          {t('showMore', 'Show more')}
                        </button>
                      )}
                      {showAllProjects && unpinnedProjects.length > PROJECTS_SHOW_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllProjects(false)}
                          className="mt-0.5 w-full rounded-md px-3 py-1.5 text-left text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                        >
                          {t('showLess', 'Show less')}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Chats section header + pinned sessions */}
              {(pinned.length > 0 || grouped.size > 0) && (
                <div className="mb-1 px-3 py-1 text-[13px] font-semibold text-[hsl(var(--muted-foreground))]">
                  {t('sidebar.chats', 'Chats')}
                </div>
              )}

              {pinned.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-1 px-3 text-[13px] font-semibold text-[hsl(var(--muted-foreground))]">
                    <Pin className="h-3 w-3" /> {t('sidebar.pinned', 'Pinned')}
                  </div>
                  {pinned.map(renderSessionRow)}
                </div>
              )}

              {Array.from(grouped.entries()).map(([group, convs]) => {
                const isExpanded = expandedGroups.has(group);
                return (
                  <div key={group} className="mb-4">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center gap-2 px-2 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                    >
                      <ChevronRight
                        className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')}
                      />
                      <span className="flex items-center gap-1">
                        {group === 'today' && <Calendar className="h-3 w-3" />}
                        {group === 'yesterday' && <Clock className="h-3 w-3" />}
                        {t(`sidebar.temporal.${group}`, TEMPORAL_LABELS[group])}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="mt-1 space-y-1">{convs.map(renderSessionRow)}</div>
                    )}
                  </div>
                );
              })}

              {/* Loading skeleton, only while the list is genuinely empty so far,
                so a background refetch on an already-populated list never
                replaces real rows with placeholders. */}
              {visible.length === 0 && isLoading && (
                <div
                  className="space-y-1 px-2 py-1"
                  role="status"
                  aria-label={t('sidebar.loadingConversations', 'Loading conversations')}
                >
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-8 animate-pulse rounded-md bg-[hsl(var(--accent))]/50"
                      style={{ animationDelay: `${i * 75}ms` }}
                    />
                  ))}
                </div>
              )}

              {showLoadFailure && (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                  <MessageSquare className="mb-2 h-7 w-7 text-red-400/60" />
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {t('sidebar.loadFailed', "Couldn't load conversations")}
                  </p>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{error}</p>
                  {onRetryLoad && (
                    <button
                      type="button"
                      onClick={onRetryLoad}
                      className="mt-2 inline-flex min-h-6 items-center px-1 text-xs text-[hsl(var(--primary))] hover:underline"
                    >
                      {tCommon('retry', 'Retry')}
                    </button>
                  )}
                </div>
              )}

              {!hasMatchingConversations && !isLoading && !showLoadFailure && (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                  <MessageSquare className="mb-2 h-7 w-7 text-[hsl(var(--muted-foreground))]" />
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {showArchived
                      ? t('sidebar.noArchivedConversations', 'No archived conversations')
                      : t('sidebar.noConversations', 'No conversations yet')}
                  </p>
                  {!showArchived && (
                    <button
                      type="button"
                      onClick={onNewChat}
                      className="mt-2 inline-flex min-h-6 items-center px-1 text-xs text-[hsl(var(--primary))] hover:underline"
                    >
                      {t('sidebar.startNewChat', 'Start a new chat')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Extra slot above footer (e.g. free-plan nudge) */}
        {navExtraSlot}

        {/* Footer: usage widget + mode pill + injected chrome */}
        <div className="mt-auto space-y-2 border-t border-[hsl(var(--border))] px-3 py-2.5">
          {showUsageWidget && (
            <button
              type="button"
              onClick={onOpenUsage}
              title={t('sidebar.budgetUsed', '{{percent}}% of token budget used', {
                percent: Math.round(budgetPercent),
              })}
              aria-label={t('sidebar.budgetUsed', '{{percent}}% of token budget used', {
                percent: Math.round(budgetPercent),
              })}
              className="group flex min-h-6 w-full items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-[hsl(var(--accent))]"
            >
              {/* `--muted` is 1.03:1 against the light sidebar, so at 0% the meter
                  rendered as nothing at all. The border token is the lightest
                  value in the palette that still reads as a track. */}
              <div
                aria-hidden="true"
                className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--chat-border-strong)]"
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    budgetPercent >= 95
                      ? 'bg-red-500'
                      : budgetPercent >= 80
                        ? 'bg-amber-500'
                        : 'bg-blue-500',
                  )}
                  style={{ width: `${Math.min(Math.max(budgetPercent, 0), 100)}%` }}
                />
              </div>
              <span
                aria-hidden="true"
                className="shrink-0 text-[12px] tabular-nums text-[hsl(var(--muted-foreground))]"
              >
                {Math.round(budgetPercent)}%
              </span>
            </button>
          )}
          <div className="flex items-center gap-1.5 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden">{footerSlot}</div>
          </div>
        </div>
      </nav>
    </>
  );
}

function useTitleTruncated<T extends HTMLElement>(
  dependency: unknown,
): {
  ref: (node: T | null) => void;
  truncated: boolean;
} {
  const [node, setNode] = useState<T | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!node) return;
    const measure = () => setTruncated(node.scrollWidth > node.clientWidth);
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [node, dependency]);

  return { ref: setNode, truncated };
}

function RailButton({
  label,
  icon: Icon,
  onClick,
  isActive = false,
}: {
  label: string;
  icon: SidebarNavItem['icon'];
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]',
            isActive
              ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
              : 'text-[hsl(var(--muted-foreground))]',
          )}
        >
          <Icon className="h-5 w-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

const EMPTY_NAV_ITEMS: SidebarNavItem[] = [];

const PROJECT_CHATS_SHOW_LIMIT = 5;

function ProjectRowIcon({ project, isExpanded }: { project: SidebarProject; isExpanded: boolean }) {
  if (hasKnownProjectIcon(project.iconEmoji)) {
    const Icon = resolveProjectIcon(project.iconEmoji);
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        style={{ color: resolveProjectAccentHex(project.accentColor) }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return isExpanded ? (
    <FolderOpen
      className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]"
      aria-hidden="true"
    />
  ) : (
    <Folder className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
  );
}

interface ProjectRowProps {
  project: SidebarProject;
  sessions: SidebarSession[];
  activeSessionId?: string;
  expandedProjectIds: Set<string>;
  setExpandedProjectIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  projectShowAllChats: Set<string>;
  setProjectShowAllChats: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpen?: (id: string) => void;
  onNewChat?: (id: string) => void;
  onRename?: (id: string) => void;
  onShare?: (id: string) => void;
  onSettings?: (id: string) => void;
  onPin?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSelectSession?: (id: string) => void;
  getSessionHref?: (session: SidebarSession) => string;
}

function ProjectRow({
  project,
  sessions,
  activeSessionId,
  expandedProjectIds,
  setExpandedProjectIds,
  projectShowAllChats,
  setProjectShowAllChats,
  onOpen,
  onNewChat,
  onRename,
  onShare,
  onSettings,
  onPin,
  onDelete,
  onSelectSession,
  getSessionHref,
}: ProjectRowProps) {
  const { t } = useUiTranslation('chat');
  const [menuOpen, setMenuOpen] = useState(false);
  const titleTruncation = useTitleTruncated<HTMLSpanElement>(project.name);

  const isExpanded = expandedProjectIds.has(project.id);
  const showAllChats = projectShowAllChats.has(project.id);

  const toggleExpand = useCallback(() => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(project.id)) next.delete(project.id);
      else next.add(project.id);
      return next;
    });
  }, [project.id, setExpandedProjectIds]);

  const projectSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.projectId === project.id && !s.archived)
        .sort((a, b) => toSafeDate(b.updatedAt).getTime() - toSafeDate(a.updatedAt).getTime()),
    [sessions, project.id],
  );
  const visibleSessions = showAllChats
    ? projectSessions
    : projectSessions.slice(0, PROJECT_CHATS_SHOW_LIMIT);

  return (
    <div className="mb-0.5">
      {/* Main project row */}
      <div
        className={cn(
          'group/projrow relative flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors',
          'hover:bg-[hsl(var(--accent))] cursor-pointer',
          (menuOpen || isExpanded) && 'bg-[hsl(var(--accent))]',
        )}
      >
        {/* Folder icon + project name, clicking toggles expand */}
        <button
          type="button"
          className="flex min-h-6 min-w-0 flex-1 items-center gap-2 text-left"
          onClick={toggleExpand}
          aria-label={
            isExpanded
              ? t('sidebar.collapseProject', 'Collapse project {{name}}', { name: project.name })
              : t('sidebar.expandProject', 'Expand project {{name}}', { name: project.name })
          }
          aria-expanded={isExpanded}
        >
          <ProjectRowIcon project={project} isExpanded={isExpanded} />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  ref={titleTruncation.ref}
                  className="flex-1 truncate text-sm text-[hsl(var(--foreground))]"
                >
                  {project.name}
                </span>
              </TooltipTrigger>
              {titleTruncation.truncated && (
                <TooltipContent side="bottom">{project.name}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </button>

        {/* Hover actions (ChatGPT pattern): hidden at rest, revealed on row
            hover or keyboard focus-within, pinned while the menu is open. */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 transition-opacity',
            'opacity-0 group-hover/projrow:opacity-100 group-focus-within/projrow:opacity-100 [@media(hover:none)]:opacity-100',
            menuOpen && 'opacity-100',
          )}
        >
          {/* New chat in project (compose icon) */}
          {onNewChat && (
            <button
              type="button"
              aria-label={t('sidebar.newChatInProjectNamed', 'New chat in {{name}}', {
                name: project.name,
              })}
              title={t('sidebar.newChatInProject', 'New chat in project')}
              onClick={(e) => {
                e.stopPropagation();
                onNewChat(project.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
            >
              <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {/* More actions menu */}
          <Menu
            align="end"
            onOpenChange={setMenuOpen}
            trigger={({ toggle }) => (
              <button
                type="button"
                aria-label={t('sidebar.moreOptionsFor', 'More options for {{name}}', {
                  name: project.name,
                })}
                title={t('sidebar.moreOptions', 'More options')}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            menuClassName="w-52"
            className="relative"
          >
            {({ close }) => {
              const handleClose = close;
              return (
                <>
                  {onShare && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onShare(project.id)}
                      icon={<Upload className="h-4 w-4" />}
                    >
                      {t('sidebar.shareProject', 'Share project')}
                    </MenuItem>
                  )}
                  {onRename && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onRename(project.id)}
                      icon={<Pencil className="h-4 w-4" />}
                    >
                      {t('sidebar.renameProject', 'Rename project')}
                    </MenuItem>
                  )}
                  {onSettings && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onSettings(project.id)}
                      icon={<Settings className="h-4 w-4" />}
                    >
                      {t('sidebar.projectSettings', 'Project settings')}
                    </MenuItem>
                  )}
                  {onOpen && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onOpen(project.id)}
                      icon={<Folder className="h-4 w-4" />}
                    >
                      {t('sidebar.projectHome', 'Project home')}
                    </MenuItem>
                  )}
                  {(onShare || onRename || onSettings || onOpen) && onPin && <MenuSeparator />}
                  {onPin && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onPin(project.id)}
                      icon={<Pin className="h-4 w-4" />}
                    >
                      {project.pinned
                        ? t('sidebar.unpinProject', 'Unpin project')
                        : t('sidebar.pinProject', 'Pin project')}
                    </MenuItem>
                  )}
                  {onDelete && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onDelete(project.id)}
                      icon={<Trash2 className="h-4 w-4" />}
                      destructive
                    >
                      {t('sidebar.deleteProject', 'Delete project')}
                    </MenuItem>
                  )}
                </>
              );
            }}
          </Menu>
        </div>
      </div>

      {/* Expanded: indented conversation list */}
      {isExpanded && (
        <div className="mt-0.5 pl-4">
          {projectSessions.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] italic">
              {t('noChats', 'No chats yet')}
            </p>
          ) : (
            <>
              {visibleSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const href = getSessionHref?.(session);
                const rowClassName = cn(
                  'group/projchat flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors',
                  isActive
                    ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]',
                );
                const rowChildren = (
                  <>
                    {/* Active indicator dot */}
                    {isActive && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]"
                        aria-label={t('sidebar.activeConversation', 'Active conversation')}
                      />
                    )}
                    <span className="flex-1 truncate text-xs">
                      {session.title || t('sidebar.untitledChat', 'Untitled chat')}
                    </span>
                  </>
                );
                if (href) {
                  return (
                    <a
                      key={session.id}
                      href={href}
                      onClick={(event) => {
                        if (
                          event.defaultPrevented ||
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        ) {
                          return;
                        }
                        event.preventDefault();
                        onSelectSession?.(session.id);
                      }}
                      className={rowClassName}
                    >
                      {rowChildren}
                    </a>
                  );
                }
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onSelectSession?.(session.id)}
                    className={rowClassName}
                  >
                    {rowChildren}
                  </button>
                );
              })}
              {!showAllChats && projectSessions.length > PROJECT_CHATS_SHOW_LIMIT && (
                <button
                  type="button"
                  onClick={() =>
                    setProjectShowAllChats((prev) => {
                      const next = new Set(prev);
                      next.add(project.id);
                      return next;
                    })
                  }
                  className="w-full rounded-md px-3 py-1 text-left text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--muted-foreground))]"
                >
                  {t('showMore', 'Show more')}
                </button>
              )}
              {showAllChats && projectSessions.length > PROJECT_CHATS_SHOW_LIMIT && (
                <button
                  type="button"
                  onClick={() =>
                    setProjectShowAllChats((prev) => {
                      const next = new Set(prev);
                      next.delete(project.id);
                      return next;
                    })
                  }
                  className="w-full rounded-md px-3 py-1 text-left text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--muted-foreground))]"
                >
                  {t('showLess', 'Show less')}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
