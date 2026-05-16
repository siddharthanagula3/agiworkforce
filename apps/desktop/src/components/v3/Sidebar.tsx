import { useState, useMemo, useCallback } from 'react';
import {
  MessageSquare,
  Zap,
  Code2,
  Plus,
  Search,
  FolderOpen,
  Box,
  Sliders,
  RefreshCw,
  GitBranch,
  Repeat,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import type { ChatState, ConversationSummary } from '../../stores/chat';
import { useUnifiedAuthStore, selectUser, selectPlanDisplayName } from '../../stores/auth';
import type { V3Mode } from './DesktopShellV3';

// ─── recents grouping ────────────────────────────────────────────────────────

type RecentsGroup = {
  label: string;
  items: ConversationSummary[];
};

function groupConversations(convos: ConversationSummary[]): RecentsGroup[] {
  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  const sorted = [...convos]
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, 30);

  const groups: RecentsGroup[] = [
    { label: 'Last hour', items: [] },
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Past week', items: [] },
    { label: 'Past month', items: [] },
  ];

  for (const c of sorted) {
    const age = now - (c.updatedAt?.getTime() ?? 0);
    if (age < HOUR) groups[0]!.items.push(c);
    else if (age < DAY) groups[1]!.items.push(c);
    else if (age < 2 * DAY) groups[2]!.items.push(c);
    else if (age < 7 * DAY) groups[3]!.items.push(c);
    else groups[4]!.items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

// ─── per-mode nav config ──────────────────────────────────────────────────────

type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  beta?: boolean;
};

function navItemsForMode(mode: V3Mode): NavItem[] {
  if (mode === 'chat') {
    return [
      { id: 'projects', label: 'Projects', icon: FolderOpen },
      { id: 'artifacts', label: 'Artifacts', icon: Box },
      { id: 'customize', label: 'Customize', icon: Sliders },
    ];
  }
  if (mode === 'cowork') {
    return [
      { id: 'cw-projects', label: 'Projects', icon: FolderOpen },
      { id: 'cw-scheduled', label: 'Scheduled', icon: RefreshCw },
      { id: 'cw-artifacts', label: 'Live artifacts', icon: Box },
      { id: 'cw-dispatch', label: 'Dispatch', icon: GitBranch, beta: true },
      { id: 'customize', label: 'Customize', icon: Sliders },
    ];
  }
  // code
  return [
    { id: 'routines', label: 'Routines', icon: Repeat },
    { id: 'customize', label: 'Customize', icon: Sliders },
  ];
}

// ─── collapsed rail items ─────────────────────────────────────────────────────

const RAIL_ITEMS: { id: string; icon: React.ElementType; title: string }[] = [
  { id: 'projects', icon: FolderOpen, title: 'Projects' },
  { id: 'artifacts', icon: Box, title: 'Artifacts' },
  { id: 'customize', icon: Sliders, title: 'Customize' },
  { id: 'settings', icon: Settings, title: 'Settings' },
];

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
  onModeChange: (mode: V3Mode) => void;
  onNewChat?: () => void;
  onOpenSearch?: () => void;
  onNavigateView?: (view: string) => void;
  onJumpConversation?: (id: string) => void;
  onOpenAccountMenu?: () => void;
  accountMenuOpen?: boolean;
}

export function Sidebar({
  mode,
  onModeChange,
  onNewChat,
  onOpenSearch,
  onNavigateView,
  onJumpConversation,
  onOpenAccountMenu,
  accountMenuOpen = false,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const conversations = useChatStore((s: ChatState) => s.conversations);
  const user = useUnifiedAuthStore(selectUser);
  const planDisplayName = useUnifiedAuthStore(selectPlanDisplayName);

  const groups = useMemo(() => groupConversations(conversations), [conversations]);
  const displayGroups = useMemo(() => {
    if (showAll) return groups;
    // max 30 items enforced in groupConversations; just cap visible groups if not showAll
    let seen = 0;
    return groups
      .map((g) => {
        const available = Math.max(0, 30 - seen);
        const items = g.items.slice(0, available);
        seen += items.length;
        return { ...g, items };
      })
      .filter((g) => g.items.length > 0);
  }, [groups, showAll]);

  const totalItems = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const navItems = useMemo(() => navItemsForMode(mode), [mode]);

  const handleNavClick = useCallback(
    (id: string) => {
      const viewMap: Record<string, string> = {
        projects: 'projects',
        artifacts: 'artifacts',
        customize: 'customize-home',
        'cw-projects': 'cowork-projects',
        'cw-scheduled': 'cowork-scheduled',
        'cw-artifacts': 'cowork-artifacts',
        'cw-dispatch': 'cowork-dispatch',
        routines: 'code',
        settings: 'voice-settings',
      };
      const view = viewMap[id];
      if (view) onNavigateView?.(view);
    },
    [onNavigateView],
  );

  const newLabel = mode === 'code' ? 'New session' : 'New chat';

  return (
    <aside
      data-v3-sidebar=""
      data-collapsed={collapsed}
      data-mode={mode}
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
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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

      {/* Mode switcher (expanded only) */}
      {!collapsed && (
        <div
          style={{
            display: 'flex',
            gap: 2,
            margin: '0 8px 4px',
            background: 'var(--chat-border)',
            borderRadius: 8,
            padding: 2,
          }}
        >
          {(
            [
              { id: 'chat' as V3Mode, label: 'Chat', icon: MessageSquare },
              { id: 'cowork' as V3Mode, label: 'Cowork', icon: Zap },
              { id: 'code' as V3Mode, label: 'Code', icon: Code2 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onModeChange(id)}
              data-active={mode === id}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '4px 6px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: mode === id ? 600 : 400,
                background: mode === id ? 'var(--chat-surface-elevated)' : 'transparent',
                color: mode === id ? 'var(--chat-text-primary)' : 'var(--chat-text-secondary)',
                transition: 'background 120ms, color 120ms',
              }}
            >
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* New chat button */}
      <div style={{ padding: '4px 8px', flexShrink: 0 }}>
        <button
          onClick={onNewChat}
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
          <Plus size={14} />
          {!collapsed && <span>{newLabel}</span>}
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '2px 8px 4px', flexShrink: 0 }}>
        <button
          onClick={onOpenSearch}
          title="Search (⌘K)"
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
              <span style={{ flex: 1, textAlign: 'left' }}>Search</span>
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
                    Beta
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Recents (expanded only) */}
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
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.05em',
              color: 'var(--chat-text-muted)',
              padding: '0 10px',
              marginBottom: 4,
            }}
          >
            Recents
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
                <button
                  key={c.id}
                  title={c.title}
                  onClick={() => onJumpConversation?.(c.id)}
                  style={{
                    width: '100%',
                    display: 'block',
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--chat-text-secondary)',
                    fontSize: 13,
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.title || 'Untitled'}
                </button>
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
              Show all
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

      {/* Footer: avatar + tier badge */}
      <div
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--chat-border)',
          padding: '8px',
        }}
      >
        <button
          onClick={onOpenAccountMenu}
          data-open={accountMenuOpen}
          style={{
            width: '100%',
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
              background: 'var(--chat-accent-primary)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials(user?.name, user?.email)}
          </div>
          {!collapsed && (
            <>
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
                  {user?.name ?? user?.email ?? 'Account'}
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
                  {planDisplayName}
                  <ChevronDown size={9} />
                </div>
              </div>
              <ChevronDown size={12} style={{ color: 'var(--chat-text-muted)', flexShrink: 0 }} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
