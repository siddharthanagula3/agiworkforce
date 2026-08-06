'use client';

import { useState, useMemo, useCallback } from 'react';
import { shortcutLabel } from '@agiworkforce/ui';
import {
  MessageSquare,
  SquarePen,
  Search,
  FolderOpen,
  Box,
  Sliders,
  GitBranch,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Settings,
  CalendarClock,
  TerminalSquare,
  Download,
  Blocks,
} from 'lucide-react';
import { useBillingStore } from '@shared/stores/web-auth-store';
import type { ChatHostConversation } from '@agiworkforce/unified-chat';
import type { V3Mode } from './WebShellV3';

// ─── recents grouping ────────────────────────────────────────────────────────

type RecentsGroup = {
  label: string;
  items: SidebarConversation[];
};

type SidebarConversation = {
  id: string;
  title: string;
  updatedAt: Date;
};

function toDate(value: string | Date | undefined): Date {
  if (value instanceof Date) return value;
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeConversations(conversations: ChatHostConversation[]): SidebarConversation[] {
  return conversations
    .filter((conversation) => !conversation.archived)
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: toDate(conversation.updatedAt ?? conversation.createdAt),
    }));
}

function groupConversations(convos: SidebarConversation[]): RecentsGroup[] {
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
  if (mode === 'work') {
    return [
      { id: 'cw-projects', label: 'Projects', icon: FolderOpen },
      { id: 'cw-artifacts', label: 'Live artifacts', icon: Box },
      { id: 'cw-dispatch', label: 'Dispatch', icon: GitBranch, beta: true },
      { id: 'schedules', label: 'Schedules', icon: CalendarClock },
      { id: 'customize', label: 'Customize', icon: Sliders },
    ];
  }
  if (mode === 'code') {
    return [
      { id: 'code-desktop', label: 'Desktop app', icon: Download },
      { id: 'code-vscode', label: 'VS Code extension', icon: Blocks },
    ];
  }
  // chat (the only other surfaced mode)
  return [
    { id: 'projects', label: 'Projects', icon: FolderOpen },
    { id: 'artifacts', label: 'Artifacts', icon: Box },
    { id: 'customize', label: 'Customize', icon: Sliders },
  ];
}

// ─── collapsed rail items ─────────────────────────────────────────────────────

const RAIL_ITEMS: { id: string; icon: React.ElementType; title: string }[] = [
  { id: 'projects', icon: FolderOpen, title: 'Projects' },
  { id: 'artifacts', icon: Box, title: 'Artifacts' },
  { id: 'schedules', icon: CalendarClock, title: 'Schedules' },
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

export interface WebSidebarProps {
  mode: V3Mode;
  onModeChange: (mode: V3Mode) => void;
  onNewChat?: () => void;
  onOpenSearch?: () => void;
  onNavigateView?: (view: string) => void;
  onJumpConversation?: (id: string) => void;
  onOpenAccountMenu?: () => void;
  conversations?: ChatHostConversation[];
}

export function WebSidebar({
  mode,
  onModeChange,
  onNewChat,
  onOpenSearch,
  onNavigateView,
  onJumpConversation,
  onOpenAccountMenu,
  conversations: hostConversations = [],
}: WebSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Platform-correct shortcut label. This was a hardcoded "Ctrl+K", which told
  // every Mac visitor to press a key their keyboard does not have — while the
  // desktop sidebar hardcoded "⌘K" and was wrong for Windows and Linux. The
  // handler already accepts either modifier; only the label was wrong.
  const searchShortcut = useMemo(() => shortcutLabel('K'), []);

  const user = useBillingStore((s) => s.user);
  // PER-3/PER-8: `user` is finally populated (refreshUser writes it now) and
  // carries the server-resolved name, so the sidebar no longer reads a
  // `user_metadata.full_name` key that /api/me never emitted and therefore no
  // longer falls back to 'Account' for every signed-in user.
  const sidebarDisplayName = user?.profile?.display_name ?? user?.name ?? undefined;
  const subscription = useBillingStore((s) => s.subscription);
  const planDisplayName = subscription?.display_name ?? 'Free';
  const conversations = useMemo(
    () => normalizeConversations(hostConversations),
    [hostConversations],
  );

  const groups = useMemo(() => groupConversations(conversations), [conversations]);
  const displayGroups = useMemo(() => {
    if (showAll) return groups;
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
        'cw-projects': 'work-projects',
        'cw-artifacts': 'work-artifacts',
        'cw-dispatch': 'work-dispatch',
        schedules: 'schedules',
        settings: 'voice-settings',
        'code-desktop': 'code-desktop',
        'code-vscode': 'code-vscode',
      };
      const view = viewMap[id];
      if (view) onNavigateView?.(view);
    },
    [onNavigateView],
  );

  const newLabel = mode === 'code' ? 'New Code session' : 'New chat';

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
      {/* Header */}
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
              { id: 'code' as V3Mode, label: 'Code', icon: TerminalSquare },
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
          className="transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: collapsed ? '7px 0' : '7px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 8,
            // Ghost row, matching the desktop sidebar: transparent, borderless,
            // hover-fill. Both shells put "New chat" in the same slot, but web
            // drew a boxed elevated control with a Plus while desktop drew a
            // borderless row with a SquarePen — the same primary action reading
            // as two different controls between surfaces. Desktop is the
            // reference-correct one; its own comment says so.
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
      {mode !== 'code' && (
        <div style={{ padding: '2px 8px 4px', flexShrink: 0 }}>
          <button
            onClick={onOpenSearch}
            title={`Search (${searchShortcut})`}
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
                  {searchShortcut}
                </span>
              </>
            )}
          </button>
        </div>
      )}

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
      {!collapsed && mode !== 'code' && (
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
          title="Account settings"
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
            {initials(sidebarDisplayName, user?.email)}
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
                  {sidebarDisplayName ?? user?.email ?? 'Account'}
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
