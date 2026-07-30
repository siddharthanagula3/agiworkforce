import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  SquarePen,
  Search,
  FolderOpen,
  FolderPlus,
  Box,
  CalendarClock,
  Library,
  ListChecks,
  RefreshCw,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Settings,
  Archive,
  ArrowLeft,
} from 'lucide-react';
import { useChatStore, useSidecarStore, selectSidebarCollapsed } from '../../stores/chat';
import type { ChatState, ConversationSummary } from '../../stores/chat';
import { useProjectStore, type Project } from '../../stores/projectStore';
import { ConversationRow } from './ConversationRow';
import { ProjectRow } from './ProjectRow';
import { LocalCloudToggle } from './LocalCloudToggle';
import {
  useUnifiedAuthStore,
  selectUser,
  selectPlanDisplayName,
  selectHasCloudAccountSession,
} from '../../stores/auth';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import type { V3Mode } from './DesktopShellV3';
import { UpdatePill } from '../updates';
import { AccountMenu } from './AccountMenu';
import { AgiMark } from '@agiworkforce/ui';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';

// ─── recents grouping ────────────────────────────────────────────────────────

type RecentsGroup = {
  label: string;
  items: ConversationSummary[];
  /** Pinned group: always shown in full, never subject to the 30-item cap. */
  noCap?: boolean;
};

function conversationUpdatedAtMs(conversation: ConversationSummary): number {
  const value = conversation.updatedAt as unknown;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
  return 0;
}

function groupConversations(
  convos: ConversationSummary[],
  t: TFunction,
  archived: boolean,
): RecentsGroup[] {
  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  const sorted = [...convos]
    .filter((c) => (archived ? c.archived === true : c.archived !== true))
    .sort((a, b) => conversationUpdatedAtMs(b) - conversationUpdatedAtMs(a));

  // Pinned conversations float to a dedicated top group (ChatGPT-style),
  // independent of recency; the display layer applies the collapsed 30-row cap.
  const pinned = sorted.filter((c) => c.pinned);
  const rest = sorted.filter((c) => !c.pinned);

  const timeGroups: RecentsGroup[] = [
    { label: t('sidebar.groups.lastHour'), items: [] },
    { label: t('sidebar.groups.today'), items: [] },
    { label: t('sidebar.groups.yesterday'), items: [] },
    { label: t('sidebar.groups.pastWeek'), items: [] },
    { label: t('sidebar.groups.pastMonth'), items: [] },
  ];

  for (const c of rest) {
    const age = now - conversationUpdatedAtMs(c);
    if (age < HOUR) timeGroups[0]!.items.push(c);
    else if (age < DAY) timeGroups[1]!.items.push(c);
    else if (age < 2 * DAY) timeGroups[2]!.items.push(c);
    else if (age < 7 * DAY) timeGroups[3]!.items.push(c);
    else timeGroups[4]!.items.push(c);
  }

  const result: RecentsGroup[] = [];
  if (pinned.length > 0) {
    result.push({ label: t('sidebar.pinned'), items: pinned, noCap: true });
  }
  result.push(...timeGroups.filter((g) => g.items.length > 0));
  return result;
}

// ─── per-mode nav config ──────────────────────────────────────────────────────

type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  beta?: boolean;
};

function navItemsForMode(
  mode: V3Mode,
  privacyMode: 'local' | 'byok' | 'managed',
  t: TFunction,
): NavItem[] {
  void mode;
  // Cloud mode had no nav destinations at all. Library is a Managed Cloud
  // surface — the files live in cloud storage — so it belongs here and only
  // here: local sessions keep their files on the device and are not cataloged.
  if (privacyMode === 'managed') {
    return [
      { id: 'library', label: t('sidebar.nav.library'), icon: Library },
      { id: 'tasks', label: t('sidebar.nav.tasks'), icon: ListChecks },
      { id: 'scheduled', label: t('sidebar.nav.scheduled'), icon: CalendarClock },
      { id: 'customize', label: t('sidebar.nav.customize'), icon: Settings },
    ];
  }
  // Projects moved to its own ChatGPT-style folder section below; the rest
  // stay as flat nav entries.
  return [
    { id: 'artifacts', label: t('sidebar.nav.artifacts'), icon: Box },
    { id: 'tasks', label: t('sidebar.nav.tasks'), icon: ListChecks },
    { id: 'scheduled', label: t('sidebar.nav.scheduled'), icon: RefreshCw },
    { id: 'customize', label: t('sidebar.nav.customize'), icon: Settings },
  ];
}

// Folder-icon accent for a project: explicit color override, else a stable
// cycle through the design-token palette (mirrors AgiWorkProjects).
const PROJECT_ACCENTS = [
  'var(--chat-accent-secondary)',
  'var(--chat-accent-primary)',
  'var(--chat-info)',
  'var(--chat-success)',
  'var(--chat-warning)',
  'var(--chat-destructive)',
];

function projectAccent(project: Project, index: number): string {
  return (
    project.color ?? PROJECT_ACCENTS[index % PROJECT_ACCENTS.length] ?? 'var(--chat-text-muted)'
  );
}

// ─── collapsed rail items ─────────────────────────────────────────────────────

function railItems(
  privacyMode: 'local' | 'byok' | 'managed',
  t: TFunction,
): { id: string; icon: React.ElementType; title: string }[] {
  const items = [{ id: 'projects', icon: FolderOpen, title: t('sidebar.nav.projects') }];
  if (privacyMode === 'managed') {
    items.push({ id: 'library', icon: Library, title: t('sidebar.nav.library') });
    items.push({ id: 'tasks', icon: ListChecks, title: t('sidebar.nav.tasks') });
    items.push({ id: 'scheduled', icon: CalendarClock, title: t('sidebar.nav.scheduled') });
  } else {
    items.push({ id: 'artifacts', icon: Box, title: t('sidebar.nav.artifacts') });
    items.push({ id: 'tasks', icon: ListChecks, title: t('sidebar.nav.tasks') });
  }
  items.push({ id: 'customize', icon: Settings, title: t('sidebar.nav.customize') });
  return items;
}

// ─── avatar initials helper ───────────────────────────────────────────────────

function initials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  }
  if (email) return email[0]?.toUpperCase() ?? '?';
  return '?';
}

// ─── component ───────────────────────────────────────────────────────────────

export interface SidebarProps {
  mode: V3Mode;
  /** Start a new chat; pass a projectId to scope the new chat to a project. */
  onNewChat?: (projectId?: string) => void;
  onOpenSearch?: () => void;
  onCreateProject?: () => void;
  onNavigateView?: (view: string) => void;
  onJumpConversation?: (id: string) => void;
  onOpenAccountMenu?: () => void;
  accountMenuOpen?: boolean;
}

export function Sidebar({
  mode,
  onNewChat,
  onOpenSearch,
  onCreateProject,
  onNavigateView,
  onJumpConversation,
  onOpenAccountMenu,
  accountMenuOpen = false,
}: SidebarProps) {
  const { t } = useTranslation('v3');
  // Persisted via useUIStore (localStorage key `agiworkforce-ui`) — the same
  // store the legacy chat sidebar already uses for this, so the collapse
  // state now survives a reload/restart instead of resetting to expanded.
  const collapsed = useSidecarStore(selectSidebarCollapsed);
  const setCollapsed = useSidecarStore((s) => s.setSidebarCollapsed);
  const [showAll, setShowAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const conversations = useChatStore((s: ChatState) => s.conversations);
  const activeConversationId = useChatStore((s: ChatState) => s.activeConversationId);
  const renameConversation = useChatStore((s: ChatState) => s.renameConversation);
  const deleteConversation = useChatStore((s: ChatState) => s.deleteConversation);
  const togglePinnedConversation = useChatStore((s: ChatState) => s.togglePinnedConversation);
  const archiveConversation = useChatStore((s: ChatState) => s.archiveConversation);
  const restoreConversation = useChatStore((s: ChatState) => s.restoreConversation);
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const archiveProject = useProjectStore((s) => s.archiveProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const moveConversationToProject = useProjectStore((s) => s.moveConversationToProject);
  const user = useUnifiedAuthStore(selectUser);
  const planDisplayName = useUnifiedAuthStore(selectPlanDisplayName);
  const hasCloudAccountSession = useUnifiedAuthStore(selectHasCloudAccountSession);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const isSignedIn = hasCloudAccountSession;
  const showAccountMenu = accountMenuOpen && isSignedIn;
  const privacyMode = useAppModeStore(selectPrivacyMode);

  const archivedCount = useMemo(
    () => conversations.filter((conversation) => conversation.archived === true).length,
    [conversations],
  );
  const groups = useMemo(
    () => groupConversations(conversations, t, showArchived),
    [conversations, showArchived, t],
  );
  const displayGroups = useMemo(() => {
    if (showAll) return groups;
    // Keep pinned rows visible, then cap the collapsed recency list at 30.
    let seen = 0;
    return groups
      .map((g) => {
        if (g.noCap) return g;
        const available = Math.max(0, 30 - seen);
        const items = g.items.slice(0, available);
        seen += items.length;
        return { ...g, items };
      })
      .filter((g) => g.items.length > 0);
  }, [groups, showAll]);

  const totalItems = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const navItems = useMemo(() => navItemsForMode(mode, privacyMode, t), [mode, privacyMode, t]);
  const RAIL_ITEMS = useMemo(() => railItems(privacyMode, t), [privacyMode, t]);

  const handleNavClick = useCallback(
    (id: string) => {
      const viewMap: Record<string, string> = {
        projects: 'projects',
        artifacts: 'artifacts',
        library: 'library',
        tasks: 'tasks',
        scheduled: 'work-scheduled',
        customize: 'settings',
      };
      const view = viewMap[id];
      if (view) onNavigateView?.(view);
    },
    [onNavigateView],
  );

  const visibleProjects = useMemo(
    () => projects.filter((p) => !p.isArchived).slice(0, 6),
    [projects],
  );
  const moveTargetProjects = useMemo(
    () => projects.filter((project) => !project.isArchived),
    [projects],
  );

  const handleCreateProject = useCallback(() => {
    onCreateProject?.();
  }, [onCreateProject]);

  const handleOpenProject = useCallback(
    (id: string) => {
      setActiveProject(id);
      onNavigateView?.('projects');
    },
    [setActiveProject, onNavigateView],
  );

  const handleProjectNewChat = useCallback(
    (id: string) => {
      setActiveProject(id);
      onNewChat?.(id);
    },
    [setActiveProject, onNewChat],
  );

  const handleRenameProject = useCallback(
    (id: string, name: string) => {
      void updateProject(id, { name }).catch((error) => {
        toast.error(error instanceof Error ? error.message : String(error));
      });
    },
    [updateProject],
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      void deleteProject(id).catch((error) => {
        toast.error(error instanceof Error ? error.message : String(error));
      });
    },
    [deleteProject],
  );

  const handleArchiveProject = useCallback(
    (id: string) => {
      void archiveProject(id).catch((error) => {
        toast.error(error instanceof Error ? error.message : String(error));
      });
    },
    [archiveProject],
  );

  const handleFooterPrimaryClick = useCallback(() => {
    if (isSignedIn) {
      onOpenAccountMenu?.();
      return;
    }
    openSettings('account');
  }, [isSignedIn, onOpenAccountMenu, openSettings]);

  const handleMoveConversation = useCallback(
    (conversationId: string, projectId: string | null) => {
      void moveConversationToProject(conversationId, projectId)
        .then(() => {
          const projectName = projectId
            ? projects.find((project) => project.id === projectId)?.name
            : null;
          toast.success(projectName ? `Moved to ${projectName}` : 'Removed from project');
        })
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
    },
    [moveConversationToProject, projects],
  );

  const newLabel = t('sidebar.newChat');

  return (
    <aside
      data-v3-sidebar=""
      data-collapsed={collapsed}
      data-mode={mode}
      aria-label={t('sidebar.modes.chat')}
      style={{
        width: collapsed ? 64 : 240,
        minWidth: collapsed ? 64 : 240,
        background: 'var(--chat-sidebar-bg)',
        borderRight: '1px solid var(--chat-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: 'width 180ms ease, min-width 180ms ease',
        overflow: 'hidden',
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '12px 12px 8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--chat-text-primary)',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.5px',
            flex: collapsed ? undefined : 1,
          }}
        >
          {/* Brand glyph anchors the rail (Claude-style), shown collapsed and expanded. */}
          <AgiMark size={20} />
          {!collapsed && 'AGI'}
        </span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--chat-text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            padding: 4,
          }}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* New chat button */}
      <div style={{ padding: '4px 8px', flexShrink: 0 }}>
        <button
          onClick={() => onNewChat?.()}
          title={newLabel}
          className="transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: collapsed ? '7px 0' : '7px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 8,
            // Claude-style ghost row: transparent, borderless, hover-fill — not a boxed
            // elevated form control.
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--chat-text-primary)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <SquarePen size={14} />
          {!collapsed && <span>{newLabel}</span>}
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '2px 8px 4px', flexShrink: 0 }}>
        <button
          onClick={onOpenSearch}
          title={t('sidebar.searchKbd')}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: collapsed ? '6px 0' : '6px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--chat-text-secondary)',
            fontSize: 13,
          }}
        >
          <Search size={14} />
          {!collapsed && (
            <>
              <span style={{ flex: 1, textAlign: 'left' }}>{t('common.search')}</span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--chat-text-muted)',
                  background: 'var(--chat-border)',
                  borderRadius: 4,
                  padding: '1px 5px',
                }}
              >
                ⌘K
              </span>
            </>
          )}
        </button>
      </div>

      {/* Per-mode nav (expanded only) */}
      {!collapsed && (
        <div style={{ padding: '0 8px', flexShrink: 0 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--chat-text-secondary)',
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                <Icon size={14} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.beta && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      color: 'var(--chat-accent-secondary)',
                      border: '1px solid var(--chat-accent-secondary)',
                      borderRadius: 3,
                      padding: '1px 4px',
                    }}
                  >
                    {t('common.beta')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Projects — ChatGPT-style folder section (expanded only) */}
      {!collapsed && (
        <div style={{ padding: '4px 8px 0', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2px 10px',
            }}
          >
            <button
              type="button"
              onClick={() => onNavigateView?.('projects')}
              style={{
                flex: 1,
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: 'var(--chat-text-muted)',
                padding: 0,
              }}
            >
              {t('sidebar.nav.projects')}
            </button>
            <button
              type="button"
              onClick={handleCreateProject}
              title={t('sidebar.projects.newProject')}
              aria-label={t('sidebar.projects.newProject')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 5,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--chat-text-muted)',
              }}
            >
              <FolderPlus size={14} />
            </button>
          </div>
          {visibleProjects.map((p, i) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={p.id === activeProjectId}
              accentColor={projectAccent(p, i)}
              onOpen={handleOpenProject}
              onNewChat={handleProjectNewChat}
              onRename={handleRenameProject}
              onDelete={handleDeleteProject}
              onArchive={handleArchiveProject}
            />
          ))}
        </div>
      )}

      {/* Recents (expanded only). The account menu no longer replaces this — it floats
          above the footer avatar (Claude/web behavior), so the list stays put. */}
      {!collapsed && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 8px 0',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '0 6px 0 10px',
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: 'var(--chat-text-muted)',
              }}
            >
              {showArchived ? t('sidebar.archived') : t('sidebar.recents')}
            </span>
            <button
              type="button"
              aria-pressed={showArchived}
              aria-label={
                showArchived
                  ? t('sidebar.showActive')
                  : t('sidebar.showArchived', { count: archivedCount })
              }
              title={
                showArchived
                  ? t('sidebar.showActive')
                  : t('sidebar.showArchived', { count: archivedCount })
              }
              onClick={() => {
                setShowArchived((current) => !current);
                setShowAll(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 24,
                padding: '3px 6px',
                border: 'none',
                borderRadius: 5,
                background: showArchived ? 'var(--chat-surface-hover)' : 'transparent',
                color: showArchived ? 'var(--chat-text-primary)' : 'var(--chat-text-muted)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {showArchived ? <ArrowLeft size={13} /> : <Archive size={13} />}
              {!showArchived && <span>{archivedCount}</span>}
            </button>
          </div>
          {displayGroups.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--chat-text-muted)',
                  padding: '6px 10px 2px',
                  letterSpacing: '0.04em',
                }}
              >
                {group.label}
              </div>
              {group.items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeConversationId}
                  onSelect={(id) => onJumpConversation?.(id)}
                  onRename={renameConversation}
                  onDelete={deleteConversation}
                  onTogglePin={togglePinnedConversation}
                  onArchive={archiveConversation}
                  onRestore={restoreConversation}
                  projects={moveTargetProjects.map((project) => ({
                    id: project.id,
                    name: project.name,
                  }))}
                  onMoveToProject={handleMoveConversation}
                />
              ))}
            </div>
          ))}
          {totalItems === 0 && (
            <div
              role="status"
              style={{
                padding: '28px 12px',
                color: 'var(--chat-text-muted)',
                fontSize: 12,
                lineHeight: 1.5,
                textAlign: 'center',
              }}
            >
              {showArchived ? t('sidebar.noArchived') : t('sidebar.noConversations')}
            </div>
          )}
          {totalItems > 30 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--chat-accent-secondary)',
                fontSize: 12,
                textAlign: 'left',
              }}
            >
              {t('common.showAll')}
            </button>
          )}
        </div>
      )}

      {/* Collapsed icon rail */}
      {collapsed && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '8px 0',
            flex: 1,
          }}
        >
          {RAIL_ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                title={it.title}
                onClick={() => handleNavClick(it.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 36,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--chat-text-secondary)',
                }}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}

      {/* Update pill — shown above avatar when update is available */}
      <div
        style={{
          flexShrink: 0,
          padding: '0 8px 4px',
        }}
      >
        <UpdatePill collapsed={collapsed} />
      </div>

      {/* Local ↔ Cloud mode toggle — the primary mode nav, sits just above Settings */}
      <div style={{ flexShrink: 0, padding: '4px 8px 6px' }}>
        <LocalCloudToggle collapsed={collapsed} />
      </div>

      {/* Footer: avatar + tier badge */}
      <div
        style={{
          position: 'relative',
          flexShrink: 0,
          borderTop: '1px solid var(--chat-border)',
          padding: '8px',
        }}
      >
        {/* Account menu floats above the avatar (Claude/web behavior) instead of
            replacing the sidebar body. A full-window backdrop closes it on outside click. */}
        {!collapsed && showAccountMenu && (
          <>
            <div
              onClick={() => onOpenAccountMenu?.()}
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              aria-hidden="true"
            />
            <div
              role="menu"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 8,
                right: 8,
                zIndex: 41,
                background: 'var(--chat-surface-elevated)',
                border: '1px solid var(--chat-border)',
                borderRadius: 12,
                boxShadow: 'var(--chat-shadow-lg)',
                overflow: 'hidden',
                maxHeight: 420,
                overflowY: 'auto',
              }}
            >
              <AccountMenu onClose={() => onOpenAccountMenu?.()} showHeader={false} />
            </div>
          </>
        )}
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            onClick={handleFooterPrimaryClick}
            data-open={showAccountMenu}
            aria-label={
              collapsed
                ? isSignedIn
                  ? (user?.name ?? user?.email ?? t('accountMenu.accountFallback'))
                  : t('sidebar.signIn')
                : undefined
            }
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            style={{
              flex: collapsed ? '0 0 auto' : 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: collapsed ? '6px 0' : '6px 8px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isSignedIn
                  ? 'var(--chat-accent-primary)'
                  : 'var(--chat-surface-elevated)',
                border: isSignedIn ? 'none' : '1px solid var(--chat-border)',
                color: isSignedIn
                  ? 'var(--chat-accent-primary-contrast)'
                  : 'var(--chat-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {isSignedIn ? initials(user?.name, user?.email) : <LogIn size={14} />}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--chat-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {isSignedIn ? (user?.name ?? user?.email) : t('sidebar.signIn')}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--chat-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  {isSignedIn ? planDisplayName : t('sidebar.cloudSync')}
                  {isSignedIn && <ChevronDown size={9} />}
                </div>
              </div>
            )}
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={() => openSettings('general')}
              title={t('common.settings')}
              aria-label={t('common.settings')}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--chat-text-muted)',
                flexShrink: 0,
              }}
            >
              <Settings size={15} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
