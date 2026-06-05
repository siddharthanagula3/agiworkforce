import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ChatInterface,
  type ChatHostBridge,
  type ChatInterfaceProps,
} from '@agiworkforce/unified-chat';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { EmptyChat } from './EmptyChat';
import { CapModal } from './CapModal';
import { Sidebar } from './Sidebar';
import { AccountMenu } from './AccountMenu';
import { ProjectsView } from '../chat/ProjectsView';

// ─── mode type (shared with Sidebar) ─────────────────────────────────────────

export type V3Mode = 'chat';

// ─── local hook ───────────────────────────────────────────────────────────────

function useV3Mode() {
  const [mode] = useState<V3Mode>('chat');
  return { mode };
}

// ─── shell props ───────────────────────────────────────────────────────────────

export interface DesktopShellV3Props {
  runtime: ChatRuntime | null;
  className?: string;
  hostBridge?: ChatHostBridge | null;
  authSlot?: ReactNode;
  openAuthSignal?: number;
  onModelSelectorClick?: () => void;
  onVoiceClick?: () => void;
  onNavigateView?: ChatInterfaceProps['onNavigateView'];
  onBuyTopUp?: () => void;
}

/**
 * v3 desktop shell.
 *
 * Layout: Sidebar (240/64px collapsible) left + main view area right.
 * Chat and cowork live in one shell. The old separate Code/Cowork mode tabs
 * are intentionally not exposed in the active v1 desktop surface.
 *
 * emptyStateSlot, CapModal, and all ChatInterface props from the legacy
 * mount point in App.tsx are preserved unchanged.
 */
export function DesktopShellV3({
  runtime,
  className,
  hostBridge,
  authSlot,
  openAuthSignal = 0,
  onModelSelectorClick,
  onVoiceClick,
  onNavigateView,
  onBuyTopUp,
}: DesktopShellV3Props) {
  const { mode } = useV3Mode();
  const [activeView, setActiveView] = useState<'chat' | 'projects' | 'auth'>('chat');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    if (openAuthSignal > 0) {
      setActiveView('auth');
    }
  }, [openAuthSignal]);

  const handleSwitchModel = useCallback(() => {
    onModelSelectorClick?.();
  }, [onModelSelectorClick]);

  const handleNewChat = useCallback(() => {
    hostBridge?.createConversation?.('New Chat');
    setActiveView('chat');
    onNavigateView?.('chat');
  }, [hostBridge, onNavigateView]);

  const handleNavigateView = useCallback(
    (view: string) => {
      if (view === 'projects') {
        setActiveView('projects');
        return;
      }
      if (
        view === 'customize' ||
        view === 'skills' ||
        view === 'connectors' ||
        view === 'plugins'
      ) {
        onNavigateView?.(view as Parameters<NonNullable<typeof onNavigateView>>[0]);
        return;
      }
      if (view === 'chat') {
        setActiveView('chat');
        return;
      }
      if (view === 'auth') {
        setActiveView('auth');
        return;
      }

      onNavigateView?.(view as Parameters<NonNullable<typeof onNavigateView>>[0]);
    },
    [onNavigateView],
  );

  const shellThemeVars = {
    '--bg': 'var(--chat-bg)',
    '--bg-soft': 'var(--chat-surface-hover)',
    '--bg-elev': 'var(--chat-surface-elevated)',
    '--chat-bg-soft': 'var(--chat-surface-hover)',
    '--chat-bg-elev': 'var(--chat-surface-elevated)',
    '--text-1': 'var(--chat-text-primary)',
    '--text-2': 'var(--chat-text-secondary)',
    '--text-3': 'var(--chat-text-muted)',
    '--chat-text-tertiary': 'var(--chat-text-muted)',
    '--border': 'var(--chat-border)',
    '--mono': 'var(--font-mono)',
    '--teal': 'var(--chat-accent-secondary)',
  } as CSSProperties;

  return (
    <div
      className={className}
      data-v3-shell=""
      style={{
        ...shellThemeVars,
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--chat-bg)',
        color: 'var(--chat-text-primary)',
      }}
    >
      <Sidebar
        mode={mode}
        onNewChat={handleNewChat}
        onOpenSearch={() => {
          setActiveView('chat');
          // Trigger ⌘K via keyboard event so ChatInterface's shortcut handler picks it up
          window.requestAnimationFrame(() =>
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
            ),
          );
        }}
        onNavigateView={handleNavigateView}
        onOpenAccountMenu={() => setAccountMenuOpen((o) => !o)}
        accountMenuOpen={accountMenuOpen}
      />
      {accountMenuOpen && <AccountMenu onClose={() => setAccountMenuOpen(false)} />}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--chat-bg)',
          color: 'var(--chat-text-primary)',
        }}
      >
        {activeView === 'projects' ? (
          <ProjectsView />
        ) : activeView === 'auth' && authSlot ? (
          authSlot
        ) : (
          <ChatInterface
            runtime={runtime}
            className="h-full w-full"
            manageTheme={false}
            enableShortcuts={true}
            hostBridge={hostBridge}
            onModelSelectorClick={onModelSelectorClick}
            allowModelFallbackModels={false}
            onVoiceClick={onVoiceClick}
            onNavigateView={onNavigateView}
            emptyStateSlot={<EmptyChat />}
            sidebarSlot={null}
            showProvenanceFooter={true}
          />
        )}
        <CapModal onSwitchModel={handleSwitchModel} onBuyTopUp={onBuyTopUp} />
      </div>
    </div>
  );
}
