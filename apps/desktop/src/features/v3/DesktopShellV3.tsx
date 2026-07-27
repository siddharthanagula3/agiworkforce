import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { selectPlan, useUnifiedAuthStore } from '../../stores/auth';
import { ActionRecorder } from '@/features/automation/ActionRecorder';
import { ProjectSettingsDialog } from '@/features/chat/ProjectSettingsDialog';
import {
  formatSelectedContextDraft,
  SelectedContextReview,
  type SelectedContextHandoff,
} from '../context-handoff/SelectedContextReview';
import { CloudFolderAttachSheet } from '../context-handoff/CloudFolderAttachSheet';
import {
  canUseDesktopCloudAgiWork,
  canUseDesktopCloudImageGeneration,
} from '../../services/desktopCloudEntitlements';

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
  externalSendRequest?: ChatInterfaceProps['externalSendRequest'];
  hostBridge?: ChatHostBridge | null;
  onModelSelectorClick?: () => void;
  // AUDIT-FIX CMP-29: `onVoiceClick` removed — ChatInput owns the mic
  // (useVoiceInput) and never invoked the forwarded handler.
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
  externalSendRequest,
  hostBridge,
  onModelSelectorClick,
  onNavigateView,
  onOpenSearch,
  onBuyTopUp,
}: DesktopShellV3Props) {
  const { mode } = useV3Mode();
  const [activePanel, setActivePanel] = useState<V3Panel>('chat');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  // Artifact panel is driven by the same artifactStore that AgiWorkArtifacts writes.
  // conversationId is optional on ArtifactPanel so it works in the gallery context.
  const artifactPanelOpen = useArtifactStore((s) => s.panelOpen);
  const closeArtifactPanel = useArtifactStore((s) => s.closePanel);
  // The folder seam is available in BOTH Local and Managed Cloud, but they mean
  // different things. Local grants the folder as a working scope (a persistent
  // capability — see useFolderSelection's docstring). Cloud treats it as a
  // display label and scan root only, and any file that leaves the device does
  // so through the composer attachment path after an explicit consent ceremony.
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const folderSeamEnabled = privacyMode === 'local' || privacyMode === 'managed';
  const { selectFolder, currentFolderLabel, clearFolder } = useFolderSelection(
    privacyMode === 'managed' ? 'cloud' : 'local',
  );
  const accountPlan = useUnifiedAuthStore(selectPlan);
  const isManagedCloud = privacyMode === 'managed';
  const canUseAgiWork = !isManagedCloud || canUseDesktopCloudAgiWork(accountPlan);
  const quickChipAvailability = isManagedCloud
    ? { image: canUseDesktopCloudImageGeneration(accountPlan) }
    : undefined;

  // Cloud folder flow: picking a folder opens the consent sheet rather than
  // scoping the session. Approved files are injected into the composer as an
  // ordinary attachment set, keyed so a re-render cannot double-append.
  const [cloudFolderPath, setCloudFolderPath] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<{
    id: string;
    files: File[];
  } | null>(null);

  const handleSelectFolder = useCallback(async () => {
    const picked = await selectFolder();
    if (picked && privacyMode === 'managed') setCloudFolderPath(picked);
  }, [selectFolder, privacyMode]);

  const handleFolderFilesApproved = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setPendingAttachments({ id: `folder-${Date.now()}-${files.length}`, files });
  }, []);

  useEffect(() => {
    if (
      privacyMode === 'managed' &&
      ['artifacts', 'scheduled', 'record-skill'].includes(activePanel)
    ) {
      setActivePanel('chat');
    }
  }, [activePanel, privacyMode]);

  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail === 'projects') setActivePanel('projects');
      if (detail === 'chat') setActivePanel('chat');
    };
    window.addEventListener('desktop:navigate-panel', navigate);
    return () => window.removeEventListener('desktop:navigate-panel', navigate);
  }, []);

  // Composer "Project or folder" picker (web ChatComposerNew parity).
  // Selection applies to the active conversation through one authoritative
  // membership transition. Cloud persists the conversation's project_id;
  // Local updates the native project projection.
  const projects = useProjectStore((s) => s.projects);
  const pickerProjects = useMemo(
    () => projects.filter((p) => !p.isArchived).map((p) => ({ id: p.id, name: p.name })),
    [projects],
  );
  const activeCloudConversationId = useChatStore((s) => s.activeConversationId);
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

      void useProjectStore
        .getState()
        .moveConversationToProject(conversationId, projectId)
        .catch((error) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
    },
    [hostBridge],
  );

  const handleCreateProject = useCallback(() => {
    setActivePanel('projects');
    setCreateProjectOpen(true);
  }, []);

  const composerProjectPicker = useMemo(
    () => ({
      projects: pickerProjects,
      activeProjectId: activeComposerProjectId,
      onSelectProject: handleSelectProject,
      onCreateProject: handleCreateProject,
    }),
    [pickerProjects, activeComposerProjectId, handleSelectProject, handleCreateProject],
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
          void useProjectStore
            .getState()
            .moveConversationToProject(conversationId, projectId)
            .catch((error) => {
              toast.error(error instanceof Error ? error.message : String(error));
            });
        }
      }
    },
    [hostBridge],
  );

  const handleOpenProjectConversation = useCallback(
    (conversationId: string) => {
      hostBridge?.selectConversation?.(conversationId);
      setActivePanel('chat');
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
        if (privacyMode !== 'local') {
          toast.info('Device artifacts are available in Local mode.');
          return;
        }
        setActivePanel('artifacts');
        return;
      }
      if (view === 'work-scheduled') {
        if (privacyMode !== 'local') {
          toast.info('Device schedules are available in Local mode.');
          return;
        }
        setActivePanel('scheduled');
        return;
      }
      // Forward cloud/settings views through the host bridge.
      if (onNavigateView) {
        onNavigateView(view as Parameters<NonNullable<typeof onNavigateView>>[0]);
      }
    },
    [onNavigateView, privacyMode],
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
          onCreateProject={handleCreateProject}
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
              externalSendRequest={externalSendRequest}
              manageTheme={false}
              enableShortcuts={true}
              hostBridge={hostBridge}
              onModelSelectorClick={onModelSelectorClick}
              onSelectFolder={folderSeamEnabled ? handleSelectFolder : undefined}
              pendingAttachments={pendingAttachments}
              onRecordSkill={
                privacyMode === 'local' ? () => setActivePanel('record-skill') : undefined
              }
              currentFolderLabel={folderSeamEnabled ? currentFolderLabel : null}
              onClearFolder={folderSeamEnabled ? clearFolder : undefined}
              projectPicker={composerProjectPicker}
              canUseAgiWork={canUseAgiWork}
              quickChipAvailability={quickChipAvailability}
              onNavigateView={handleNavigateView}
              sidebarSlot={null}
              emptyStateSlot={<EmptyChat />}
              enableSearchOverlay={false}
              showProvenanceFooter={true}
            />
          ) : activePanel === 'record-skill' && privacyMode === 'local' ? (
            <ActionRecorder
              onClose={() => setActivePanel('chat')}
              onSkillCreated={() => setActivePanel('chat')}
            />
          ) : activePanel === 'projects' ? (
            <AgiWorkProjects
              onCreateProject={handleCreateProject}
              onNewChat={(projectId) => handleNewChat(projectId)}
              onOpenConversation={handleOpenProjectConversation}
            />
          ) : activePanel === 'artifacts' && privacyMode === 'local' ? (
            <AgiWorkArtifacts />
          ) : activePanel === 'scheduled' && privacyMode === 'local' ? (
            <AgiWorkScheduled />
          ) : (
            <AgiWorkProjects
              onCreateProject={handleCreateProject}
              onNewChat={(projectId) => handleNewChat(projectId)}
              onOpenConversation={handleOpenProjectConversation}
            />
          )}
          <CapModal onSwitchModel={handleSwitchModel} onBuyTopUp={onBuyTopUp} />

          {/* Artifact viewer panel — mounts when the artifact store requests it open.
            Shares the same artifactStore instance that AgiWorkArtifacts writes,
            so setActiveArtifact + openPanel in the grid card opens this panel. */}
          {privacyMode === 'local' && artifactPanelOpen && (
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
          <CloudFolderAttachSheet
            folderPath={cloudFolderPath}
            sourceSessionId={activeCloudConversationId ?? 'new-conversation'}
            onClose={() => setCloudFolderPath(null)}
            onApprove={handleFolderFilesApproved}
          />
          <ProjectSettingsDialog
            open={createProjectOpen}
            onOpenChange={setCreateProjectOpen}
            mode="create"
            onCreated={(project) => {
              useProjectStore.getState().setActiveProject(project.id);
              setActivePanel('projects');
            }}
          />
        </div>
      </div>
    </CapabilityProvider>
  );
}
