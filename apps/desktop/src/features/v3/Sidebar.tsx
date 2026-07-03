import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  SquarePen,
  Search,
  FolderOpen,
  FolderPlus,
  Box,
  RefreshCw,
  GitBranch,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Settings,
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

function groupConversations(convos: ConversationSummary[], t: TFunction): RecentsGroup[] {
  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  const sorted = [...convos]
    .filter((c) => c.archived !== true)
    .sort((a, b) => conversationUpdatedAtMs(b) - conversationUpdatedAtMs(a));

  // Pinned conversations float to a dedicated top group (ChatGPT-style),
  // independent of recency; the rest fall into time buckets capped at 30.
  const pinned = sorted.filter((c) => c.pinned);
  const rest = sorted.filter((c) => !c.pinned).slice(0, 30);

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

function navItemsForMode(mode: V3Mode, t: TFunction): NavItem[] {
  void mode;
  // Projects moved to its own ChatGPT-style folder section below; the rest
  // stay as flat nav entries.
  return [
    { id: 'artifacts', label: t('sidebar.nav.artifacts'), icon: Box },
    { id: 'scheduled', label: t('sidebar.nav.scheduled'), icon: RefreshCw },
    { id: 'dispatch', label: t('sidebar.nav.dispatch'), icon: GitBranch, beta: true },
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

function railItems(t: TFunction): { id: string; icon: React.ElementType; title: string }[] {
  return [
    { id: 'projects', icon: FolderOpen, title: t('sidebar.nav.projects') },
    { id: 'artifacts', icon: Box, title: t('sidebar.nav.artifacts') },
  ];
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
  onNavigateView?: (view: string) => void;
  onJumpConversation?: (id: string) => void;
  onOpenAccountMenu?: () => void;
  accountMenuOpen?: boolean;
}

export function Sidebar({
  mode,
  onNewChat,
  onOpenSearch,
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

  const conversations = useChatStore((s: ChatState) => s.conversations);
  const activeConversationId = useChatStore((s: ChatState) => s.activeConversationId);
  const renameConversation = useChatStore((s: ChatState) => s.renameConversation);
  const deleteConversation = useChatStore((s: ChatState) => s.deleteConversation);
  const togglePinnedConversation = useChatStore((s: ChatState) => s.togglePinnedConversation);
  const archiveConversation = useChatStore((s: ChatState) => s.archiveConversation);
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const archiveProject = useProjectStore((s) => s.archiveProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const user = useUnifiedAuthStore(selectUser);
  const planDisplayName = useUnifiedAuthStore(selectPlanDisplayName);
  const hasCloudAccountSession = useUnifiedAuthStore(selectHasCloudAccountSession);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);
  const isSignedIn = hasCloudAccountSession;
  const showAccountMenu = accountMenuOpen && isSignedIn;

  const groups = useMemo(() => groupConversations(conversations, t), [conversations, t]);
  const displayGroups = useMemo(() => {
    if (showAll) return groups;
    // max 30 items enforced in groupConversations; just cap visible groups if not showAll
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

  const navItems = useMemo(() => navItemsForMode(mode, t), [mode, t]);
  const RAIL_ITEMS = useMemo(() => railItems(t), [t]);

  const handleNavClick = useCallback(
    (id: string) => {
      const viewMap: Record<string, string> = {
        projects: 'projects',
        artifacts: 'artifacts',
        scheduled: 'work-scheduled',
        dispatch: 'work-dispatch',
      };
      const view = viewMap[id];
      if (view) onNavigateView?.(view);
    },
    [onNavigateView],
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const visibleProjects = useMemo(
    () => projects.filter((p) => !p.isArchived).slice(0, 6),
    [projects],
  );

  const handleCreateProject = useCallback(() => {
    void createProject({
      name: t('agiWork.projects.untitled'),
      description: '',
      customInstructions: '',
      files: [],
      conversationIds: [],
      isArchived: false,
    }).catch(() => {
      /* errors are surfaced by the projects panel */
    });
  }, [createProject, t]);

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
      void updateProject(id, { name });
    },
    [updateProject],
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      void deleteProject(id);
    },
    [deleteProject],
  );

  const handleArchiveProject = useCallback(
    (id: string) => {
      void archiveProject(id);
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
            color: 'var(--chat-text-primary)',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.5px',
            flex: collapsed ? undefined : 1,
          }}
        >
          {!collapsed && 'AGI'}
        </span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
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
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: collapsed ? '7px 0' : '7px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 8,
            border: '1px solid var(--chat-border)',
            background: 'var(--chat-surface-elevated)',
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
      {!collapsed && !showAccountMenu && (
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

      {/* Account menu replaces recents while open, so it never overlays footer content. */}
      {!collapsed && showAccountMenu && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            minHeight: 0,
          }}
        >
          <AccountMenu onClose={() => onOpenAccountMenu?.()} showHeader={false} />
        </div>
      )}

      {/* Recents (expanded only) */}
      {!collapsed && !showAccountMenu && (
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
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.05em',
              color: 'var(--chat-text-muted)',
              padding: '0 10px',
              marginBottom: 4,
            }}
          >
            {t('sidebar.recents')}
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
                />
              ))}
            </div>
          ))}
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
          flexShrink: 0,
          borderTop: '1px solid var(--chat-border)',
          padding: '8px',
        }}
      >
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
                color: isSignedIn ? '#fff' : 'var(--chat-text-secondary)',
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
