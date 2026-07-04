'use client';

/**
 * <Sidebar> — the framework-agnostic chat sidebar shared by AGI Desktop and
 * AGI Web. Design ported faithfully from
 * apps/desktop/src/features/chat/Sidebar.tsx (+ ProjectsView / web ChatSidebar):
 *
 *   • ChatGPT-style new-chat / search header + compose affordance
 *   • project-folder filter dropdown (ChatGPT project folders)
 *   • pinned section + temporal grouping (Today / Yesterday / This Week / …)
 *   • archive toggle, per-conversation hover 3-dots actions
 *   • collapsed icon-rail
 *   • footer with local/cloud mode pill + optional usage widget + footerSlot
 *
 * BOUNDARY: pure presentation. NO next/navigation, NO @tauri-apps, NO zustand,
 * NO clerk, NO fetch. ALL data + handlers + surface-specific chrome are props.
 * Navigation is done by the surface inside the injected handlers; surface
 * chrome (account menu, notifications, incognito toggle) goes in `footerSlot`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  FolderOpen,
  Layers,
  List,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '../cn';
import { Menu, MenuItem, MenuSeparator } from './Menu';
import { SearchOverlay } from './SearchOverlay';
import { SessionItem, type SessionItemHandlers } from './SessionItem';
import { getTemporalGroup, TEMPORAL_LABELS, toSafeDate } from './temporal';
import type {
  SidebarMode,
  SidebarNavItem,
  SidebarProject,
  SidebarSession,
  SidebarTemporalGroup,
} from './types';

export interface SidebarProps extends SessionItemHandlers {
  /* ---- data ---- */
  sessions: SidebarSession[];
  activeSessionId?: string;
  projects?: SidebarProject[];
  selectedProjectFilter?: string | null;
  /** True while the initial session list fetch is in flight. Drives a
   *  skeleton in place of the empty state so a loading list never reads as
   *  "you have zero conversations". */
  isLoading?: boolean;
  /** Non-null when the session list failed to load. Rendered instead of the
   *  "No conversations yet" empty state so a failed fetch is distinguishable
   *  from a genuinely empty account. */
  error?: string | null;

  /* ---- layout ---- */
  className?: string;
  collapsed?: boolean;
  width?: number;
  isMobile?: boolean;
  /** Desktop "Simple Mode": collapses per-row actions to delete only. */
  isSimpleMode?: boolean;

  /* ---- footer ---- */
  mode?: SidebarMode;
  budgetPercent?: number;
  showUsageWidget?: boolean;

  /* ---- handlers (data/IO injected by the surface) ---- */
  onNewChat: () => void;
  onToggleCollapse?: () => void;
  onSelectProjectFilter?: (projectId: string | null) => void;
  onOpenSearch?: () => void;
  onOpenProjects?: () => void;
  onOpenSkills?: () => void;
  onModeClick?: () => void;
  onOpenUsage?: () => void;

  /* ---- ChatGPT-style project list handlers (all optional; list hidden when absent) ---- */
  /** Open/navigate to a project's conversation list. */
  onProjectOpen?: (projectId: string) => void;
  /** Start a new chat scoped to the given project. */
  onProjectNewChat?: (projectId: string) => void;
  /** Open rename flow for the project. */
  onProjectRename?: (projectId: string) => void;
  /** Share the project. */
  onProjectShare?: (projectId: string) => void;
  /** Open project settings dialog. */
  onProjectSettings?: (projectId: string) => void;
  /** Toggle pinned state of the project. */
  onProjectPin?: (projectId: string) => void;
  /** Delete the project (destructive). */
  onProjectDelete?: (projectId: string) => void;
  /** Create a new project (opens the project-create flow on the surface). */
  onProjectCreate?: () => void;

  /* ---- slots / render props for non-pure chrome ---- */
  /** Extra nav rows (desktop puts Projects/Skills; web puts Chats/Artifacts/…). */
  navItems?: SidebarNavItem[];
  /** Renders a nav item — defaults to a <button onClick>. Surface can return next/<Link>. */
  renderNavLink?: (item: SidebarNavItem) => React.ReactNode;
  /** Below the list, above the footer — e.g. a Free-plan nudge. */
  navExtraSlot?: React.ReactNode;
  /** Footer chrome: desktop = UserProfile+NotificationCenter+IncognitoToggle; web = UserProfileArea. */
  footerSlot?: React.ReactNode;
  /** Header chrome injected next to the new-chat button (desktop incognito toggle). */
  headerSlot?: React.ReactNode;
}

const DEFAULT_EXPANDED: SidebarTemporalGroup[] = ['today', 'yesterday', 'thisWeek'];

export function Sidebar(props: SidebarProps) {
  const {
    sessions,
    activeSessionId,
    projects = [],
    selectedProjectFilter = null,
    isLoading = false,
    error = null,
    className,
    collapsed = false,
    width = 260,
    // isMobile is part of the public API (surfaces collapse on mobile inside
    // their own onSelect/onNewChat handlers); the component itself is layout-only.
    isMobile: _isMobile = false,
    isSimpleMode = false,
    mode = 'local',
    budgetPercent = 0,
    showUsageWidget = false,
    onNewChat,
    onToggleCollapse,
    onSelectProjectFilter,
    onOpenSearch,
    onOpenProjects,
    onOpenSkills,
    onModeClick,
    onOpenUsage,
    onProjectOpen,
    onProjectNewChat,
    onProjectRename,
    onProjectShare,
    onProjectSettings,
    onProjectPin,
    onProjectDelete,
    onProjectCreate,
    navItems,
    renderNavLink,
    navExtraSlot,
    footerSlot,
    headerSlot,
    // SessionItem handlers
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
  } = props;

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
  /** Whether the Projects section is collapsed (header chevron toggles). */
  const [projectsSectionCollapsed, setProjectsSectionCollapsed] = useState(false);
  /** Set of project IDs whose conversation list is expanded in the sidebar. */
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  /** Per-project "show more chats" state. */
  const [projectShowAllChats, setProjectShowAllChats] = useState<Set<string>>(new Set());
  /**
   * ChatGPT-style "Organize chats" preference: 'by-project' (default) groups
   * the Chats list by project; 'one-list' shows all chats in a flat list.
   * This is local state; surfaces may later lift it to their own store.
   */
  const [organizeMode, setOrganizeMode] = useState<'by-project' | 'one-list'>('by-project');

  // Whether the project list section is enabled (any of the project handlers present)
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

  // Surface can override the search overlay entirely (web uses GlobalSearchDialog).
  const handleOpenSearch = useCallback(() => {
    if (onOpenSearch) onOpenSearch();
    else setInternalSearchOpen(true);
  }, [onOpenSearch]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [projects]);

  const selectedProject = useMemo(
    () => (selectedProjectFilter ? projects.find((p) => p.id === selectedProjectFilter) : null),
    [projects, selectedProjectFilter],
  );

  const archivedCount = useMemo(
    () => sessions.filter((s) => s.archived === true).length,
    [sessions],
  );

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    let base = showArchived
      ? sessions.filter((s) => s.archived === true)
      : sessions.filter((s) => !s.archived);
    if (selectedProjectFilter) {
      base = base.filter((s) => s.projectId === selectedProjectFilter);
    } else if (organizeMode === 'by-project' && projectListEnabled) {
      // In "by-project" mode, sessions that belong to a project appear under their
      // project folder; exclude them from the flat Chats list to avoid duplication.
      base = base.filter((s) => !s.projectId);
    }
    if (!term) return base;
    return base.filter((s) =>
      `${s.title ?? ''} ${s.lastMessage ?? s.preview ?? ''}`.toLowerCase().includes(term),
    );
  }, [
    sessions,
    searchQuery,
    showArchived,
    selectedProjectFilter,
    organizeMode,
    projectListEnabled,
  ]);

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

  const toggleGroup = useCallback((group: SidebarTemporalGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Keyboard arrow navigation over the visible list (ported from desktop).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (internalSearchOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((p) => (p + 1 >= visible.length ? 0 : p + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((p) => (p - 1 < 0 ? visible.length - 1 : p - 1));
      } else if (e.key === 'Enter' && focusedIndex >= 0) {
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
  }, [internalSearchOpen, visible, focusedIndex, onSelect]);

  const renderSessionRow = useCallback(
    (session: SidebarSession) => {
      const globalIndex = visible.findIndex((c) => c.id === session.id);
      return (
        <SessionItem
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          isKeyboardFocused={globalIndex === focusedIndex}
          projectName={session.projectId ? projectNameById.get(session.projectId) : undefined}
          projects={projects}
          simple={isSimpleMode}
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
        />
      );
    },
    [
      visible,
      activeSessionId,
      focusedIndex,
      projectNameById,
      projects,
      isSimpleMode,
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
    ],
  );

  const defaultRenderNavLink = useCallback((item: SidebarNavItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        onClick={item.onClick}
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

  const resolvedNavItems = useMemo<SidebarNavItem[]>(() => {
    if (navItems) return navItems;
    const items: SidebarNavItem[] = [];
    if (onOpenProjects) {
      items.push({ id: 'projects', label: 'Projects', icon: FolderOpen, onClick: onOpenProjects });
    }
    if (onOpenSkills) {
      items.push({ id: 'skills', label: 'Skills', icon: Sparkles, onClick: onOpenSkills });
    }
    return items;
  }, [navItems, onOpenProjects, onOpenSkills]);

  /* ---------------- collapsed icon-rail ---------------- */
  if (collapsed) {
    return (
      <div className="flex w-16 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all duration-300 ease-in-out">
        <div className="flex flex-col items-center gap-4 p-3">
          <RailButton label="Expand sidebar" icon={PanelLeft} onClick={onToggleCollapse} />
          <RailButton label="New chat" icon={SquarePen} onClick={onNewChat} />
          <RailButton label="Search" icon={Search} onClick={handleOpenSearch} />
          {onOpenProjects && (
            <RailButton label="Projects" icon={FolderOpen} onClick={onOpenProjects} />
          )}
          {onOpenSkills && <RailButton label="Skills" icon={Sparkles} onClick={onOpenSkills} />}
          <div
            title={mode === 'local' ? 'Local' : 'Cloud'}
            className={cn(
              'h-2 w-2 rounded-full',
              mode === 'local' ? 'bg-emerald-400' : 'bg-blue-400',
            )}
          />
        </div>
      </div>
    );
  }

  /* ---------------- expanded sidebar ---------------- */
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

      <div
        className={cn(
          'relative flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-all duration-300 ease-in-out',
          className,
        )}
        style={{ width }}
      >
        {/* Header: collapse + compose + search */}
        <div className="border-b border-[hsl(var(--border))] p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              {headerSlot}
              <button
                type="button"
                onClick={onNewChat}
                aria-label="New chat"
                className="flex items-center gap-2 rounded-lg bg-[hsl(var(--muted))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
              >
                <SquarePen className="h-4 w-4" />
                New Chat
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenSearch}
            className="flex w-full items-center gap-2 rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--accent))]"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
            <span className="ml-auto flex items-center gap-1">
              <kbd className="rounded bg-[hsl(var(--card))] px-1.5 py-0.5 text-xs">
                {modKeySymbol}
              </kbd>
              <kbd className="rounded bg-[hsl(var(--card))] px-1.5 py-0.5 text-xs">K</kbd>
            </span>
          </button>
        </div>

        {/* Nav rows (Projects / Skills / surface-provided) */}
        {!isSimpleMode && resolvedNavItems.length > 0 && (
          <div className="space-y-0.5 border-b border-[hsl(var(--border))] px-2 py-1.5">
            {resolvedNavItems.map((item) => (renderNavLink ?? defaultRenderNavLink)(item))}
          </div>
        )}

        {/* Filter bar: project folder filter + archive toggle */}
        {!isSimpleMode && (projects.length > 0 || archivedCount > 0) && (
          <div className="flex items-center gap-1 px-3 py-2">
            {projects.length > 0 && (
              <Menu
                align="start"
                trigger={({ toggle }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                      selectedProjectFilter
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]',
                    )}
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded"
                      style={
                        selectedProject?.color
                          ? {
                              backgroundColor: `${selectedProject.color}20`,
                              color: selectedProject.color,
                            }
                          : undefined
                      }
                    >
                      <FolderOpen className="h-3 w-3" />
                    </span>
                    <span className="max-w-[100px] truncate">{selectedProject?.name || 'All'}</span>
                    <ChevronDown className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                  </button>
                )}
                menuClassName="w-56"
              >
                {({ close }) => (
                  <>
                    <MenuItem
                      close={close}
                      onSelect={() => onSelectProjectFilter?.(null)}
                      icon={<MessageSquare className="h-4 w-4" />}
                      active={!selectedProjectFilter}
                    >
                      All Conversations
                    </MenuItem>
                    <MenuSeparator />
                    {projects.map((project) => (
                      <MenuItem
                        key={project.id}
                        close={close}
                        onSelect={() => onSelectProjectFilter?.(project.id)}
                        active={selectedProjectFilter === project.id}
                        trailing={project.conversationCount}
                        icon={
                          <span
                            className="flex h-4 w-4 items-center justify-center rounded"
                            style={{ backgroundColor: project.color || 'hsl(var(--primary))' }}
                          >
                            <Layers className="h-2.5 w-2.5 text-white" />
                          </span>
                        }
                      >
                        {project.name}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
            )}

            {selectedProjectFilter && onSelectProjectFilter && (
              <button
                type="button"
                onClick={() => onSelectProjectFilter(null)}
                aria-label="Clear filter"
                title="Clear filter"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <X className="h-3 w-3" />
              </button>
            )}

            <div className="flex-1" />

            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                title={showArchived ? 'Show active' : `Archived (${archivedCount})`}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                  showArchived
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
                )}
              >
                <Archive className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {/* Projects section — header + pinned sub-section + unpinned list */}
            {projectListEnabled && (pinnedProjects.length > 0 || unpinnedProjects.length > 0) && (
              <div className="mb-4">
                {/* Section header row: "Projects" + collapse chevron + "+" + "..." */}
                <div className="group/projhdr mb-1 flex items-center gap-1 px-2 py-0.5">
                  <button
                    type="button"
                    onClick={() => setProjectsSectionCollapsed((v) => !v)}
                    aria-label={projectsSectionCollapsed ? 'Expand projects' : 'Collapse projects'}
                    className="flex min-w-0 flex-1 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                  >
                    <span>Projects</span>
                    <ChevronRight
                      className={cn(
                        'h-3 w-3 shrink-0 transition-transform',
                        !projectsSectionCollapsed && 'rotate-90',
                      )}
                    />
                  </button>
                  {/* Right-side actions: always visible at muted color, brighten on hover.
                      Rendered only when the relevant handlers are present. */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {onProjectCreate && (
                      <button
                        type="button"
                        aria-label="New project"
                        title="New project"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProjectCreate();
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                    {/* "..." opens the ChatGPT-style "Organize chats" menu */}
                    <Menu
                      align="end"
                      trigger={({ toggle }) => (
                        <button
                          type="button"
                          aria-label="Organize chats"
                          title="Organize chats"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle();
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                        >
                          <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                      menuClassName="w-52"
                    >
                      {({ close }) => (
                        <>
                          {/* Non-interactive section label */}
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                            Organize chats
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
                            In one list
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
                            By project
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
                        <div className="mb-0.5 px-3 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]/60">
                          Pinned
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
                      />
                    ))}
                    {!showAllProjects && unpinnedProjects.length > PROJECTS_SHOW_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setShowAllProjects(true)}
                        className="mt-0.5 w-full rounded-md px-3 py-1.5 text-left text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                      >
                        Show more
                      </button>
                    )}
                    {showAllProjects && unpinnedProjects.length > PROJECTS_SHOW_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setShowAllProjects(false)}
                        className="mt-0.5 w-full rounded-md px-3 py-1.5 text-left text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                      >
                        Show less
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Chats section header + pinned sessions */}
            {(pinned.length > 0 || grouped.size > 0) && (
              <div className="mb-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Chats
              </div>
            )}

            {pinned.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-1 px-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  <Pin className="h-3 w-3" /> Pinned
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
                      {TEMPORAL_LABELS[group]}
                    </span>
                    <span className="ml-auto text-[hsl(var(--muted-foreground))]">
                      ({convs.length})
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="mt-1 space-y-1">{convs.map(renderSessionRow)}</div>
                  )}
                </div>
              );
            })}

            {/* Loading skeleton — only while the list is genuinely empty so far,
                so a background refetch on an already-populated list never
                replaces real rows with placeholders. */}
            {visible.length === 0 && isLoading && (
              <div className="space-y-1 px-2 py-1" role="status" aria-label="Loading conversations">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded-md bg-[hsl(var(--accent))]/50"
                    style={{ animationDelay: `${i * 75}ms` }}
                  />
                ))}
              </div>
            )}

            {/* Error state — distinguishes a failed fetch from a genuinely
                empty account so users don't mistake a transient error for
                "you have no chats". */}
            {visible.length === 0 && !isLoading && error && (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <MessageSquare className="mb-2 h-7 w-7 text-red-400/60" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  Couldn&apos;t load conversations
                </p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]/60">{error}</p>
              </div>
            )}

            {visible.length === 0 && !isLoading && !error && (
              <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                <MessageSquare className="mb-2 h-7 w-7 text-[hsl(var(--muted-foreground))]/30" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]/60">
                  {showArchived ? 'No archived conversations' : 'No conversations yet'}
                </p>
                {!showArchived && (
                  <button
                    type="button"
                    onClick={onNewChat}
                    className="mt-2 text-xs text-[hsl(var(--primary))] hover:underline"
                  >
                    Start a new chat
                  </button>
                )}
              </div>
            )}
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
              title={`${Math.round(budgetPercent)}% of token budget used`}
              className="group flex w-full items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-[hsl(var(--accent))]"
            >
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
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
              <span className="shrink-0 text-[10px] tabular-nums text-[hsl(var(--muted-foreground))]">
                {Math.round(budgetPercent)}%
              </span>
            </button>
          )}
          <div className="flex items-center gap-1.5 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden">{footerSlot}</div>
            {onModeClick && (
              <button
                type="button"
                onClick={onModeClick}
                title={mode === 'local' ? 'Local mode' : 'Cloud mode'}
                className={cn(
                  'shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors',
                  mode === 'local'
                    ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30',
                )}
              >
                {mode === 'local' ? 'Local' : 'Cloud'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function RailButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: SidebarNavItem['icon'];
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ProjectRow — ChatGPT-style folder row with expand/collapse + hover compose + more-menu
// ---------------------------------------------------------------------------

const PROJECT_CHATS_SHOW_LIMIT = 5;

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
}: ProjectRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowHovered, setRowHovered] = useState(false);

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

  // Sessions belonging to this project
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
          'relative flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors',
          'hover:bg-[hsl(var(--accent))] cursor-pointer',
          (menuOpen || isExpanded || rowHovered) && 'bg-[hsl(var(--accent))]',
        )}
        onMouseEnter={() => setRowHovered(true)}
        onMouseLeave={() => setRowHovered(false)}
      >
        {/* Folder icon + project name — clicking toggles expand */}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={toggleExpand}
          aria-label={
            isExpanded ? `Collapse project ${project.name}` : `Expand project ${project.name}`
          }
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <FolderOpen
              className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]"
              aria-hidden="true"
            />
          ) : (
            <Folder
              className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]"
              aria-hidden="true"
            />
          )}
          <span className="flex-1 truncate text-sm text-[hsl(var(--foreground))]">
            {project.name}
          </span>
        </button>

        {/* Hover actions: compose + more-menu (visible on hover OR while menu open / expanded) */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 transition-opacity',
            menuOpen || isExpanded || rowHovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          {/* New chat in project (compose icon) */}
          {onNewChat && (
            <button
              type="button"
              aria-label={`New chat in ${project.name}`}
              title="New chat in project"
              onClick={(e) => {
                e.stopPropagation();
                onNewChat(project.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
            >
              <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {/* More actions menu */}
          <Menu
            align="end"
            trigger={({ toggle }) => (
              <button
                type="button"
                aria-label={`More options for ${project.name}`}
                title="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(true);
                  toggle();
                }}
                className="flex h-6 w-6 items-center justify-center rounded text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            menuClassName="w-52"
            className="relative"
          >
            {({ close }) => {
              const handleClose = () => {
                setMenuOpen(false);
                close();
              };
              return (
                <>
                  {onShare && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onShare(project.id)}
                      icon={<Upload className="h-4 w-4" />}
                    >
                      Share project
                    </MenuItem>
                  )}
                  {onRename && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onRename(project.id)}
                      icon={<Pencil className="h-4 w-4" />}
                    >
                      Rename project
                    </MenuItem>
                  )}
                  {onSettings && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onSettings(project.id)}
                      icon={<Settings className="h-4 w-4" />}
                    >
                      Project settings
                    </MenuItem>
                  )}
                  {onOpen && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onOpen(project.id)}
                      icon={<Folder className="h-4 w-4" />}
                    >
                      Project home
                    </MenuItem>
                  )}
                  {(onShare || onRename || onSettings || onOpen) && onPin && <MenuSeparator />}
                  {onPin && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onPin(project.id)}
                      icon={<Pin className="h-4 w-4" />}
                    >
                      {project.pinned ? 'Unpin project' : 'Pin project'}
                    </MenuItem>
                  )}
                  {onDelete && (
                    <MenuItem
                      close={handleClose}
                      onSelect={() => onDelete(project.id)}
                      icon={<Trash2 className="h-4 w-4" />}
                      destructive
                    >
                      Delete project
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
            <p className="px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))]/60 italic">
              No chats yet
            </p>
          ) : (
            <>
              {visibleSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onSelectSession?.(session.id)}
                    className={cn(
                      'group/projchat flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors',
                      isActive
                        ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
                        : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]',
                    )}
                  >
                    {/* Active indicator dot */}
                    {isActive && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--primary))]"
                        aria-label="Active conversation"
                      />
                    )}
                    <span className="flex-1 truncate text-xs">
                      {session.title || 'Untitled chat'}
                    </span>
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
                  className="w-full rounded-md px-3 py-1 text-left text-xs text-[hsl(var(--muted-foreground))]/70 transition-colors hover:text-[hsl(var(--muted-foreground))]"
                >
                  Show {projectSessions.length - PROJECT_CHATS_SHOW_LIMIT} more
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
                  className="w-full rounded-md px-3 py-1 text-left text-xs text-[hsl(var(--muted-foreground))]/70 transition-colors hover:text-[hsl(var(--muted-foreground))]"
                >
                  Show less
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
