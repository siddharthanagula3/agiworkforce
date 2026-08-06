import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { Loader2, Terminal as TerminalIcon, X } from 'lucide-react';
import { updateCloudConversationTitle } from '@/api/cloudApi';
import {
  ChatInterface,
  CapabilityProvider,
  type ChatHostBridge,
  type ChatInterfaceProps,
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
// Library is the Managed Cloud counterpart to Local's Artifacts: cloud-stored
// files, shared with web through @agiworkforce/unified-chat.
const DesktopLibrary = lazy(() => import('@/features/library/DesktopLibrary'));
// Durable Cloud agent runs — the same list web shows at /tasks.
const DesktopTasks = lazy(() => import('@/features/tasks/DesktopTasks'));
// Device-owned agent goals. This panel owns auto/sequential/parallel/swarm
// submission and the live decomposed-task monitor for Local/BYOK sessions.
const DesktopAgentTasks = lazy(() =>
  import('@/features/agi/AgentTaskPanel').then((module) => ({
    default: module.AgentTaskPanel,
  })),
);
// Account-owned schedules that continue to run after Desktop closes.
const DesktopCloudSchedules = lazy(() => import('@/features/schedules/DesktopCloudSchedules'));
// Device filesystem editor. Local-only: it reads and writes real files through
// the native FS, so it must never render over a Managed Cloud session.
const CodeWorkspace = lazy(() =>
  import('@/features/code/CodeWorkspace').then((module) => ({
    default: module.CodeWorkspace,
  })),
);
// Freehand design board. Local-only: CAP-051 ships session-only (the board
// lives in React state on the device and is never uploaded), so it belongs on
// the same device trust boundary as the code workspace.
const CanvasWorkspace = lazy(() =>
  import('@/features/canvas/CanvasWorkspace').then((module) => ({
    default: module.CanvasWorkspace,
  })),
);
// Deep research. Local-only: `useResearchStore.startResearch` invokes the
// native `research_start` command (stores/researchStore.ts), which runs the
// on-device swarm orchestrator in src-tauri/src/core/research. Nothing here
// touches the managed cloud research route.
const DeepResearchPage = lazy(() =>
  import('@/features/research/DeepResearchPage').then((module) => ({
    default: module.DeepResearchPage,
  })),
);
const DesktopTerminalWorkspace = lazy(() =>
  import('@/features/terminal/TerminalWorkspace').then((module) => ({
    default: module.TerminalWorkspace,
  })),
);
import { useArtifactStore } from '../../stores/artifactStore';
import { useChatStore } from '../../stores/chat';
import { useProjectStore } from '../../stores/projectStore';
import { useSettingsStore } from '../../stores/settingsStore';
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
import {
  canUseDesktopCloudAgiWork,
  canUseDesktopCloudImageGeneration,
} from '../../services/desktopCloudEntitlements';
import { CloudVoiceActionDialog } from '../voice/CloudVoiceActionDialog';
import { useCloudVoiceController } from '../voice/useCloudVoiceController';
import { createDesktopCloudShare } from '../../services/desktopCloudShares';
import { deriveDesktopMessageArtifacts } from '../../runtime/desktopArtifactProjection';
import { McpToolConfirmationPrompt } from '../chat/McpToolConfirmationPrompt';
import { ComposerContextControls } from './ComposerContextControls';

// ─── share payload helpers ───────────────────────────────────────────────────

/**
 * Read a message's routing provenance from either shape the shared transcript
 * carries it in: the typed top-level field (`mapPersistedCloudMessage` writes
 * `model`/`provider` there when a Cloud conversation is restored) or the
 * generic `metadata` bag (host-mirrored and surface-specific rows).
 */
function readMessageOrigin(message: ChatMessage, key: 'model' | 'provider'): string | undefined {
  const direct = message[key];
  if (typeof direct === 'string' && direct.trim().length > 0) return direct;
  const fromMetadata = message.metadata?.[key];
  return typeof fromMetadata === 'string' && fromMetadata.trim().length > 0
    ? fromMetadata
    : undefined;
}

/**
 * `/api/share` requires an ISO-8601 UTC `created_at` per message. Restored
 * Cloud rows carry `createdAt`; live rows carry the deprecated `timestamp`.
 * Both are already ISO strings, so this only normalizes and guards the shape —
 * it never invents an ordering the transcript does not have.
 */
function shareTimestamp(message: ChatMessage): string {
  const raw = message.createdAt ?? message.timestamp;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime())
    ? parsed.toISOString()
    : new Date(0).toISOString();
}

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
  | 'code'
  | 'design'
  | 'research'
  | 'library'
  | 'tasks'
  | 'agent-tasks'
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
/**
 * Lazy panels used to suspend with `fallback={null}`, leaving the content
 * area a blank void for the chunk-load window (the WDIO sweep screenshotted
 * exactly that on the Tasks panel). A visible spinner keeps every panel
 * honest while it loads.
 */
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
  onBuyTopUp,
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

  // Artifact panel is driven by the same artifactStore that AgiWorkArtifacts writes.
  // conversationId is optional on ArtifactPanel so it works in the gallery context.
  const artifactPanelOpen = useArtifactStore((s) => s.panelOpen);
  const closeArtifactPanel = useArtifactStore((s) => s.closePanel);
  // Progressive preview of a `create_artifact` tool call whose arguments are
  // still streaming. Display only — it is replaced by the real artifact as soon
  // as `chat:artifact` lands (runtime/TauriRuntime.ts).
  const artifactDraft = useArtifactStore((s) => s.draft);
  const discardArtifactDraft = useArtifactStore((s) => s.discardArtifactDraft);
  // The folder seam is available in BOTH Local and Managed Cloud, but they mean
  // different things. Local grants the folder as a working scope (a persistent
  // capability — see useFolderSelection's docstring). Cloud receives only an
  // opaque, native-owned grant, and any file that leaves the device does so
  // through the composer attachment path after an explicit consent ceremony.
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
  const cloudVoice = useCloudVoiceController(isManagedCloud);
  const canUseAgiWork = !isManagedCloud || canUseDesktopCloudAgiWork(accountPlan);
  const quickChipAvailability = isManagedCloud
    ? { image: canUseDesktopCloudImageGeneration(accountPlan) }
    : undefined;
  const composerSendShortcut = useSettingsStore(
    (state) => state.chatPreferences.sendShortcut ?? 'enter',
  );

  // Cloud folder flow: picking a folder opens the consent sheet rather than
  // scoping the session. Approved files are injected into the composer as an
  // ordinary attachment set, keyed so a re-render cannot double-append.
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

    // The native picker can remain open while the user changes workspace or
    // signs out. Re-read both stores after it resolves so a stale closure never
    // opens a Cloud consent sheet under a boundary that no longer exists.
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
      // The picker outlived the Cloud/account boundary that opened it.
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

  // A selection owns exactly one native capability. Closing, replacing,
  // switching mode/account, and unmounting all run this cleanup.
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
      [
        'artifacts',
        'code',
        'design',
        'research',
        'scheduled',
        'record-skill',
        'agent-tasks',
      ].includes(activePanel)
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

  // DES-C07: Share used to read `messagesByConversation` off the LEGACY desktop
  // chat store, which nothing hydrates for a Cloud conversation reopened from
  // history — `loadConversationMessages` has no production caller, and
  // `selectConversation` only reads that cache. The transcript the user is
  // actually looking at is loaded into the shared unified-chat store by
  // `ChatInterface` via `CloudRuntime.getMessages`. Sourcing the payload from
  // the legacy store therefore made Share a dead control on every reopened
  // Cloud chat: it reported "Add a message before sharing" and created nothing.
  // Read the store that owns the rendered transcript instead, exactly as web's
  // `use-share-conversation` reads the store its renderer draws from.
  const handleShareConversation = useCallback(
    async (conversationId: string) => {
      if (privacyMode !== 'managed') return;
      const state = useSharedChatStore.getState();
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      // An assistant row exists from the first token onward and is empty until
      // one arrives; a persisted empty turn restores as '' too. Neither belongs
      // in a published transcript, and neither should make Share look alive.
      const messages = (state.messagesByConversation[conversationId] ?? []).filter(
        (message) => message.content.trim().length > 0,
      );
      if (messages.length === 0) {
        toast.info('Add a message before sharing this conversation.');
        return;
      }
      // Restored Cloud messages carry model/provider at the top level
      // (`mapPersistedCloudMessage`); host-mirrored ones can carry them in the
      // generic metadata bag. Read both rather than assuming one shape.
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
          // `Conversation.model` on the shared store is the host's
          // `modelOverride` (see App.tsx's ChatHostBridge.getSnapshot), so the
          // pinned model still wins over the last message's model.
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
                onModelSelectorClick={onModelSelectorClick}
                // Managed Cloud model availability is server-authoritative.
                // An empty catalog is an error/empty state, never permission to
                // resurrect the shared component's static fallback roster.
                allowModelFallbackModels={!isManagedCloud}
                conversationActions={conversationActions}
                // DES-C05: Cloud (and Local) answers containing a renderable
                // fenced block become real artifacts, with the same canonical,
                // id-stable derivation web and mobile use. Without this the
                // desktop transcript can only show artifacts a runtime
                // pre-attached — which, on the managed cloud wire, is never.
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
                canUseAgiWork={canUseAgiWork}
                quickChipAvailability={quickChipAvailability}
                composerHostControls={
                  <ComposerContextControls
                    mode={privacyMode}
                    folderPath={currentFolderPath}
                    folderLabel={folderSeamEnabled ? currentFolderLabel : null}
                    onSelectFolder={folderSeamEnabled ? handleSelectFolder : undefined}
                  />
                }
                composerSendShortcut={composerSendShortcut}
                onNavigateView={handleNavigateView}
                sidebarSlot={null}
                emptyStateSlot={
                  <EmptyChat
                    workspaceLabel={folderSeamEnabled ? currentFolderLabel : null}
                    onSelectWorkspace={folderSeamEnabled ? handleSelectFolder : undefined}
                    onOpenScheduled={() => handleNavigateView('work-scheduled')}
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
              // The shell clips overflow, so the panel owns its own scrolling or
              // a long grid is simply unreachable.
              <div data-testid="desktop-library" className="h-full overflow-y-auto px-6 py-6">
                <Suspense fallback={panelFallback}>
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
              error={cloudVoice.error}
              isExecuting={cloudVoice.isDesktopActionActive}
              isStopping={cloudVoice.isStopping}
              isRecovery={cloudVoice.pendingAction === null && cloudVoice.isDesktopActionActive}
              requiresComputerUseConsent={cloudVoice.requiresComputerUseConsent}
              onApprove={() => void cloudVoice.approveAction()}
              onUseAsText={cloudVoice.useActionAsText}
              onCancel={cloudVoice.cancelAction}
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
      </div>
    </CapabilityProvider>
  );
}
