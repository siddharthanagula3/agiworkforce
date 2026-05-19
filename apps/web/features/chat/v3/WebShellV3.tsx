'use client';

import { useCallback, useState, useEffect } from 'react';
import {
  ChatInterface,
  type ChatHostBridge,
  type ChatInterfaceProps,
} from '@agiworkforce/unified-chat';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { WebSidebar } from './WebSidebar';
import { WebEmptyChat } from './WebEmptyChat';
import { WebSearchModalCmdK } from './WebSearchModalCmdK';

// ─── mode type ───────────────────────────────────────────────────────────────

export type V3Mode = 'chat' | 'cowork' | 'code';

// ─── props ───────────────────────────────────────────────────────────────────

export interface WebShellV3Props {
  runtime: ChatRuntime | null;
  className?: string;
  hostBridge?: ChatHostBridge | null;
  onModelSelectorClick?: () => void;
  onVoiceClick?: () => void;
  onNavigateView?: ChatInterfaceProps['onNavigateView'];
}

/**
 * v3 web shell.
 *
 * Layout mirrors DesktopShellV3: WebSidebar (240/64px collapsible) left +
 * main view area right. Uses web-compatible store imports instead of Tauri.
 * SearchModalCmdK bound to Ctrl+K / Cmd+K globally.
 */
export function WebShellV3({
  runtime,
  className,
  hostBridge,
  onModelSelectorClick,
  onVoiceClick,
  onNavigateView,
}: WebShellV3Props) {
  const [mode, setMode] = useState<V3Mode>('chat');
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Global Ctrl+K / Cmd+K to open search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNewChat = useCallback(() => {
    // Trigger via host bridge if available; otherwise no-op (unified-chat manages it)
  }, []);

  const handleNavigateView = useCallback(
    (view: string) => {
      if (onNavigateView) {
        onNavigateView(view as Parameters<NonNullable<typeof onNavigateView>>[0]);
      }
    },
    [onNavigateView],
  );

  const handleJumpConversation = useCallback(
    (id: string) => {
      hostBridge?.selectConversation?.(id);
    },
    [hostBridge],
  );

  return (
    <div
      className={className}
      data-v3-shell=""
      style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}
    >
      <WebSidebar
        mode={mode}
        onModeChange={setMode}
        onNewChat={handleNewChat}
        onOpenSearch={() => setSearchOpen(true)}
        onNavigateView={handleNavigateView}
        onJumpConversation={handleJumpConversation}
        onOpenAccountMenu={() => setAccountMenuOpen((o) => !o)}
        accountMenuOpen={accountMenuOpen}
      />

      <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        {mode === 'chat' && (
          <ChatInterface
            runtime={runtime}
            className="h-full w-full"
            manageTheme={false}
            enableShortcuts={true}
            hostBridge={hostBridge}
            onModelSelectorClick={onModelSelectorClick}
            onVoiceClick={onVoiceClick}
            onNavigateView={onNavigateView}
            emptyStateSlot={<WebEmptyChat />}
            showProvenanceFooter={true}
          />
        )}

        {mode === 'cowork' && (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--chat-text-muted)',
              fontSize: 14,
            }}
          >
            Cowork mode coming soon
          </div>
        )}

        {mode === 'code' && (
          <div
            style={{
              display: 'flex',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--chat-text-muted)',
              fontSize: 14,
            }}
          >
            Code mode coming soon
          </div>
        )}
      </div>

      {searchOpen && (
        <WebSearchModalCmdK
          onClose={() => setSearchOpen(false)}
          onNavigate={(dest, item) => {
            if (dest === 'chat' && item.kind === 'chat') {
              hostBridge?.selectConversation?.(item.id);
            }
          }}
        />
      )}
    </div>
  );
}
