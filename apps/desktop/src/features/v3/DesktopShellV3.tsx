import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { updateCloudConversationTitle } from '@/api/cloudApi';
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
// Library is the Managed Cloud counterpart to Local's Artifacts: cloud-stored
// files, shared with web through @agiworkforce/unified-chat.
const DesktopLibrary = lazy(() => import('@/features/library/DesktopLibrary'));
// Durable Cloud agent runs — the same list web shows at /tasks.
const DesktopTasks = lazy(() => import('@/features/tasks/DesktopTasks'));
// Account-owned schedules that continue to run after Desktop closes.
const DesktopCloudSchedules = lazy(() => import('@/features/schedules/DesktopCloudSchedules'));
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
import { CloudVoiceActionDialog } from '../voice/CloudVoiceActionDialog';
import { useCloudVoiceController } from '../voice/useCloudVoiceController';
import { createDesktopCloudShare } from '../../services/desktopCloudShares';
import { McpToolConfirmationPrompt } from '../chat/McpToolConfirmationPrompt';

// ─── mode type (shared with Sidebar) ─────────────────────────────────────────

export type V3Mode = 'chat';

// ─── local hook ───────────────────────────────────────────────────────────────

function useV3Mode() {
  const [mode] = useState<V3Mode>('chat');
  return { mode };
}

type V3Panel =
  | 'chat'
  | 'projects'
  | 'artifacts'
  | 'library'
  | 'tasks'
  | 'cloud-schedules'
  | 'scheduled'
  | 'record-skill';

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
  const [libraryInitialQuery, setLibraryInitialQuery] = useState('');

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
  const cloudVoice = useCloudVoiceController(isManagedCloud);
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

  // Evict Local-only panels when the user switches to Cloud, so a device
  // surface never lingers over a cloud session.
  //
  // `library` and `tasks` are deliberately absent: they are Cloud-only, and
  // listing them here made them unreachable — the nav click set the panel and
  // this effect reset it to chat on the same tick, so the buttons rendered and
  // did nothing. Their Local counterparts are `artifacts` and `scheduled`.
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
    const navigateLibrary = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        detail &&
        typeof detail === 'object' &&
        typeof (detail as { query?: unknown }).query === 'string'
      ) {
        setLibraryInitialQuery((detail as { query: string }).query);
        setActivePanel('library');
      }
    };
    window.addEventListener('desktop:navigate-panel', navigate);
    window.addEventListener('desktop:navigate-library', navigateLibrary);
    return () => {
      window.removeEventListener('desktop:navigate-panel', navigate);
      window.removeEventListener('desktop:navigate-library', navigateLibrary);
    };
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

  // DCL-08: the conversation header offered no actions at all. Rename is the
  // one both modes can honour — Cloud persists through the API, Local titles
  // are already owned by the local store, so there is nothing to round-trip.
  const handleRenameConversation = useCallback(
    async (conversationId: string, title: string) => {
      if (privacyMode === 'local') return;
      try {
        await updateCloudConversationTitle(conversationId, title);
      } catch (error) {
        console.error('[DesktopShellV3] Failed to rename conversation:', error);
        toast.error('Could not rename the conversation. The new title was not saved.');
      }
    },
    [privacyMode],
  );

  const handleShareConversation = useCallback(
    async (conversationId: string) => {
      if (privacyMode !== 'managed') return;
      const state = useChatStore.getState();
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      const messages = state.messagesByConversation[conversationId] ?? [];
      if (!conversation || messages.length === 0) {
        toast.info('Add a message before sharing this conversation.');
        return;
      }
      const modelMessage = [...messages]
        .reverse()
        .find((message) => message.metadata?.model || message.metadata?.provider);
      try {
        const share = await createDesktopCloudShare({
          title: conversation.title || 'Shared Session',
          modelId: conversation.modelOverride ?? modelMessage?.metadata?.model,
          provider: modelMessage?.metadata?.provider,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
            created_at: message.timestamp.toISOString(),
          })),
        });
        toast.success('Share link created', {
          description: share.shareUrl,
          duration: 8_000,
          action: {
            label: 'Copy link',
            onClick: () => {
              void navigator.clipboard.writeText(share.shareUrl).then(
                () => toast.success('Link copied'),
                () => toast.error('The link could not be copied.'),
              );
            },
          },
        });
      } catch (error) {
        toast.error('Could not share conversation', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      }
    },
    [privacyMode],
  );

  const conversationActions = useMemo(
    () => ({
      onRename: handleRenameConversation,
      ...(privacyMode === 'managed' ? { onShare: handleShareConversation } : {}),
    }),
    [handleRenameConversation, handleShareConversation, privacyMode],
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
      if (view === 'library') {
        if (privacyMode === 'local') {
          // Local files are not cataloged in the cloud Library; Artifacts is
          // the device-side equivalent.
          toast.info('Library lists cloud files. Device files are under Artifacts.');
          return;
        }
        setLibraryInitialQuery('');
        setActivePanel('library');
        return;
      }
      if (view === 'tasks') {
        if (privacyMode === 'local') {
          // Tasks are Cloud runs that survive the app closing; a local session
          // has none, and Scheduled is the device-side equivalent.
          toast.info('Tasks lists Cloud runs. Device schedules are under Scheduled.');
          return;
        }
        setActivePanel('tasks');
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
        if (privacyMode === 'managed') {
          setActivePanel('cloud-schedules');
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
              conversationActions={conversationActions}
              onSelectFolder={folderSeamEnabled ? handleSelectFolder : undefined}
              pendingAttachments={pendingAttachments}
              voiceInputController={isManagedCloud ? cloudVoice.controller : undefined}
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
          ) : activePanel === 'library' && privacyMode !== 'local' ? (
            // The shell clips overflow, so the panel owns its own scrolling or
            // a long grid is simply unreachable.
            <div className="h-full overflow-y-auto px-6 py-6">
              <Suspense fallback={null}>
                <DesktopLibrary
                  initialQuery={libraryInitialQuery}
                  onStartChat={() => handleNewChat()}
                />
              </Suspense>
            </div>
          ) : activePanel === 'tasks' && privacyMode !== 'local' ? (
            // TasksPage's root is h-full, which collapses to zero unless it is
            // given a parent with a resolved height. Without this wrapper the
            // panel mounted and rendered nothing at all.
            <div className="h-full overflow-y-auto">
              <Suspense fallback={null}>
                <DesktopTasks
                  onOpenConversation={handleOpenProjectConversation}
                  onStartChat={() => handleNewChat()}
                />
              </Suspense>
            </div>
          ) : activePanel === 'cloud-schedules' && privacyMode === 'managed' ? (
            <Suspense fallback={null}>
              <DesktopCloudSchedules />
            </Suspense>
          ) : activePanel === 'artifacts' && privacyMode === 'local' ? (
            <AgiWorkArtifacts onNewChat={() => handleNewChat()} />
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
                background: 'var(--chat-surface-base)',
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
          <CloudVoiceActionDialog
            action={cloudVoice.pendingAction}
            error={cloudVoice.error}
            isExecuting={cloudVoice.controller.state === 'executing'}
            requiresComputerUseConsent={cloudVoice.requiresComputerUseConsent}
            onApprove={() => void cloudVoice.approveAction()}
            onUseAsText={cloudVoice.useActionAsText}
            onCancel={cloudVoice.cancelAction}
          />
          <McpToolConfirmationPrompt />
        </div>
      </div>
    </CapabilityProvider>
  );
}
