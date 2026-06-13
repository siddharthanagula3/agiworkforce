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
import { AgiWorkProjects } from './AgiWorkProjects';
import { AgiWorkArtifacts } from './AgiWorkArtifacts';
import { AgiWorkScheduled } from './AgiWorkScheduled';
import { AgiWorkDispatch } from './AgiWorkDispatch';
import { ArtifactPanel } from '@/features/artifacts/ArtifactPanel';
import { useArtifactStore } from '../../stores/artifactStore';

// ─── mode type (shared with Sidebar) ─────────────────────────────────────────

export type V3Mode = 'chat';

// ─── local hook ───────────────────────────────────────────────────────────────

function useV3Mode() {
  const [mode] = useState<V3Mode>('chat');
  return { mode };
}

type V3Panel = 'chat' | 'projects' | 'artifacts' | 'scheduled' | 'dispatch';

// ─── shell props ───────────────────────────────────────────────────────────────

export interface DesktopShellV3Props {
  runtime: ChatRuntime | null;
  className?: string;
  hostBridge?: ChatHostBridge | null;
  onModelSelectorClick?: () => void;
  onVoiceClick?: () => void;
  onNavigateView?: ChatInterfaceProps['onNavigateView'];
  onOpenSearch?: () => void;
  onBuyTopUp?: () => void;
}

/**
 * v3 desktop shell.
 *
 * Layout: Sidebar (240/64px collapsible) left + main view area right.
 * Chat and AGI Work live in one shell. The old separate Code/AGI Work mode tabs
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
  onOpenSearch,
  onBuyTopUp,
}: DesktopShellV3Props) {
  const { mode } = useV3Mode();
  const [activePanel, setActivePanel] = useState<V3Panel>('chat');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Artifact panel is driven by the same artifactStore that AgiWorkArtifacts writes.
  // conversationId is optional on ArtifactPanel so it works in the gallery context.
  const artifactPanelOpen = useArtifactStore((s) => s.panelOpen);
  const closeArtifactPanel = useArtifactStore((s) => s.closePanel);

  const handleSwitchModel = useCallback(() => {
    onModelSelectorClick?.();
  }, [onModelSelectorClick]);

  const handleNewChat = useCallback(() => {
    setActivePanel('chat');
    const conversationId = hostBridge?.createConversation?.('New chat');
    if (conversationId) {
      hostBridge?.selectConversation?.(conversationId);
    }
  }, [hostBridge]);

  const handleNavigateView = useCallback(
    (view: string) => {
      if (view === 'projects') {
        setActivePanel('projects');
        return;
      }
      if (view === 'artifacts') {
        setActivePanel('artifacts');
        return;
      }
      if (view === 'work-scheduled') {
        setActivePanel('scheduled');
        return;
      }
      if (view === 'work-dispatch') {
        setActivePanel('dispatch');
        return;
      }

      // Forward cloud/settings views through the host bridge.
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
        onOpenSearch={onOpenSearch}
        onNavigateView={handleNavigateView}
        onOpenAccountMenu={() => setAccountMenuOpen((o) => !o)}
        accountMenuOpen={accountMenuOpen}
        onJumpConversation={(id) => {
          setActivePanel('chat');
          hostBridge?.selectConversation?.(id);
        }}
      />

      <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        {activePanel === 'chat' ? (
          <ChatInterface
            runtime={runtime}
            className="h-full w-full"
            manageTheme={false}
            enableShortcuts={true}
            hostBridge={hostBridge}
            onModelSelectorClick={onModelSelectorClick}
            onVoiceClick={onVoiceClick}
            onNavigateView={handleNavigateView}
            sidebarSlot={null}
            emptyStateSlot={<EmptyChat />}
            enableSearchOverlay={false}
            showProvenanceFooter={true}
          />
        ) : activePanel === 'projects' ? (
          <AgiWorkProjects />
        ) : activePanel === 'artifacts' ? (
          <AgiWorkArtifacts />
        ) : activePanel === 'scheduled' ? (
          <AgiWorkScheduled />
        ) : (
          <AgiWorkDispatch />
        )}
        <CapModal onSwitchModel={handleSwitchModel} onBuyTopUp={onBuyTopUp} />

        {/* Artifact viewer panel — mounts when the artifact store requests it open.
            Shares the same artifactStore instance that AgiWorkArtifacts writes,
            so setActiveArtifact + openPanel in the grid card opens this panel. */}
        {artifactPanelOpen && (
          <div
            data-testid="v3-artifact-panel"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--chat-surface-base, #0a0c17)',
            }}
          >
            <ArtifactPanel onClose={closeArtifactPanel} />
          </div>
        )}
      </div>
    </div>
  );
}
