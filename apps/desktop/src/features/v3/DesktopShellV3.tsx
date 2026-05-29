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
import { AccountMenu } from './AccountMenu';

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
  onModelSelectorClick,
  onVoiceClick,
  onNavigateView,
  onBuyTopUp,
}: DesktopShellV3Props) {
  const { mode } = useV3Mode();
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
      {accountMenuOpen && <AccountMenu onClose={() => setAccountMenuOpen(false)} />}

      <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
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
      </div>
    </div>
  );
}
