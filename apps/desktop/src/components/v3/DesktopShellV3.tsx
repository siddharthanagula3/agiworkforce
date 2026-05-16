import { useCallback, useState } from 'react';
import {
  ChatInterface,
  type ChatHostBridge,
  type ChatInterfaceProps,
} from '@agiworkforce/unified-chat';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { EmptyChat } from './EmptyChat';
import { CapModal } from './CapModal';
import { Sidebar } from './Sidebar';

// ─── mode type (shared with Sidebar) ─────────────────────────────────────────

export type V3Mode = 'chat' | 'cowork' | 'code';

// ─── local hook ───────────────────────────────────────────────────────────────

function useV3Mode() {
  const [mode, setMode] = useState<V3Mode>('chat');
  return { mode, setMode };
}

// ─── shell props ───────────────────────────────────────────────────────────────

export interface DesktopShellV3Props {
  runtime: ChatRuntime | null;
  className?: string;
  hostBridge?: ChatHostBridge | null;
  onModelSelectorClick?: () => void;
  onVoiceClick?: () => void;
  onNavigateView?: ChatInterfaceProps['onNavigateView'];
  onBuyTopUp?: () => void;
}

/**
 * v3 desktop shell.
 *
 * Layout: Sidebar (240/64px collapsible) left + main view area right.
 * Mode routing: chat → ChatInterface, cowork/code → placeholder until
 * peer engineers (desktop-modes) wire their components.
 *
 * emptyStateSlot, CapModal, and all ChatInterface props from the legacy
 * mount point in App.tsx are preserved unchanged.
 */
export function DesktopShellV3({
  runtime,
  className,
  hostBridge,
  onModelSelectorClick,
  onVoiceClick,
  onNavigateView,
  onBuyTopUp,
}: DesktopShellV3Props) {
  const { mode, setMode } = useV3Mode();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const handleSwitchModel = useCallback(() => {
    onModelSelectorClick?.();
  }, [onModelSelectorClick]);

  const handleNewChat = useCallback(() => {
    // Delegate to ChatInterface via runtime; no direct store call needed here
  }, []);

  const handleNavigateView = useCallback(
    (view: string) => {
      // Forward sidebar nav clicks through the host bridge
      if (onNavigateView) {
        onNavigateView(view as Parameters<NonNullable<typeof onNavigateView>>[0]);
      }
    },
    [onNavigateView],
  );

  return (
    <div
      className={className}
      data-v3-shell=""
      style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}
    >
      <Sidebar
        mode={mode}
        onModeChange={setMode}
        onNewChat={handleNewChat}
        onOpenSearch={() => {
          // Trigger ⌘K via keyboard event so ChatInterface's shortcut handler picks it up
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
          );
        }}
        onNavigateView={handleNavigateView}
        onOpenAccountMenu={() => setAccountMenuOpen((o) => !o)}
        accountMenuOpen={accountMenuOpen}
      />

      <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        {mode === 'chat' && (
          <>
            <ChatInterface
              runtime={runtime}
              className="h-full w-full"
              manageTheme={false}
              enableShortcuts={true}
              hostBridge={hostBridge}
              onModelSelectorClick={onModelSelectorClick}
              onVoiceClick={onVoiceClick}
              onNavigateView={onNavigateView}
              emptyStateSlot={<EmptyChat />}
              showProvenanceFooter={true}
            />
            <CapModal onSwitchModel={handleSwitchModel} onBuyTopUp={onBuyTopUp} />
          </>
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
            Cowork mode coming
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
            Code mode coming
          </div>
        )}
      </div>
    </div>
  );
}
