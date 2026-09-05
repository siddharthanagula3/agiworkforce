import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { Loader2, Terminal as TerminalIcon, X } from 'lucide-react';
import { updateCloudConversationTitle } from '@/api/cloudApi';
import { listCloudSkills } from '@/api/cloudSkills';
import {
  ChatInterface,
  CapabilityProvider,
  type ChatHostBridge,
  type ChatInterfaceProps,
  useChatModelStore,
  useChatStore as useSharedChatStore,
} from '@agiworkforce/unified-chat';
import type { ChatMessage, ChatRuntime } from '@agiworkforce/unified-chat';
import { EmptyChat } from './EmptyChat';
import { CapModal } from './CapModal';
import { Sidebar } from './Sidebar';
import { AgiWorkProjects } from './AgiWorkProjects';
import { AgiWorkArtifacts } from './AgiWorkArtifacts';
import { AgiWorkScheduled } from './AgiWorkScheduled';
import { ArtifactPanel } from '@/features/artifacts/ArtifactPanel';
import { ArtifactDraftView } from '@/features/artifacts/ArtifactDraftView';
import { getAgiTaskModelEligibility } from '@/lib/modelCapabilityGates';
import { resolveComposerEditorMode } from '@/lib/composerEditorGate';
const DesktopLibrary = lazy(() => import('@/features/library/DesktopLibrary'));
const DesktopTasks = lazy(() => import('@/features/tasks/DesktopTasks'));
const DesktopAgentTasks = lazy(() =>
  import('@/features/agi/AgentTaskPanel').then((module) => ({
    default: module.AgentTaskPanel,
  })),
);
const DesktopCloudSchedules = lazy(() => import('@/features/schedules/DesktopCloudSchedules'));
const CodeWorkspace = lazy(() =>
  import('@/features/code/CodeWorkspace').then((module) => ({
    default: module.CodeWorkspace,
  })),
);
const CanvasWorkspace = lazy(() =>
  import('@/features/canvas/CanvasWorkspace').then((module) => ({
    default: module.CanvasWorkspace,
  })),
);
const AutomationBuilder = lazy(() =>
  import('@/features/workflows/AutomationBuilder').then((module) => ({
    default: module.AutomationBuilder,
  })),
);
const DeepResearchPage = lazy(() =>
  import('@/features/research/DeepResearchPage').then((module) => ({
    default: module.DeepResearchPage,
  })),
);
import { ExecutionSidecar } from '@/features/execution-sidecar/ExecutionSidecar';
const DesktopTerminalWorkspace = lazy(() =>
  import('@/features/terminal/TerminalWorkspace').then((module) => ({
    default: module.TerminalWorkspace,
  })),
);
import { useArtifactStore } from '../../stores/artifactStore';
import { useAgentTaskStore } from '../../stores/agentTaskStore';
import { useChatStore } from '../../stores/chat';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSkillMarketplaceStore } from '../../stores/skillMarketplaceStore';
import { useConnectorsStore } from '../../stores/connectorsStore';
import { useFolderSelection } from '../../hooks/useFolderSelection';
import { selectPrivacyMode, useAppModeStore } from '../../stores/appModeStore';
import { selectHasCloudAccountSession, selectPlan, useUnifiedAuthStore } from '../../stores/auth';
import { ActionRecorder } from '@/features/automation/ActionRecorder';
import { ProjectSettingsDialog } from '@/features/chat/ProjectSettingsDialog';
import {
  formatSelectedContextDraft,
  SelectedContextReview,
  type SelectedContextHandoff,
} from '../context-handoff/SelectedContextReview';
import { CloudFolderAttachSheet } from '../context-handoff/CloudFolderAttachSheet';
import { revokeCloudHandoffGrant } from '../context-handoff/cloudHandoffGrant';
import { canUseDesktopCloudAgiWork } from '../../services/desktopCloudEntitlements';
import { CloudVoiceActionDialog } from '../voice/CloudVoiceActionDialog';
import { useCloudVoiceController } from '../voice/useCloudVoiceController';
import { ComputerUseConsentDialog } from '../settings/ComputerUseConsentDialog';
import { createDesktopCloudShare } from '../../services/desktopCloudShares';
import { deriveDesktopMessageArtifacts } from '../../runtime/desktopArtifactProjection';
import { McpToolConfirmationPrompt } from '../chat/McpToolConfirmationPrompt';
import { ComposerContextControls } from './ComposerContextControls';

function readMessageOrigin(message: ChatMessage, key: 'model' | 'provider'): string | undefined {
  const direct = message[key];
  if (typeof direct === 'string' && direct.trim().length > 0) return direct;
  const fromMetadata = message.metadata?.[key];
  return typeof fromMetadata === 'string' && fromMetadata.trim().length > 0
    ? fromMetadata
    : undefined;
}

function shareTimestamp(message: ChatMessage): string {
  const raw = message.createdAt ?? message.timestamp;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : new Date(0).toISOString();
}

export type V3Mode = 'chat';

function useV3Mode() {
  const [mode] = useState<V3Mode>('chat');
  return { mode };
}

type V3Panel =
  | 'chat'
  | 'projects'
  | 'artifacts'
  | 'code'
  | 'design'
  | 'research'
  | 'automation'
  | 'library'
  | 'tasks'
  | 'agent-tasks'
  | 'cloud-schedules'
  | 'scheduled'
  | 'record-skill';

const DEVICE_ONLY_PANELS: readonly V3Panel[] = [
  'artifacts',
  'code',
  'design',
  'research',
  'automation',
  'scheduled',
  'record-skill',
  'agent-tasks',
];

const CLOUD_ONLY_PANELS: readonly V3Panel[] = ['library', 'tasks', 'cloud-schedules'];

export interface DesktopShellV3Props {
  runtime: ChatRuntime | null;
  className?: string;
  externalSendRequest?: ChatInterfaceProps['externalSendRequest'];
  hostBridge?: ChatHostBridge | null;
  onModelSelectorClick?: () => void;
  onNavigateView?: ChatInterfaceProps['onNavigateView'];
  onOpenSearch?: () => void;
}

const panelFallback = (
  <div className="flex h-full items-center justify-center" aria-busy="true">
    <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading panel" />
  </div>
);

export function DesktopShellV3({
  runtime,
  className,
  externalSendRequest,
  hostBridge,
  onModelSelectorClick,
  onNavigateView,
  onOpenSearch,
}: DesktopShellV3Props) {
  const { mode } = useV3Mode();
  const [activePanel, setActivePanel] = useState<V3Panel>('chat');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [libraryInitialQuery, setLibraryInitialQuery] = useState('');
  const [terminalDockOpen, setTerminalDockOpen] = useState(() => {
    try {
      return localStorage.getItem('desktop-terminal-dock-open') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('desktop-terminal-dock-open', String(terminalDockOpen));
    } catch {
      // Persistence is optional; the dock remains usable for this session.
    }
  }, [terminalDockOpen]);

  const artifactPanelOpen = useArtifactStore((s) => s.panelOpen);
  const closeArtifactPanel = useArtifactStore((s) => s.closePanel);
  const artifactDraft = useArtifactStore((s) => s.draft);
  const discardArtifactDraft = useArtifactStore((s) => s.discardArtifactDraft);
  const privacyMode = useAppModeStore(selectPrivacyMode);
  const folderSeamEnabled = privacyMode === 'local' || privacyMode === 'managed';
  const { selectFolder, currentFolderLabel, clearFolder } = useFolderSelection(
    privacyMode === 'managed' ? 'cloud' : 'local',
  );
  const accountPlan = useUnifiedAuthStore(selectPlan);
  const hasCloudAccountSession = useUnifiedAuthStore(selectHasCloudAccountSession);
  const cloudAccountId = useUnifiedAuthStore((state) => state.user?.id ?? null);
  const cloudSessionEpoch = useUnifiedAuthStore((state) => state.cloudSessionEpoch);
  const activeCloudConversationId = useChatStore((s) => s.activeConversationId);
  const isManagedCloud = privacyMode === 'managed';
  const needsLocalModelSetup = useChatModelStore(
    (state) =>
      privacyMode === 'local' &&
      !state.models.some((model) => model.isLocal === true && model.availability !== 'unavailable'),
  );
  const hasConnectedTools = useConnectorsStore((state) => state.connectedIds.length > 0);
  const [managedSkills, setManagedSkills] = useState<ChatInterfaceProps['skills']>([]);
  const cloudVoice = useCloudVoiceController(isManagedCloud);
  const selectedModel = useChatModelStore((state) => state.getSelectedModel());
  const localAgiTaskEligibility = getAgiTaskModelEligibility(selectedModel);
  const canUseAgiWork = isManagedCloud
    ? canUseDesktopCloudAgiWork(accountPlan)
    : localAgiTaskEligibility.eligible;
  const agiWorkUnavailableReason = canUseAgiWork
    ? undefined
    : isManagedCloud
      ? 'AGI Work is not included in this account plan. Project chat still works.'
      : localAgiTaskEligibility.reason;
  const composerSendShortcut = useSettingsStore(
    (state) => state.chatPreferences.sendShortcut ?? 'enter',
  );
  const [composerEditorMode] = useState(resolveComposerEditorMode);
  const matchLocalSkillsForMessage = useSkillMarketplaceStore((state) => state.matchForMessage);
  const suggestLocalSkills = useCallback(
    async (content: string) => {
      const matches = await matchLocalSkillsForMessage(content);
      return matches.map((match) => ({
        name: match.skillName,
        description: match.description,
        reason: match.matchReason,
      }));
    },
    [matchLocalSkillsForMessage],
  );

  useEffect(() => {
    if (!isManagedCloud || !hasCloudAccountSession) {
      setManagedSkills([]);
      return;
    }
    let cancelled = false;
    listCloudSkills()
      .then((catalog) => {
        if (cancelled) return;
        setManagedSkills(
          catalog
            .filter((skill) => skill.lifecycle === 'included')
            .map((skill) => ({ id: skill.name, name: skill.name, category: skill.source })),
        );
      })
      .catch(() => {
        if (!cancelled) setManagedSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cloudAccountId, cloudSessionEpoch, hasCloudAccountSession, isManagedCloud]);

  const [cloudFolderSelection, setCloudFolderSelection] = useState<{
    path: string;
    grantId: string;
    accountId: string;
    sessionEpoch: number;
  } | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<{
    id: string;
    files: File[];
    ownerKey: string;
  } | null>(null);

  const composerTrustBoundaryKey = isManagedCloud
    ? `managed:${
        hasCloudAccountSession && cloudAccountId
          ? `${cloudAccountId}:session-${cloudSessionEpoch}`
          : `signed-out:session-${cloudSessionEpoch}`
      }`
    : `${privacyMode}:device`;
  const composerAttachmentOwnerKey = `${composerTrustBoundaryKey}:${
    activeCloudConversationId ?? 'new-conversation'
  }`;

  const handleSelectFolder = useCallback(async () => {
    const openingPrivacyMode = selectPrivacyMode(useAppModeStore.getState());
    const openingAuth = useUnifiedAuthStore.getState();
    const openingAccountId = selectHasCloudAccountSession(openingAuth)
      ? openingAuth.user?.id
      : null;
    const openingSessionEpoch = openingAuth.cloudSessionEpoch;
    const picked = await selectFolder();
    if (!picked) return;

    const livePrivacyMode = selectPrivacyMode(useAppModeStore.getState());
    const liveAuth = useUnifiedAuthStore.getState();
    const liveAccountId = selectHasCloudAccountSession(liveAuth) ? liveAuth.user?.id : null;
    if (
      openingPrivacyMode === 'managed' &&
      livePrivacyMode === 'managed' &&
      openingAccountId &&
      liveAccountId === openingAccountId &&
      liveAuth.cloudSessionEpoch === openingSessionEpoch &&
      picked.cloudGrantId
    ) {
      setCloudFolderSelection({
        path: picked.path,
        grantId: picked.cloudGrantId,
        accountId: liveAccountId,
        sessionEpoch: liveAuth.cloudSessionEpoch,
      });
    } else if (picked.cloudGrantId) {
      void revokeCloudHandoffGrant(picked.cloudGrantId);
      clearFolder();
    }
  }, [clearFolder, selectFolder]);

  const cloudFolderBoundaryActive = Boolean(
    cloudFolderSelection &&
    isManagedCloud &&
    hasCloudAccountSession &&
    cloudAccountId === cloudFolderSelection.accountId &&
    cloudSessionEpoch === cloudFolderSelection.sessionEpoch,
  );

  useEffect(() => {
    if (cloudFolderSelection && !cloudFolderBoundaryActive) {
      setCloudFolderSelection(null);
      clearFolder();
    }
  }, [clearFolder, cloudFolderBoundaryActive, cloudFolderSelection]);

  useEffect(() => {
    const grantId = cloudFolderSelection?.grantId;
    if (!grantId) return;
    return () => {
      void revokeCloudHandoffGrant(grantId);
    };
  }, [cloudFolderSelection?.grantId]);

  const handleFolderFilesApproved = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setPendingAttachments({
        id: `folder-${Date.now()}-${files.length}`,
        files,
        ownerKey: composerAttachmentOwnerKey,
      });
    },
    [composerAttachmentOwnerKey],
  );

  useEffect(() => {
    setPendingAttachments(null);
  }, [composerAttachmentOwnerKey]);

  const activePendingAttachments =
    pendingAttachments?.ownerKey === composerAttachmentOwnerKey ? pendingAttachments : null;

  useEffect(() => {
    const stranded = privacyMode === 'local' ? CLOUD_ONLY_PANELS : DEVICE_ONLY_PANELS;
    if (stranded.includes(activePanel)) {
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

  const projects = useProjectStore((s) => s.projects);
  const currentFolderPath = useProjectStore((s) => s.currentFolder);
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
      const state = useSharedChatStore.getState();
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      const messages = (state.messagesByConversation[conversationId] ?? []).filter(
        (message) => message.content.trim().length > 0,
      );
      if (messages.length === 0) {
        toast.info('Add a message before sharing this conversation.');
        return;
      }
      const modelMessage = [...messages]
        .reverse()
        .find(
          (message) =>
            readMessageOrigin(message, 'model') ?? readMessageOrigin(message, 'provider'),
        );
      const derivedModelId = modelMessage ? readMessageOrigin(modelMessage, 'model') : undefined;
      const derivedProvider = modelMessage
        ? readMessageOrigin(modelMessage, 'provider')
        : undefined;
      try {
        const share = await createDesktopCloudShare({
          title: conversation?.title || 'Shared Session',
          modelId: conversation?.model ?? derivedModelId,
          provider: derivedProvider,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
            created_at: shareTimestamp(message),
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

  const handleSubmitChatGoal = useCallback(
    async (goal: string) => {
      try {
        await useAgentTaskStore.getState().submitGoal(goal);
        setActivePanel('agent-tasks');
      } catch {
        // agentTaskStore owns the failure toast so every caller reports it once.
      }
    },
    [setActivePanel],
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
          toast.info('Library lists cloud files. Device files are under Artifacts.');
          return;
        }
        setLibraryInitialQuery('');
        setActivePanel('library');
        return;
      }
      if (view === 'tasks') {
        if (privacyMode === 'local') {
          setActivePanel('agent-tasks');
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
      if (view === 'code') {
        if (privacyMode !== 'local') {
          toast.info('The code workspace edits device files and is available in Local mode.');
          return;
        }
        setActivePanel('code');
        return;
      }
      if (view === 'design') {
        if (privacyMode !== 'local') {
          toast.info(
            'The design board keeps sketches on this device and is available in Local mode.',
          );
          return;
        }
        setActivePanel('design');
        return;
      }
      if (view === 'research') {
        if (privacyMode !== 'local') {
          toast.info('Deep research runs on this device and is available in Local mode.');
          return;
        }
        setActivePanel('research');
        return;
      }
      if (view === 'automation') {
        if (privacyMode !== 'local') {
          toast.info('Automations run on this device and are available in Local mode.');
          return;
        }
        setActivePanel('automation');
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
          activeView={activePanel}
          onOpenAccountMenu={() => setAccountMenuOpen((o) => !o)}
          accountMenuOpen={accountMenuOpen}
          onJumpConversation={(id) => {
            setActivePanel('chat');
            hostBridge?.selectConversation?.(id);
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {activePanel === 'chat' ? (
              <ChatInterface
                key={composerTrustBoundaryKey}
                runtime={runtime}
                className="h-full w-full"
                externalSendRequest={externalSendRequest}
                manageTheme={false}
                enableShortcuts={true}
                hostBridge={hostBridge}
                onModelSelectorClick={isManagedCloud ? undefined : onModelSelectorClick}
                allowModelFallbackModels={!isManagedCloud}
                conversationActions={conversationActions}
                deriveMessageArtifacts={deriveDesktopMessageArtifacts}
                onSelectFolder={folderSeamEnabled ? handleSelectFolder : undefined}
                pendingAttachments={activePendingAttachments}
                attachmentContextKey={composerAttachmentOwnerKey}
                voiceInputController={isManagedCloud ? cloudVoice.controller : undefined}
                onRecordSkill={
                  privacyMode === 'local' ? () => setActivePanel('record-skill') : undefined
                }
                currentFolderLabel={folderSeamEnabled ? currentFolderLabel : null}
                onClearFolder={folderSeamEnabled ? clearFolder : undefined}
                projectPicker={composerProjectPicker}
                onSubmitGoal={canUseAgiWork ? handleSubmitChatGoal : undefined}
                canUseAgiWork={canUseAgiWork}
                agiWorkUnavailableReason={agiWorkUnavailableReason}
                composerHostControls={
                  <ComposerContextControls
                    mode={privacyMode}
                    folderPath={currentFolderPath}
                    folderLabel={folderSeamEnabled ? currentFolderLabel : null}
                    onSelectFolder={folderSeamEnabled ? handleSelectFolder : undefined}
                  />
                }
                skills={managedSkills}
                suggestSkills={isManagedCloud ? undefined : suggestLocalSkills}
                composerSendShortcut={composerSendShortcut}
                composerEditorMode={composerEditorMode}
                onNavigateView={handleNavigateView}
                sidebarSlot={null}
                emptyStateSlot={
                  <EmptyChat
                    workspaceLabel={folderSeamEnabled ? currentFolderLabel : null}
                    onSelectWorkspace={folderSeamEnabled ? handleSelectFolder : undefined}
                    onOpenScheduled={() => handleNavigateView('work-scheduled')}
                    onSetUpLocalModel={isManagedCloud ? undefined : onModelSelectorClick}
                    needsLocalModelSetup={needsLocalModelSetup}
                    onOpenConnectors={() => handleNavigateView('connectors')}
                    hasConnectedTools={hasConnectedTools}
                  />
                }
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
              <div data-testid="desktop-library" className="h-full overflow-y-auto px-6 py-6">
                <Suspense fallback={panelFallback}>
                  <DesktopLibrary
                    initialQuery={libraryInitialQuery}
                    onStartChat={() => handleNewChat()}
                  />
                </Suspense>
              </div>
            ) : activePanel === 'tasks' && privacyMode !== 'local' ? (
              <div data-testid="desktop-tasks" className="h-full overflow-y-auto">
                <Suspense fallback={panelFallback}>
                  <DesktopTasks
                    onOpenConversation={handleOpenProjectConversation}
                    onStartChat={() => handleNewChat()}
                  />
                </Suspense>
              </div>
            ) : activePanel === 'agent-tasks' && privacyMode === 'local' ? (
              <div data-testid="desktop-agent-tasks" className="h-full overflow-y-auto">
                <Suspense fallback={panelFallback}>
                  <DesktopAgentTasks />
                </Suspense>
              </div>
            ) : activePanel === 'cloud-schedules' && privacyMode === 'managed' ? (
              <Suspense fallback={panelFallback}>
                <DesktopCloudSchedules />
              </Suspense>
            ) : activePanel === 'artifacts' && privacyMode === 'local' ? (
              <AgiWorkArtifacts onNewChat={() => handleNewChat()} />
            ) : activePanel === 'code' && privacyMode === 'local' ? (
              <div className="h-full p-3">
                <Suspense fallback={panelFallback}>
                  <CodeWorkspace />
                </Suspense>
              </div>
            ) : activePanel === 'design' && privacyMode === 'local' ? (
              <div className="h-full p-3">
                <Suspense fallback={panelFallback}>
                  <CanvasWorkspace />
                </Suspense>
              </div>
            ) : activePanel === 'research' && privacyMode === 'local' ? (
              <div data-testid="desktop-research" className="h-full">
                <Suspense fallback={panelFallback}>
                  <DeepResearchPage />
                </Suspense>
              </div>
            ) : activePanel === 'automation' && privacyMode === 'local' ? (
              <div data-testid="desktop-automation" className="h-full overflow-y-auto">
                <Suspense fallback={panelFallback}>
                  <AutomationBuilder />
                </Suspense>
              </div>
            ) : activePanel === 'scheduled' && privacyMode === 'local' ? (
              <AgiWorkScheduled />
            ) : (
              <AgiWorkProjects
                onCreateProject={handleCreateProject}
                onNewChat={(projectId) => handleNewChat(projectId)}
                onOpenConversation={handleOpenProjectConversation}
              />
            )}
            <CapModal onSwitchModel={handleSwitchModel} />

            {/* Artifact viewer panel, mounts when the artifact store requests it open.
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
                {artifactDraft ? (
                  <ArtifactDraftView
                    draft={artifactDraft}
                    onClose={() => discardArtifactDraft(artifactDraft.key)}
                  />
                ) : (
                  <ArtifactPanel onClose={closeArtifactPanel} />
                )}
              </div>
            )}
            <SelectedContextReview onAccept={handleSelectedContextAccept} />
            <CloudFolderAttachSheet
              folderPath={cloudFolderSelection?.path ?? null}
              folderGrantId={cloudFolderSelection?.grantId ?? null}
              sourceSessionId={activeCloudConversationId ?? 'new-conversation'}
              managedBoundaryActive={cloudFolderBoundaryActive}
              onClose={() => setCloudFolderSelection(null)}
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
              action={
                cloudVoice.pendingAction ??
                (cloudVoice.isDesktopActionActive
                  ? 'A previous desktop-control action still needs to be confirmed stopped.'
                  : null)
              }
              approval={cloudVoice.pendingApproval}
              isPaused={cloudVoice.pausedConfirmation !== null}
              isResolvingConfirmation={cloudVoice.isResolvingConfirmation}
              error={cloudVoice.error}
              isExecuting={cloudVoice.isDesktopActionActive}
              isStopping={cloudVoice.isStopping}
              isRecovery={cloudVoice.pendingAction === null && cloudVoice.isDesktopActionActive}
              requiresComputerUseConsent={cloudVoice.requiresComputerUseConsent}
              onApprove={() => void cloudVoice.approveAction()}
              onUseAsText={cloudVoice.useActionAsText}
              onCancel={cloudVoice.cancelAction}
              onApproveStep={(remember) => void cloudVoice.approvePausedStep(remember)}
              onDenyStep={() => void cloudVoice.denyPausedStep()}
            />
            <ComputerUseConsentDialog
              open={cloudVoice.consentPromptOpen}
              onOpenChange={(open) => {
                if (!open) cloudVoice.dismissComputerUseConsent();
              }}
              onAccept={() => void cloudVoice.acceptComputerUseConsent()}
            />
            <McpToolConfirmationPrompt />
          </div>

          {privacyMode === 'local' && (
            <>
              {terminalDockOpen && (
                <div className="relative h-80 shrink-0 border-t border-[var(--chat-border)] bg-background">
                  <Suspense fallback={panelFallback}>
                    <DesktopTerminalWorkspace />
                  </Suspense>
                  <button
                    type="button"
                    onClick={() => setTerminalDockOpen(false)}
                    className="absolute right-2 top-2 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Close terminal dock"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              {!terminalDockOpen && (
                <div className="flex h-9 shrink-0 items-center border-t border-[var(--chat-border)] px-3">
                  <button
                    type="button"
                    onClick={() => setTerminalDockOpen(true)}
                    className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
                  >
                    <TerminalIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    Open terminal
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/*
          Live execution sidecar: timeline, screen view, terminal, and, most
          importantly, approval prompts. It self-gates on `isOpen` and takes no
          props, so mounting it here is the whole wiring. Before this, a running
          agent produced no visual feedback at all and a `tool_execution`
          approval had nowhere to render.
        */}
        <ExecutionSidecar />
      </div>
    </CapabilityProvider>
  );
}
