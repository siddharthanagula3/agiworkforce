import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Plus,
  Search,
  FolderOpen,
  Box,
  RefreshCw,
  GitBranch,
  LogIn,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import type { ChatState, ConversationSummary } from '../../stores/chat';
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
    .sort((a, b) => conversationUpdatedAtMs(b) - conversationUpdatedAtMs(a))
    .slice(0, 30);

  const groups: RecentsGroup[] = [
    { label: t('sidebar.groups.lastHour'), items: [] },
    { label: t('sidebar.groups.today'), items: [] },
    { label: t('sidebar.groups.yesterday'), items: [] },
    { label: t('sidebar.groups.pastWeek'), items: [] },
    { label: t('sidebar.groups.pastMonth'), items: [] },
  ];

  for (const c of sorted) {
    const age = now - conversationUpdatedAtMs(c);
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

function navItemsForMode(mode: V3Mode, t: TFunction): NavItem[] {
  void mode;
  return [
    { id: 'projects', label: t('sidebar.nav.projects'), icon: FolderOpen },
    { id: 'artifacts', label: t('sidebar.nav.artifacts'), icon: Box },
    { id: 'scheduled', label: t('sidebar.nav.scheduled'), icon: RefreshCw },
    { id: 'live-artifacts', label: t('sidebar.nav.liveArtifacts'), icon: Box },
    { id: 'dispatch', label: t('sidebar.nav.dispatch'), icon: GitBranch, beta: true },
  ];
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
  onNewChat?: () => void;
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
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const conversations = useChatStore((s: ChatState) => s.conversations);
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
        scheduled: 'cowork-scheduled',
        'live-artifacts': 'cowork-artifacts',
        dispatch: 'cowork-dispatch',
      };
      const view = viewMap[id];
      if (view) onNavigateView?.(view);
    },
    [onNavigateView],
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
          onClick={() => setCollapsed((c) => !c)}
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
                  {c.title || t('common.untitled')}
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
