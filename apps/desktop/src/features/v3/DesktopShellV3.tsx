import { useCallback, useMemo, useState } from 'react';
import {
  ChatInterface,
  CapabilityProvider,
  type ChatHostBridge,
  type ChatInterfaceProps,
  useChatStore as useSharedChatStore,
} from '@agiworkforce/unified-chat';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { EmptyChat } from './EmptyChat';
import { CapModal } from './CapModal';
import { Sidebar } from './Sidebar';
import { AgiWorkProjects } from './AgiWorkProjects';
import { AgiWorkArtifacts } from './AgiWorkArtifacts';
import { AgiWorkScheduled } from './AgiWorkScheduled';
import { ArtifactPanel } from '@/features/artifacts/ArtifactPanel';
import { useArtifactStore } from '../../stores/artifactStore';
import { useChatStore } from '../../stores/chat';
import { useProjectStore } from '../../stores/projectStore';
import { useFolderSelection } from '../../hooks/useFolderSelection';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { invoke } from '../../lib/tauri-mock';
import { ActionRecorder } from '@/features/automation/ActionRecorder';
import {
  formatSelectedContextDraft,
  SelectedContextReview,
  type SelectedContextHandoff,
} from '../context-handoff/SelectedContextReview';

// ─── mode type (shared with Sidebar) ─────────────────────────────────────────

export type V3Mode = 'chat';

// ─── local hook ───────────────────────────────────────────────────────────────

function useV3Mode() {
  const [mode] = useState<V3Mode>('chat');
  return { mode };
}

type V3Panel = 'chat' | 'projects' | 'artifacts' | 'scheduled' | 'record-skill';

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
  const { selectFolder, currentFolderLabel } = useFolderSelection();

  // Local folder scoping is a Local-mode trust feature: in non-local privacy
  // modes the folder seam is withheld entirely, which hides the folder rows
  // in both the attachment menu and the composer scope picker.
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const folderSeamEnabled = privacyMode === 'local';

  // Clear mirrors FolderSelector's flow: reset the backend folder context,
  // then the store label (project/folder mutual exclusion + chip clear).
  const clearFolder = useCallback(() => {
    void invoke('project_context_set_folder', { path: null })
      .catch((error) => {
        console.error('[DesktopShellV3] Failed to clear folder context:', error);
      })
      .finally(() => {
        useProjectStore.getState().setCurrentFolder(null);
      });
  }, []);

  // Composer "Project or folder" picker (web ChatComposerNew parity).
  // Selection applies to the ACTIVE conversation immediately via the same
  // scoping seam handleNewChat uses (setConversationProject + project links →
  // TauriRuntime carries projectId into the backend row on first send).
  const projects = useProjectStore((s) => s.projects);
  const pickerProjects = useMemo(
    () => projects.filter((p) => !p.isArchived).map((p) => ({ id: p.id, name: p.name })),
    [projects],
  );
  const activeComposerProjectId = useChatStore(
    (s) => s.conversations.find((c) => c.id === s.activeConversationId)?.projectId ?? null,
  );

  const handleSelectProject = useCallback(
    (projectId: string | null) => {
      const chat = useChatStore.getState();
      let conversationId = chat.activeConversationId;
      // Picking a project with no active chat starts one, scoped from birth.
      if (!conversationId && projectId) {
        conversationId = hostBridge?.createConversation?.('New chat') ?? null;
        if (conversationId) hostBridge?.selectConversation?.(conversationId);
      }
      if (!conversationId) return;

      const previousProjectId =
        chat.conversations.find((c) => c.id === conversationId)?.projectId ?? null;
      useChatStore.getState().setConversationProject(conversationId, projectId);

      const projectStore = useProjectStore.getState();
      if (previousProjectId && previousProjectId !== projectId) {
        void projectStore.unlinkConversation(previousProjectId, conversationId);
      }
      if (projectId && projectId !== previousProjectId) {
        void projectStore.linkConversation(projectId, conversationId);
      }
    },
    [hostBridge],
  );

  const composerProjectPicker = useMemo(
    () => ({
      projects: pickerProjects,
      activeProjectId: activeComposerProjectId,
      onSelectProject: handleSelectProject,
    }),
    [pickerProjects, activeComposerProjectId, handleSelectProject],
  );

  const handleSwitchModel = useCallback(() => {
    onModelSelectorClick?.();
  }, [onModelSelectorClick]);

  const handleSelectedContextAccept = useCallback((handoff: SelectedContextHandoff) => {
    if (selectPrivacyMode(useAppModeStore.getState()) !== 'local') {
      throw new Error('Browser context can only be inserted into a Local Desktop conversation.');
    }
    setActivePanel('chat');
    useSharedChatStore.getState().appendDraftContent(formatSelectedContextDraft(handoff));
  }, []);

  const handleNewChat = useCallback(
    (projectId?: string) => {
      setActivePanel('chat');
      const conversationId = hostBridge?.createConversation?.('New chat');
      if (conversationId) {
        hostBridge?.selectConversation?.(conversationId);
        // Scope the new chat to a project when started from a project folder.
        if (projectId) {
          useChatStore.getState().setConversationProject(conversationId, projectId);
          // Real link (not just chat-side metadata) so project.conversationIds
          // — and the project card's session count — reflect the new chat.
          void useProjectStore.getState().linkConversation(projectId, conversationId);
        }
      }
    },
    [hostBridge],
  );

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
      // Forward cloud/settings views through the host bridge.
      if (onNavigateView) {
        onNavigateView(view as Parameters<NonNullable<typeof onNavigateView>>[0]);
      }
    },
    [onNavigateView],
  );

  return (
    <CapabilityProvider platform="desktop">
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
              onSelectFolder={folderSeamEnabled ? selectFolder : undefined}
              onRecordSkill={() => setActivePanel('record-skill')}
              currentFolderLabel={folderSeamEnabled ? currentFolderLabel : null}
              onClearFolder={folderSeamEnabled ? clearFolder : undefined}
              projectPicker={composerProjectPicker}
              onNavigateView={handleNavigateView}
              sidebarSlot={null}
              emptyStateSlot={<EmptyChat />}
              enableSearchOverlay={false}
              showProvenanceFooter={true}
            />
          ) : activePanel === 'record-skill' ? (
            <ActionRecorder
              onClose={() => setActivePanel('chat')}
              onSkillCreated={() => setActivePanel('chat')}
            />
          ) : activePanel === 'projects' ? (
            <AgiWorkProjects />
          ) : activePanel === 'artifacts' ? (
            <AgiWorkArtifacts />
          ) : (
            <AgiWorkScheduled />
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
          <SelectedContextReview onAccept={handleSelectedContextAccept} />
        </div>
      </div>
    </CapabilityProvider>
  );
}
