'use client';

import { SshConnectionControl } from './components/SshConnectionControl';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/identity/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Code2,
  PanelLeft,
  PanelsTopLeft,
  RefreshCw,
  Search,
  TerminalSquare,
  TriangleAlert,
  X,
} from '@agiworkforce/icons';
import { Sheet, SheetContent, SheetTitle, Spinner, useConfirmAction } from '@agiworkforce/ui';
import type {
  CloudCodeAvailability,
  CloudCodeRuntime,
  CloudCodeSession,
  CloudCodeShareVisibility,
  CloudCodeTerminalEntry,
  CloudCodeTurnMode,
} from '@agiworkforce/types';
import {
  agiCodeMinimumPlan,
  CLOUD_CODE_DEFAULT_TURN_MODE,
  CLOUD_CODE_SESSION_READY_POLLS,
  CLOUD_CODE_SESSION_READY_POLL_INTERVAL_MS,
  cloudCodeStopReasonIsRetryable,
  getBillingPlanPricing,
  normalizeBillingPlanTier,
  NOTEBOOK_TEMPLATE_ID,
  resolveCloudCodeAgentModel,
} from '@agiworkforce/types';
import {
  buildCodeTranscript,
  CloudCodeApiError,
  toCodeTurnRecord,
  type CloudCodeAgentTurn,
  type CloudCodeApi,
  type CloudCodeChanges,
  type CodeApprovalPrompt,
  type CodeTurnRecord,
} from '@agiworkforce/cloud-contracts';
import { isImeComposingKey } from '@agiworkforce/unified-chat/ime-composition';
import { SEARCH_INPUT_DEBOUNCE_MS } from '@agiworkforce/utils';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { useShellLayout } from '@shared/components/layout/app-shell-layout';
import { useGuardedRouter } from '@shared/hooks/use-guarded-router';
import { emitAppCommand, onAppCommand, openUpgrade } from '@shared/lib/app-commands';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { useGreeting } from '@features/chat/components/GreetingBanner/useGreeting';
import { useModelStore } from '@shared/stores/model-store';
import { getModelMetadata } from '@shared/config/llm';
import { toUserMessage } from '@/lib/user-error-message';
import { GITHUB_RECONNECT_REQUIRED_REASON } from '@/lib/github-installation-access';
import { NotebookPanel } from '@/features/notebook/NotebookPanel';
import { useNotebookWorkspace } from '@/features/notebook/hooks/useNotebookWorkspace';
import { useCloudCodeAuthority } from './hooks/use-cloud-code-authority';
import {
  runCloudCodeBackgroundTurn,
  useCloudCodeBackgroundTurns,
} from './services/cloud-code-background-turns';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import {
  canonicalGitHubRepositoryBranch,
  canonicalGitHubRepositoryUrl,
} from '@agiworkforce/cloud-contracts';
import { getGitHubCallbackNotice } from '@/features/connectors/lib/github-callback-notice';
import {
  CODE_COPY,
  CODE_LIMITS,
  CODE_MISSING_SESSION_PARAM,
  CODE_ROUTES,
  CODE_SIZES,
  codeHomeAfterMissingSession,
  codeSessionPath,
  DEFAULT_CODE_FILTERS,
  DEFAULT_RUNTIME_ID,
  type CodeStatusFilter,
  filterAndSortSessions,
  githubInstallHref,
  parseExtraHosts,
  REPOSITORY_MINIMUM_NETWORK_ACCESS,
  sessionContextChip,
  sessionTitleMatches,
  type CodeSessionFilters,
} from './code-surface';
import { harnessModelChoices } from './code-runtime';
import {
  approvedRootId,
  localSessionFromSearch,
  localSessionPath,
  type DeveloperSessionGroup,
  type LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import type { ThreadDeleteResponse } from '@agiworkforce/types/protocol';
import {
  ContinueOnDesktop,
  deleteDeveloperThread,
  listDeveloperModels,
  listDeveloperSessions,
  lookupDeveloperSession,
  startDeveloperTurn,
  useDesktopHost,
  useLocalModeHost,
} from '@/features/desktop-host';
import { helpArticlePath } from '@/lib/support/help-paths';
import { LOCAL_MODELS_SETTINGS_SECTION } from '@/features/settings/lib/web-settings-sections';
import {
  LOCAL_CODE_COPY,
  LOCAL_PANEL_COPY,
  LOCAL_FALLBACK_AGENT_MODE,
  LOCAL_MODELS_HELP_ARTICLE,
  localCloudModelsPlanLine,
  localDiscardArchivesConsequence,
  localDraftNeedsPlan,
  localFolderChoice,
  localFolderChoices,
  localModelChoices,
  localModelSetup,
  localProviderSetups,
  localRouteCommandAccessGroup,
  localSessionArchivedLine,
  localSessionDeletedLine,
  localWorktreeRemovedLine,
  planStartingModelId,
  preferredLocalRootId,
  resolveLocalRoute,
  startingModelId,
  type LocalPlacement,
} from './local-code';
import { useLocalSessions } from './hooks/use-local-sessions';
import { codeImageDataUrl } from './hooks/use-code-images';
import { forgetLocalSession } from './local-session-memory';
import { LocalSessionsSection } from './components/LocalSessionsSection';
import { LocalSessionPanel, type LocalOpeningPrompt } from './components/LocalSessionPanel';
import { WorkspaceTerminalDocks, useWorkspaceTerminalDocks } from './components/LocalTerminal';
import { useShowTerminal } from './use-show-terminal';
import { LocalListNotice } from './components/LocalListNotice';
import { CodeRail } from './components/CodeRail';
import {
  CodeComposer,
  EMPTY_CODE_DRAFT,
  type CodeDraft,
  type CodeLocalState,
  type CodeRepositoryEntry,
} from './components/CodeComposer';
import { CodeTranscript } from './components/CodeTranscript';
import { CodeChangesPanel } from './components/CodeChangesPanel';
import { securityScanPagePath } from '@/features/security-scan/routes';
import { CodeSessionMenu } from './components/CodeSessionMenu';
import { CodeShareDialog } from './components/CodeShareDialog';
import { CodePageFrame, CodePaneTools, type CodePaneControls } from './components/CodePanes';
import { useCodePanes } from './hooks/use-code-panes';
import { useCodeFirstRun } from './hooks/use-code-first-run';
import { CodeFirstRunWizard } from './components/CodeFirstRunWizard';
import { CodeUsageDashboard } from './components/CodeUsageDashboard';
import {
  CodeDraftSidePanel,
  useCodeSideTools,
  type DraftSideTool,
} from './components/CodeDraftSidePanel';
import styles from './CloudCodePage.module.css';
import { CodeComposerDraftProvider, useCodeComposerDrafts } from './CodeComposerDrafts';

const HEADER_GLYPH_SIZE = 16;
const NOTICE_GLYPH_SIZE = 16;
const DEFAULT_SESSION_TITLE_WORDS = 6;
const GREETING_MARK_SIZE = 28;
const CODE_RAIL_DRAWER_ID = 'code-rail-drawer';
const GREETING_NAME_SLOT = '{name}';
const UPGRADE_PLAN_SLOT = '{plan}';
const UPGRADE_PATH = '/upgrade';
const DOCUMENT_TITLE_SEPARATOR = ' · ';
const MISSING_SESSION_STATUSES = new Set([403, 404]);
const ACTIVE_CLOUD_TURN_POLL_INTERVAL_MS = 4_000;
const TRANSCRIPT_FOLLOW_DISTANCE_PX = 48;
const RENAME_COMMIT_KEY = 'Enter';
const RENAME_CANCEL_KEY = 'Escape';

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `code_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

// Named friendly but returning error.message verbatim: with a 500 carrying
// "upstream exploded: trace 0xdeadbeef" that string rendered on the page.
// toUserMessage keeps a sentence somebody wrote and drops operator detail.
function friendlyError(error: unknown): string {
  return toUserMessage(error, CODE_COPY.loadFailed);
}

function requiresGitHubReconnect(error: unknown): boolean {
  return error instanceof CloudCodeApiError && error.code === GITHUB_RECONNECT_REQUIRED_REASON;
}

function titleFromTask(task: string): string {
  const words = task.trim().split(/\s+/).slice(0, DEFAULT_SESSION_TITLE_WORDS).join(' ');
  return words.length > 0 ? words : CODE_COPY.surface;
}

function selectionForCreate(
  draft: CodeDraft,
  entry: CodeRepositoryEntry | null,
): { error: string } | { patch: Partial<CodeDraft> } {
  const typed = entry?.url.trim() ?? '';
  if (!typed) return { patch: {} };
  const parsed = canonicalGitHubRepositoryUrl(typed);
  if (!parsed.ok) return { error: CODE_COPY.repositoryUrlInvalid };
  const branch = canonicalGitHubRepositoryBranch(entry?.branch ?? '');
  if (!branch.ok) return { error: CODE_COPY.repositoryBranchInvalid };
  return {
    patch: {
      repository: null,
      repositoryUrl: parsed.url,
      repositoryBranch: branch.branch ?? '',
      ...(draft.networkAccess === 'none'
        ? { networkAccess: REPOSITORY_MINIMUM_NETWORK_ACCESS }
        : {}),
    },
  };
}

export interface CloudCodePageProps {
  api?: CloudCodeApi;
  /** The session in the URL. Absent on the surface root, which is the home. */
  sessionId?: string;
  pane?: CodePaneControls;
}

export function CloudCodePage(props: CloudCodePageProps) {
  const { isLoaded, isSignedIn, userId, sessionId } = useSession();
  return (
    <CodeComposerDraftProvider>
      <OwnedCloudCodePage key={`${isLoaded}:${isSignedIn}:${userId}:${sessionId}`} {...props} />
    </CodeComposerDraftProvider>
  );
}

function OwnedCloudCodePage({ api: injectedApi, sessionId, pane }: CloudCodePageProps) {
  const { api, backgroundApi, capture } = useCloudCodeAuthority(injectedApi);
  const sessionSnapshot = useSessionSnapshot();
  const notebookWorkspace = useNotebookWorkspace();
  const paneRef = useRef(pane);
  paneRef.current = pane;
  const [availability, setAvailability] = useState<CloudCodeAvailability | null>(null);
  const [runtimes, setRuntimes] = useState<CloudCodeRuntime[]>([]);
  const [sessions, setSessions] = useState<CloudCodeSession[]>(
    pane?.initialSession ? [pane.initialSession] : [],
  );
  const [selectedId, publishSelectedId] = useState<string | null>(sessionId ?? null);
  const [entries, setEntries] = useState<CloudCodeTerminalEntry[]>([]);
  const [turns, setTurns] = useState<CodeTurnRecord[]>([]);
  const [truncatedSessionId, setTruncatedSessionId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<CodeApprovalPrompt[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStartError, setLocalStartError] = useState<{
    rootId: string;
    message: string;
  } | null>(null);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<CodeDraft>(EMPTY_CODE_DRAFT);
  const { drafts, setDraftText } = useCodeComposerDrafts();
  const task = drafts.get(selectedId) ?? '';
  const setTask = useCallback(
    (text: string) => setDraftText(selectedId, text),
    [selectedId, setDraftText],
  );
  const [turnMode, setTurnMode] = useState<CloudCodeTurnMode>(CLOUD_CODE_DEFAULT_TURN_MODE);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitNotice, setCommitNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<CodeSessionFilters>(DEFAULT_CODE_FILTERS);
  const statusFilter: CodeStatusFilter = filters.status;
  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesWide, setChangesWide] = useState(false);
  const [changes, setChanges] = useState<CloudCodeChanges | null>(null);
  const [changesLoading, setChangesLoading] = useState(false);
  const [pullRequestBusy, setPullRequestBusy] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [busySince, setBusySince] = useState<string | null>(null);
  const [turnRunning, setTurnRunning] = useState(false);
  const [stopRequested, setStopping] = useState(false);
  const stopLock = useRef<symbol | null>(null);
  const [observedTurn, setObservedTurn] = useState<{
    sessionId: string;
    turnId: string;
    startedAt: string;
    cancelRequestedAt: string | null;
  } | null>(null);
  const [hiddenSessionsExist, setHiddenSessionsExist] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [hintDismissed, setHintDismissed] = useState(false);
  const [railDrawerOpen, setRailDrawerOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const collapseRailRef = useRef<HTMLButtonElement>(null);
  const expandRailRef = useRef<HTMLButtonElement>(null);
  const restoreRailToggleFocus = useRef(false);
  useEffect(() => {
    if (!restoreRailToggleFocus.current) return;
    restoreRailToggleFocus.current = false;
    (railCollapsed ? expandRailRef : collapseRailRef).current?.focus();
  }, [railCollapsed]);
  const [narrow, setNarrow] = useState(false);
  const [draftSideTool, setDraftSideTool] = useState<DraftSideTool | null>(null);
  const lastDraftSideTool = useRef<DraftSideTool>('launcher');
  const [draftSideExpanded, setDraftSideExpanded] = useState(false);
  const terminals = useWorkspaceTerminalDocks();
  const toggleSessionRail = useCallback(() => {
    if (narrow) {
      setRailDrawerOpen((open) => !open);
    } else {
      restoreRailToggleFocus.current = true;
      setRailCollapsed((collapsed) => !collapsed);
    }
  }, [narrow]);
  const phone = useShellLayout().tier === 'compact';
  const [localEditorDirty, setLocalEditorDirty] = useState(false);
  const [localSession, publishLocalSession] = useState<LocalDeveloperSession | null>(null);
  const [localPrompt, setLocalPrompt] = useState<
    (LocalOpeningPrompt & { sessionId: string }) | null
  >(null);
  const [localPlacement, setLocalPlacement] = useState<LocalPlacement>('local');
  const [localDeletion, setLocalDeletion] = useState<{
    rootId: string;
    threadId: string;
    outcome: ThreadDeleteResponse;
  } | null>(null);
  const [localArchivedThread, setLocalArchivedThread] = useState<string | null>(null);
  const [localWorktreeRemovedRef, setLocalWorktreeRemovedRef] = useState<string | null>(null);
  const submitLock = useRef<symbol | null>(null);
  const followTranscript = useRef(true);
  const selectionRevision = useRef(0);
  const draftRevision = useRef(0);
  const selectionRef = useRef<string | null>(sessionId ?? null);
  const localSelectionRef = useRef<LocalDeveloperSession | null>(null);
  const observedRoute = useRef(sessionId);
  if (observedRoute.current !== sessionId) {
    observedRoute.current = sessionId;
    if (selectionRef.current !== (sessionId ?? null)) selectionRevision.current += 1;
  }
  const resetSelectionWork = useCallback(() => {
    submitLock.current = null;
    stopLock.current = null;
    followTranscript.current = true;
    setBusy(false);
    setBusySince(null);
    setTurnRunning(false);
    setStopping(false);
    setObservedTurn(null);
    setRunning(false);
    setCommitting(false);
    setPullRequestBusy(false);
    setChangesLoading(false);
    setDetailLoading(false);
    setApprovals([]);
    setShareOpen(false);
    setRenaming(false);
    setEntries([]);
  }, []);
  const setSelectedId = useCallback(
    (id: string | null) => {
      if (selectionRef.current !== id) {
        selectionRevision.current += 1;
        selectionRef.current = id;
        resetSelectionWork();
      }
      publishSelectedId(id);
    },
    [resetSelectionWork],
  );
  const setLocalSession = useCallback(
    (next: LocalDeveloperSession | null) => {
      routeLocalRef.current = null;
      if (
        localSelectionRef.current?.rootId !== next?.rootId ||
        localSelectionRef.current?.id !== next?.id
      ) {
        selectionRevision.current += 1;
        localSelectionRef.current = next;
        resetSelectionWork();
      }
      publishLocalSession(next);
    },
    [resetSelectionWork],
  );
  const renderedSelectionRevision = selectionRevision.current;
  const captureView = useCallback(
    (includeDraft = false) => {
      const accountCurrent = capture();
      const routeReady = routeSessionRef.current === (sessionId ?? null);
      let revision = renderedSelectionRevision;
      const draftAtStart = draftRevision.current;
      const isSelected = () =>
        routeReady && accountCurrent() && revision === selectionRevision.current;
      const isCurrent = () =>
        isSelected() && (!includeDraft || draftAtStart === draftRevision.current);
      return {
        accountCurrent,
        isCurrent,
        isSelected,
        followSelection: () => {
          includeDraft = false;
        },
        select: (id: string) => {
          if (!isCurrent()) return false;
          const submission = submitLock.current;
          setSelectedId(id);
          submitLock.current = submission;
          revision = selectionRevision.current;
          return true;
        },
      };
    },
    [capture, renderedSelectionRevision, sessionId, setSelectedId],
  );
  const captureViewRef = useRef(captureView);
  captureViewRef.current = captureView;
  const listRevision = useRef(0);
  const changesRevision = useRef(0);
  const accountPlanTier = availability?.planTier ?? null;
  const local = useLocalSessions(accountPlanTier);
  const environmentChosen = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const sessionModelsRef = useRef<Record<string, string>>({});
  const railTriggerRef = useRef<HTMLButtonElement>(null);
  const hiddenProbeRef = useRef(false);
  const routeSessionRef = useRef<string | null>(sessionId ?? null);
  const routeWaitingNotice = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleEditedRef = useRef(false);

  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const { openSettings } = useSettingsModal();
  const routerRef = useRef(router);
  const searchParams = useSearchParams();
  const routeSearch = searchParams.toString();
  const localRoute = useMemo(
    () => (pane || sessionId ? null : localSessionFromSearch(routeSearch)),
    [pane, routeSearch, sessionId],
  );
  const routeLocalRef = useRef(localRoute);
  const githubNotice = searchParams.get('github');
  const { firstName, nameResolved } = useGreeting();
  const selectedModelId = useModelStore((state) => state.selectedModelId);
  const planTier = normalizeBillingPlanTier(availability?.planTier);
  const agentModel = useMemo(
    () => resolveCloudCodeAgentModel(selectedModelId, planTier),
    [selectedModelId, planTier],
  );
  const harnessModels = useMemo(
    () =>
      harnessModelChoices(
        runtimes.find((runtime) => runtime.id === draft.runtimeId) ?? null,
        planTier,
      ),
    [runtimes, draft.runtimeId, planTier],
  );
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const desktopHost = useDesktopHost();
  const localModeHost = useLocalModeHost();
  const firstRun = useCodeFirstRun(!pane && !sessionId && desktopHost === null, api, capture);
  useEffect(() => {
    routeLocalRef.current = localRoute;
  }, [localRoute]);

  useEffect(() => {
    if (pane || firstRun.state === 'checking' || firstRun.state === 'show') return;
    return onAppCommand('toggle-sidebar', toggleSessionRail);
  }, [firstRun.state, pane, toggleSessionRail]);

  const leaveLocalEdits = useCallback(
    (proceed: () => void) => {
      const leave = () => {
        setLocalEditorDirty(false);
        proceed();
      };
      if (!localEditorDirty) {
        leave();
        return;
      }
      confirm({
        title: LOCAL_CODE_COPY.discardEditsTitle,
        description: LOCAL_CODE_COPY.discardLocalEditsDescription,
        confirmLabel: LOCAL_CODE_COPY.discardFileEdits,
        onConfirm: leave,
      });
    },
    [confirm, localEditorDirty],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(`(max-width: ${CODE_SIZES.narrowViewport}px)`);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined' || paneRef.current) return;
    if (!new URLSearchParams(window.location.search).has(CODE_MISSING_SESSION_PARAM)) return;
    setRouteNotice(CODE_COPY.sessionNotFound);
    routerRef.current.replace(CODE_ROUTES.root);
  }, []);

  useEffect(() => {
    const next = sessionId ?? null;
    if (routeSessionRef.current === next) return;
    routeSessionRef.current = next;
    if (next !== null) {
      routeLocalRef.current = null;
      setRouteNotice(null);
    }
    if (selectionRef.current === next) return;
    setSelectedId(next);
    setTurns([]);
    setEntries([]);
    setChangesOpen(false);
    setChanges(null);
    setCommitNotice(null);
  }, [sessionId, setSelectedId]);

  const replaceSession = useCallback(
    (next: CloudCodeSession, owner: ReturnType<typeof captureView>) => {
      if (!owner.accountCurrent()) return;
      setSessions((current) => {
        const exists = current.some((session) => session.id === next.id);
        const updated = exists
          ? current.map((session) => (session.id === next.id ? next : session))
          : [next, ...current];
        return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      if (owner.isCurrent()) paneRef.current?.onSessionChange(next);
    },
    [],
  );

  const loadChanges = useCallback(
    async (sessionId: string, signal?: AbortSignal) => {
      const owner = captureView();
      if (!owner.isCurrent() || selectionRef.current !== sessionId) return;
      const request = ++changesRevision.current;
      const current = () =>
        owner.isCurrent() && !signal?.aborted && request === changesRevision.current;
      if (!current()) return;
      setChangesLoading(true);
      try {
        const body = await api.changes(sessionId, signal);
        replaceSession(body.session, owner);
        if (!current()) return;
        setChanges(body);
      } catch (changesError) {
        if (!current()) return;
        if (changesError instanceof DOMException && changesError.name === 'AbortError') return;
        setError(friendlyError(changesError));
      } finally {
        if (current()) setChangesLoading(false);
      }
    },
    [api, captureView, replaceSession],
  );

  const loadSessions = useCallback(
    async (status: CodeStatusFilter, signal?: AbortSignal, owner = captureViewRef.current()) => {
      if (status !== statusFilterRef.current) return;
      const accountCurrent = capture();
      const request = ++listRevision.current;
      const current = () =>
        accountCurrent() &&
        !signal?.aborted &&
        request === listRevision.current &&
        status === statusFilterRef.current;
      if (!current()) return;
      setPageLoading(true);
      if (owner.isCurrent()) setError(null);
      try {
        const body = await api.list(status, signal);
        if (!current()) return;
        setAvailability(body.availability);
        setRuntimes(body.runtimes);
        setSessions(body.sessions);
        setDraft((current) => ({
          ...current,
          runtimeId:
            current.runtimeId && body.runtimes.some((runtime) => runtime.id === current.runtimeId)
              ? current.runtimeId
              : DEFAULT_RUNTIME_ID,
        }));
      } catch (loadError) {
        if (!current()) return;
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        if (owner.isCurrent()) setError(friendlyError(loadError));
      } finally {
        if (current()) setPageLoading(false);
      }
    },
    [api, capture],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(statusFilter, controller.signal);
    return () => controller.abort();
  }, [loadSessions, statusFilter]);

  useEffect(() => {
    if (environmentChosen.current) return;
    const rootId = preferredLocalRootId(local.groups);
    if (rootId === null) return;
    draftRevision.current += 1;
    setDraft((current) => ({ ...current, environment: 'local', localRootId: rootId }));
  }, [local.groups]);

  const handleDraftChange = useCallback((patch: Partial<CodeDraft>) => {
    draftRevision.current += 1;
    if (patch.environment !== undefined) environmentChosen.current = true;
    if (patch.localRootId !== undefined || patch.environment !== undefined)
      setLocalStartError(null);
    setDraft((current) => ({
      ...current,
      ...(patch.localRootId !== undefined && patch.localRootId !== current.localRootId
        ? { localModelId: '' }
        : {}),
      ...patch,
    }));
  }, []);

  const draftGroup = local.groups.find((group) => group.rootId === draft.localRootId) ?? null;
  const commandAccessNoticeId = useId();
  const draftRuntime = draft.localRootId === null ? null : local.modelsFor(draft.localRootId);
  const localChoices = localModelChoices(draftRuntime, draftGroup?.sessions ?? [], accountPlanTier);
  const localModelId =
    draft.localModelId ||
    startingModelId(draftRuntime, draftGroup?.sessions ?? [], accountPlanTier) ||
    '';
  const localDraftPlanRequired = localDraftNeedsPlan(
    draftRuntime,
    localChoices,
    localModelId,
    accountPlanTier,
  );

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessions],
  );
  const backgroundTurns = useCloudCodeBackgroundTurns();
  const selectedBackgroundTurn = selectedId ? backgroundTurns.get(selectedId) : undefined;
  const activeStoredTurn = observedTurn?.sessionId === selectedId ? observedTurn : null;
  const localTurnPending = turnRunning || selectedBackgroundTurn !== undefined;
  const localTurnPendingRef = useRef(localTurnPending);
  localTurnPendingRef.current = localTurnPending;
  const selectedTurnRunning = localTurnPending || activeStoredTurn !== null;
  const stopping = stopRequested || Boolean(activeStoredTurn?.cancelRequestedAt);
  const runtimeRunsOwnAgent = useCallback(
    (runtimeId: string | null) =>
      runtimes.some((runtime) => runtime.id === runtimeId && runtime.runsOwnAgent === true),
    [runtimes],
  );
  const turnControls = !runtimeRunsOwnAgent(
    selectedSession ? selectedSession.runtimeId : draft.runtimeId || null,
  );

  const canCreate = availability?.deploymentEnabled === true && availability.planEntitled === true;
  const canRun = canCreate;

  useEffect(() => {
    if (!selectedId) {
      setEntries([]);
      return;
    }
    const controller = new AbortController();
    const owner = captureView();
    const current = () => owner.isCurrent() && !controller.signal.aborted;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;
    setDetailLoading(true);
    setError(null);
    const read = async (initial: boolean) => {
      try {
        if (!initial && localTurnPendingRef.current) return;
        const body = await api.get(selectedId, controller.signal);
        if (!current()) return;
        const latest = body.turns.at(-1);
        const active = latest?.stopReason === null ? latest : null;
        polling = active !== null;
        setObservedTurn(
          active && {
            sessionId: selectedId,
            turnId: active.turnId,
            startedAt: active.createdAt,
            cancelRequestedAt: active.cancelRequestedAt,
          },
        );
        replaceSession(body.session, owner);
        setEntries(body.terminalEntries);
        setTruncatedSessionId(body.turnsTruncated === true ? body.session.id : null);
        // Merge rather than replace: this read races the turn running in this
        // tab, and a response computed before that turn's row existed would
        // wipe it out of the transcript.
        setTurns((current) => {
          const stored = body.turns.map(toCodeTurnRecord);
          const storedIds = new Set(stored.map((record) => record.id));
          return [
            ...stored,
            ...current.filter((record) => !record.turnId || !storedIds.has(record.turnId)),
          ];
        });
      } catch (detailError) {
        if (!current()) return;
        if (detailError instanceof DOMException && detailError.name === 'AbortError') return;
        if (
          detailError instanceof CloudCodeApiError &&
          MISSING_SESSION_STATUSES.has(detailError.status)
        ) {
          polling = false;
          if (paneRef.current) {
            paneRef.current.onClose();
            return;
          }
          setSelectedId(null);
          setRouteNotice(CODE_COPY.sessionNotFound);
          routerRef.current.replace(codeHomeAfterMissingSession());
          return;
        }
        if (initial) setError(friendlyError(detailError));
      } finally {
        if (current()) {
          if (initial) setDetailLoading(false);
          if (polling)
            timer = setTimeout(() => void read(false), ACTIVE_CLOUD_TURN_POLL_INTERVAL_MS);
        }
      }
    };
    void read(true);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [api, captureView, replaceSession, selectedBackgroundTurn, selectedId, setSelectedId]);

  // Approvals outlive the tab that created them (the backend persists them with a
  // 30-minute expiry), so a reload or a session switch has to re-read them or a
  // half-finished agent turn becomes unresumable from the UI.
  useEffect(() => {
    setApprovals([]);
    if (!selectedId || !canRun) return;
    const controller = new AbortController();
    const owner = captureView();
    const current = () => owner.isCurrent() && !controller.signal.aborted;
    void api
      .listApprovals(selectedId, controller.signal)
      .then((value) => {
        if (current()) setApprovals(value);
      })
      .catch((approvalsError) => {
        if (!current()) return;
        if (approvalsError instanceof DOMException && approvalsError.name === 'AbortError') return;
        setError(friendlyError(approvalsError));
      });
    return () => controller.abort();
  }, [api, canRun, captureView, selectedBackgroundTurn, selectedId]);

  useEffect(() => {
    if (!selectedTurnRunning) {
      stopLock.current = null;
      setStopping(false);
    }
  }, [selectedTurnRunning]);

  useEffect(() => {
    if (!changesOpen || !selectedId) return;
    const controller = new AbortController();
    void loadChanges(selectedId, controller.signal);
    return () => controller.abort();
  }, [changesOpen, loadChanges, selectedId]);

  useEffect(() => {
    if (pageLoading || sessions.length > 0 || statusFilter !== 'open') return;
    if (hiddenProbeRef.current) return;
    hiddenProbeRef.current = true;
    const controller = new AbortController();
    const accountCurrent = capture();
    void Promise.resolve(api.list('all', controller.signal))
      .then((body) => {
        if (accountCurrent() && !controller.signal.aborted)
          setHiddenSessionsExist(body.sessions.length > 0);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      hiddenProbeRef.current = false;
    };
  }, [api, capture, pageLoading, sessions.length, statusFilter]);

  useEffect(() => {
    if (!renaming) return;
    titleEditedRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      if (!titleEditedRef.current) titleInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [renaming]);

  const transcript = useMemo(() => buildCodeTranscript(entries, turns), [entries, turns]);

  useEffect(() => {
    if (typeof document === 'undefined' || paneRef.current) return;
    const title = selectedSession?.title.trim();
    document.title = title
      ? `${title}${DOCUMENT_TITLE_SEPARATOR}${CODE_COPY.surface}`
      : CODE_COPY.surface;
  }, [selectedSession]);

  useEffect(() => {
    if (!followTranscript.current) return;
    const end = transcriptEndRef.current;
    if (typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'nearest' });
  }, [transcript, busy]);

  const railSessions = useMemo(
    () =>
      filterAndSortSessions(sessions, filters).map((session) =>
        backgroundTurns.has(session.id) ? { ...session, state: 'running' as const } : session,
      ),
    [backgroundTurns, filters, sessions],
  );
  const sessionSearchQuery = filters.query.trim();
  const [localTitleSearch, setLocalTitleSearch] = useState<{
    query: string;
    includeArchived: boolean;
    groups: DeveloperSessionGroup[] | null;
    error: string | null;
  } | null>(null);
  const includeArchived = local.showArchived;
  const searchSupported = local.supported;
  useEffect(() => {
    if (!searchSupported || !sessionSearchQuery) {
      setLocalTitleSearch(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void listDeveloperSessions({ titleQuery: sessionSearchQuery, includeArchived })
        .then(({ groups }) => {
          if (!cancelled) {
            setLocalTitleSearch({
              query: sessionSearchQuery,
              includeArchived,
              groups,
              error: null,
            });
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setLocalTitleSearch({
              query: sessionSearchQuery,
              includeArchived,
              groups: null,
              error: toUserMessage(error, LOCAL_CODE_COPY.searchFailed),
            });
          }
        });
    }, SEARCH_INPUT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchSupported, sessionSearchQuery, includeArchived, local.groups]);
  const matchingLocalSearch =
    localTitleSearch?.query === sessionSearchQuery &&
    localTitleSearch.includeArchived === includeArchived
      ? localTitleSearch
      : null;
  const searchedLocalGroups = matchingLocalSearch?.groups ?? local.groups;
  const railLocalGroups = useMemo(() => {
    if (sessionSearchQuery === '') return local.groups;
    return searchedLocalGroups
      .map((group) => ({
        ...group,
        sessions: group.sessions.filter((session) =>
          sessionTitleMatches(session.title, sessionSearchQuery),
        ),
      }))
      .filter((group) => group.sessions.length > 0 || group.sessionsWithheld || group.unavailable);
  }, [local.groups, searchedLocalGroups, sessionSearchQuery]);
  const loadingLocalSearch = searchSupported && sessionSearchQuery !== '' && !matchingLocalSearch;
  const showLocalSearchSection =
    railLocalGroups.length > 0 ||
    !local.settled ||
    local.loading ||
    loadingLocalSearch ||
    local.error !== null ||
    matchingLocalSearch?.error != null;

  const applyTurn = useCallback((recordId: string, turn: CloudCodeAgentTurn, goal: string) => {
    setTurns((current) =>
      current.map((record) =>
        record.id === recordId
          ? {
              ...record,
              turnId: turn.turnId,
              stopReason: turn.stopReason,
              finalMessage: turn.finalMessage,
              errorMessage: turn.errorMessage ?? null,
              steps: turn.steps,
              retryable: cloudCodeStopReasonIsRetryable(turn.stopReason),
            }
          : record,
      ),
    );
    setApprovals(
      turn.pendingApproval
        ? [
            {
              turnId: turn.turnId,
              stepIndex: turn.pendingApproval.stepIndex,
              command: turn.pendingApproval.command,
              reason: turn.pendingApproval.reason,
              goal,
            },
          ]
        : [],
    );
  }, []);

  const requestTurn = useCallback(
    (client: CloudCodeApi, session: CloudCodeSession, goal: string, mode: CloudCodeTurnMode) => {
      const ownAgent = runtimeRunsOwnAgent(session.runtimeId);
      return client.startAgentTurn(session.id, {
        goal,
        model: (ownAgent ? sessionModelsRef.current[session.id] : undefined) ?? agentModel,
        idempotencyKey: makeRequestId(),
        ...(ownAgent ? {} : { mode }),
      });
    },
    [agentModel, runtimeRunsOwnAgent],
  );

  const startTurn = useCallback(
    async (
      session: CloudCodeSession,
      goal: string,
      mode: CloudCodeTurnMode,
      owner: ReturnType<typeof captureView>,
    ) => {
      if (!owner.isCurrent()) return;
      const taskRevision = draftRevision.current;
      owner.followSelection();
      followTranscript.current = true;
      const ownAgent = runtimeRunsOwnAgent(session.runtimeId);
      const recordId = makeRequestId();
      setTurns((current) => [
        ...current,
        {
          id: recordId,
          turnId: null,
          at: new Date().toISOString(),
          goal,
          mode: ownAgent ? CLOUD_CODE_DEFAULT_TURN_MODE : mode,
          stopReason: null,
          finalMessage: '',
          errorMessage: null,
          steps: [],
          retryable: false,
        },
      ]);
      setBusy(true);
      setBusySince(new Date().toISOString());
      setTurnRunning(true);
      setError(null);
      try {
        const turn = await requestTurn(api, session, goal, mode);
        if (owner.accountCurrent()) void loadSessions(statusFilterRef.current, undefined, owner);
        if (!owner.isCurrent()) return;
        applyTurn(recordId, turn, goal);
      } catch (turnError) {
        if (!owner.isCurrent()) return;
        // The failure belongs in the transcript, next to the task that caused
        // it. The page-level notice cannot carry it: the session refresh below
        // clears that notice before it has been painted once.
        setTurns((current) =>
          current.map((record) =>
            record.id === recordId
              ? {
                  ...record,
                  stopReason: 'error',
                  errorMessage: friendlyError(turnError),
                  retryable: true,
                }
              : record,
          ),
        );
        if (taskRevision === draftRevision.current) setDraftText(session.id, goal);
        void loadSessions(statusFilterRef.current, undefined, owner);
      } finally {
        if (owner.isSelected()) {
          setBusy(false);
          setBusySince(null);
          setTurnRunning(false);
          setStopping(false);
        }
      }
    },
    [api, applyTurn, loadSessions, requestTurn, runtimeRunsOwnAgent, setDraftText],
  );

  const createSession = useCallback(
    async (
      title: string,
      patch: Partial<CodeDraft> = {},
      owner = captureView(true),
      stayHere = false,
    ): Promise<CloudCodeSession | null> => {
      if (!owner.isCurrent()) return null;
      const next = { ...draft, ...patch };
      if (!canCreate || busy) return null;
      if (next.networkAccess === 'full' && !next.fullNetworkAccepted) return null;
      setBusy(true);
      setBusySince(new Date().toISOString());
      setError(null);
      try {
        const body = await api.create({
          requestId: makeRequestId(),
          title,
          repository: next.repository
            ? { ...next.repository, branch: next.repositoryBranch.trim() || null }
            : null,
          repositoryUrl: next.repository ? null : next.repositoryUrl.trim() || null,
          repositoryBranch: next.repository ? null : next.repositoryBranch.trim() || null,
          networkAccess: next.networkAccess,
          fullNetworkAcknowledged:
            next.networkAccess === 'full' ? next.fullNetworkAccepted : undefined,
          runtimeId: next.runtimeId || null,
          extraHosts: next.networkAccess === 'full' ? undefined : parseExtraHosts(next.extraHosts),
          ...(runtimes.find((runtime) => runtime.id === next.runtimeId)?.needsUserCredential &&
          next.harnessCredential.trim()
            ? { harnessCredential: next.harnessCredential.trim() }
            : {}),
        });
        replaceSession(body.session, owner);
        if (!owner.isCurrent()) return null;
        if (next.harnessModelId) sessionModelsRef.current[body.session.id] = next.harnessModelId;
        if (stayHere) return body.session;
        if (!owner.select(body.session.id)) return null;
        setEntries(body.terminalEntries);
        setTurns([]);
        setDraft((current) => ({
          ...EMPTY_CODE_DRAFT,
          environment: current.environment,
          localRootId: current.localRootId,
          localModelId: current.localModelId,
        }));
        if (paneRef.current) paneRef.current.onSessionOpened(body.session.id);
        else router.push(codeSessionPath(body.session.id));
        return body.session;
      } catch (createError) {
        if (!owner.isCurrent()) return null;
        setError(friendlyError(createError));
        return null;
      } finally {
        if (owner.isSelected()) {
          setBusy(false);
          setBusySince(null);
        }
      }
    },
    [api, busy, canCreate, captureView, draft, replaceSession, router, runtimes],
  );

  useEffect(() => {
    if (!githubNotice) return;
    const notice = getGitHubCallbackNotice(githubNotice);
    if (!notice) return;
    if (notice.kind === 'error') setError(notice.message);
    else setRouteNotice(notice.message);
    router.replace(CODE_ROUTES.root);
  }, [githubNotice, router]);

  useEffect(() => {
    const wanted = routeLocalRef.current;
    if (wanted === null || !local.settled || local.loading) return;
    const resolution = resolveLocalRoute(local.groups, wanted, local.error);
    if (resolution.kind === 'waiting') {
      routeWaitingNotice.current = resolution.notice;
      setRouteNotice(resolution.notice);
      return;
    }
    const finish = (session: LocalDeveloperSession | null) => {
      routeLocalRef.current = null;
      const waiting = routeWaitingNotice.current;
      routeWaitingNotice.current = null;
      if (session) {
        setRouteNotice((current) => (current === waiting ? null : current));
        setLocalSession(session);
      } else {
        setRouteNotice(LOCAL_CODE_COPY.sessionNotFound);
        routerRef.current.replace(CODE_ROUTES.root);
      }
    };
    if (resolution.kind === 'found') {
      finish(resolution.session);
      return;
    }
    if (!local.groups.some((group) => group.rootId === wanted.rootId)) {
      finish(null);
      return;
    }
    let current = true;
    void lookupDeveloperSession(wanted.rootId, wanted.threadId)
      .then((session) => {
        if (!current || routeLocalRef.current !== wanted) return;
        if (session && (session.rootId !== wanted.rootId || session.id !== wanted.threadId)) {
          throw new Error(LOCAL_CODE_COPY.sessionUnreadable);
        }
        finish(session);
      })
      .catch((error: unknown) => {
        if (!current || routeLocalRef.current !== wanted) return;
        const notice = toUserMessage(error, LOCAL_CODE_COPY.sessionUnreadable);
        routeWaitingNotice.current = notice;
        setRouteNotice(notice);
      });
    return () => {
      current = false;
    };
  }, [localRoute, local.settled, local.loading, local.groups, local.error, setLocalSession]);

  const dismissRouteNotice = useCallback(() => {
    routeLocalRef.current = null;
    routeWaitingNotice.current = null;
    setRouteNotice(null);
  }, []);

  const openLocalSession = useCallback(
    (session: LocalDeveloperSession) => {
      setLocalSession(session);
      setRouteNotice(null);
      if (!paneRef.current) routerRef.current.replace(localSessionPath(session.rootId, session.id));
    },
    [setLocalSession],
  );

  const closeLocalSession = useCallback(() => {
    setLocalEditorDirty(false);
    setLocalSession(null);
    if (!paneRef.current) routerRef.current.replace(CODE_ROUTES.root);
  }, [setLocalSession]);

  const localSessionDeleted = useCallback(
    (session: LocalDeveloperSession, outcome: ThreadDeleteResponse) => {
      setLocalDeletion({ rootId: session.rootId, threadId: session.id, outcome });
      local.dismissCleanupFailures(session.id);
      local.refresh();
      closeLocalSession();
      forgetLocalSession(session.rootId, session.id);
    },
    [closeLocalSession, local],
  );

  const localSessionArchived = useCallback(
    (session: LocalDeveloperSession) => {
      setLocalArchivedThread(session.id);
      local.dismissCleanupFailures(session.id);
      const selected = localSelectionRef.current;
      if (selected?.rootId === session.rootId && selected.id === session.id) closeLocalSession();
    },
    [closeLocalSession, local],
  );

  const requestDiscardArchives = useCallback(() => {
    const deletion = localDeletion;
    if (!deletion) return;
    const kept = deletion.outcome.keptWorktreeArchives;
    confirm({
      title: LOCAL_CODE_COPY.deleteArchivesTitle,
      description: localDiscardArchivesConsequence(kept.length),
      confirmLabel: LOCAL_CODE_COPY.deleteArchivesConfirm,
      destructive: true,
      onConfirm: async () => {
        try {
          const discarded = await deleteDeveloperThread({
            rootId: deletion.rootId,
            threadId: deletion.threadId,
            discardWorktreeArchives: true,
          });
          setLocalDeletion({
            ...deletion,
            outcome: {
              ...deletion.outcome,
              keptWorktreeArchives: kept.filter(
                (archive) => !discarded.removedWorktreeArchives.includes(archive),
              ),
              removedWorktreeArchives: [
                ...deletion.outcome.removedWorktreeArchives,
                ...discarded.removedWorktreeArchives,
              ],
            },
          });
        } catch (discardError) {
          setError(toUserMessage(discardError, LOCAL_CODE_COPY.deleteFailed));
        }
      },
    });
  }, [confirm, localDeletion]);

  const startLocalSession = useCallback(
    async (rootId: string, text: string, model: string, pictures: File[], stayHere: boolean) => {
      const owner = captureView(true);
      setLocalStartError(null);
      setBusy(true);
      try {
        let images: string[];
        try {
          images = await Promise.all(pictures.map(codeImageDataUrl));
        } catch {
          if (owner.isCurrent())
            setLocalStartError({ rootId, message: LOCAL_CODE_COPY.imageReadFailed });
          return false;
        }
        if (!owner.isCurrent()) return false;
        const started = await local.startSession(
          rootId,
          model || undefined,
          localPlacement,
          (message) => {
            if (owner.isCurrent()) setLocalStartError({ rootId, message });
          },
        );
        if (!started || !owner.isCurrent()) return false;
        if (stayHere) {
          const runtime = local.modelsFor(started.rootId) ?? local.modelsFor(rootId);
          try {
            await startDeveloperTurn({
              rootId: started.rootId,
              threadId: started.id,
              text,
              agentMode: runtime?.defaultAgentMode ?? LOCAL_FALLBACK_AGENT_MODE,
              ...(runtime?.defaultReasoningEffort
                ? { reasoningEffort: runtime.defaultReasoningEffort }
                : {}),
              ...(model ? { model } : {}),
              ...(images.length > 0 ? { images } : {}),
            });
          } catch (cause) {
            if (owner.isCurrent()) {
              setLocalStartError({
                rootId,
                message: toUserMessage(cause, LOCAL_CODE_COPY.turnFailed),
              });
            }
            return false;
          }
          if (owner.accountCurrent()) {
            toast.success(CODE_COPY.backgroundTaskStarted, {
              action: {
                label: CODE_COPY.openBackgroundTask,
                onClick: () => {
                  if (owner.accountCurrent()) {
                    guardedRouter.push(localSessionPath(started.rootId, started.id));
                  }
                },
              },
            });
          }
          if (!owner.isCurrent()) return false;
          setTask('');
          return true;
        }
        setTask('');
        setLocalPrompt({
          sessionId: started.id,
          message: { text, images, contextFiles: [] },
          pictures,
        });
        openLocalSession(started);
        setRailDrawerOpen(false);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [captureView, guardedRouter, local, openLocalSession, localPlacement, setTask],
  );

  const waitForReady = useCallback(
    async (
      initial: CloudCodeSession,
      owner: ReturnType<typeof captureView>,
    ): Promise<CloudCodeSession | null> => {
      let current = initial;
      for (
        let attempt = 0;
        current.state === 'provisioning' && attempt < CLOUD_CODE_SESSION_READY_POLLS;
        attempt += 1
      ) {
        if (!owner.isCurrent()) return null;
        if (attempt > 0)
          await new Promise((resolve) =>
            setTimeout(resolve, CLOUD_CODE_SESSION_READY_POLL_INTERVAL_MS),
          );
        if (!owner.isCurrent()) return null;
        try {
          const detail = await api.get(current.id);
          replaceSession(detail.session, owner);
          if (!owner.isCurrent()) return null;
          current = detail.session;
        } catch {
          return owner.isCurrent() ? current : null;
        }
      }
      return owner.isCurrent() ? current : null;
    },
    [api, replaceSession],
  );

  const startBackgroundTurn = useCallback(
    (
      session: CloudCodeSession,
      text: string,
      mode: CloudCodeTurnMode,
      owner: ReturnType<typeof captureView>,
    ) => {
      const identity = sessionSnapshot();
      if (!identity?.isCurrent() || !owner.isCurrent()) return false;
      const action = {
        label: CODE_COPY.openBackgroundTask,
        onClick: () => {
          if (identity.isCurrent()) guardedRouter.push(codeSessionPath(session.id));
        },
      };
      const options = { action, description: session.title };
      const running = runCloudCodeBackgroundTurn(session.id, () =>
        requestTurn(backgroundApi, session, text, mode),
      );
      setTask('');
      toast.info(CODE_COPY.cloudBackgroundTaskSubmitted, options);
      void running.then(
        (result) => {
          if (owner.accountCurrent()) void loadSessions(statusFilterRef.current, undefined, owner);
          if (!identity.isCurrent()) return;
          if (result.stopReason === 'awaiting_approval') {
            toast.info(CODE_COPY.backgroundTaskNeedsApproval, options);
          } else if (result.stopReason !== 'done' && result.stopReason !== 'cancelled') {
            toast.error(CODE_COPY.backgroundTaskNeedsAttention, options);
          }
        },
        async (cause: unknown) => {
          if (!identity.isCurrent()) return;
          toast.error(friendlyError(cause), options);
          if (!owner.isCurrent()) return;
          const saved = await api.get(session.id).catch(() => null);
          if (!saved) return;
          replaceSession(saved.session, owner);
          if (owner.isCurrent() && saved.turns.length === 0) setTask(text);
        },
      );
      return true;
    },
    [
      api,
      backgroundApi,
      guardedRouter,
      loadSessions,
      replaceSession,
      requestTurn,
      sessionSnapshot,
      setTask,
    ],
  );

  const handleSubmit = useCallback(
    async (
      text: string,
      mode: CloudCodeTurnMode = turnMode,
      entry: CodeRepositoryEntry | null = null,
      pictures: File[] = [],
      stayHere = false,
    ): Promise<boolean | void> => {
      if (submitLock.current || busy || selectedTurnRunning) return;
      const submission = Symbol();
      submitLock.current = submission;
      const owner = captureView(true);
      try {
        if (draft.environment === 'local' && !selectedSession) {
          if (draft.localRootId === null || draftGroup?.sessionsWithheld) return;
          return await startLocalSession(draft.localRootId, text, localModelId, pictures, stayHere);
        }

        if (!canCreate || !owner.isCurrent()) return;

        const selection = selectionForCreate(draft, entry);
        if ('error' in selection) {
          setError(selection.error);
          return;
        }
        if (Object.keys(selection.patch).length > 0) {
          setDraft((current) => ({ ...current, ...selection.patch }));
        }

        if (
          selectedSession &&
          (selectedSession.state === 'ready' || selectedSession.state === 'provisioning')
        ) {
          const current =
            selectedSession.state === 'provisioning'
              ? await waitForReady(selectedSession, owner)
              : selectedSession;
          if (!owner.isCurrent() || !current) return;
          if (current.state !== 'ready') {
            setError(current.lastError || CODE_COPY.environmentNotReady);
            return;
          }
          setTask('');
          await startTurn(current, text, mode, owner);
          return;
        }

        const created = await createSession(titleFromTask(text), selection.patch, owner, stayHere);
        if (!owner.isCurrent()) return;
        if (!created) {
          setTask(text);
          return;
        }
        const ready =
          created.state === 'provisioning' ? await waitForReady(created, owner) : created;
        if (!owner.isCurrent() || !ready) return;
        if (ready.state !== 'ready') {
          if (!stayHere) {
            setTask('');
            setDraftText(created.id, text);
          }
          setError(
            ready.lastError ||
              (ready.state === 'failed' ? CODE_COPY.sessionFailed : CODE_COPY.environmentNotReady),
          );
          return;
        }
        if (stayHere) return startBackgroundTurn(ready, text, mode, owner);
        setTask('');
        return await startTurn(ready, text, mode, owner);
      } finally {
        if (submitLock.current === submission) submitLock.current = null;
      }
    },
    [
      busy,
      canCreate,
      captureView,
      createSession,
      draft,
      draftGroup?.sessionsWithheld,
      localModelId,
      selectedSession,
      selectedTurnRunning,
      setDraftText,
      setTask,
      startBackgroundTurn,
      startLocalSession,
      startTurn,
      turnMode,
      waitForReady,
    ],
  );

  const handleOpenEmptyEnvironment = useCallback(() => {
    void createSession(CODE_COPY.surface);
  }, [createSession]);

  const handleApproval = useCallback(
    async (approval: CodeApprovalPrompt, decision: 'approve' | 'reject') => {
      if (!selectedSession || busy) return;
      const owner = captureView();
      if (!owner.isCurrent()) return;
      const recordId = makeRequestId();
      setTurns((current) => [
        ...current,
        {
          id: recordId,
          turnId: approval.turnId,
          at: new Date().toISOString(),
          goal: approval.goal,
          mode:
            current.find((record) => record.turnId === approval.turnId)?.mode ??
            CLOUD_CODE_DEFAULT_TURN_MODE,
          stopReason: null,
          finalMessage: '',
          errorMessage: null,
          steps: [],
          retryable: false,
        },
      ]);
      setBusy(true);
      setBusySince(new Date().toISOString());
      setTurnRunning(true);
      setError(null);
      try {
        const turn = await api.decideApproval(selectedSession.id, {
          turnId: approval.turnId,
          stepIndex: approval.stepIndex,
          decision,
        });
        if (owner.accountCurrent()) void loadSessions(statusFilterRef.current, undefined, owner);
        if (!owner.isCurrent()) return;
        applyTurn(recordId, turn, approval.goal);
      } catch (decisionError) {
        if (!owner.isCurrent()) return;
        setTurns((current) => current.filter((record) => record.id !== recordId));
        setError(friendlyError(decisionError));
        // The approval may have expired or been decided elsewhere; re-read rather
        // than leaving a card that can no longer be acted on.
        void api
          .listApprovals(selectedSession.id)
          .then((value) => {
            if (owner.isCurrent()) setApprovals(value);
          })
          .catch(() => {
            if (owner.isCurrent()) setApprovals([]);
          });
      } finally {
        if (owner.isCurrent()) {
          setBusy(false);
          setBusySince(null);
          setTurnRunning(false);
          setStopping(false);
        }
      }
    },
    [api, applyTurn, busy, captureView, loadSessions, selectedSession],
  );

  const handleStopTurn = useCallback(async () => {
    if (!selectedSession || !selectedTurnRunning || stopping || stopLock.current) return;
    const owner = captureView();
    if (!owner.isCurrent()) return;
    const request = Symbol();
    stopLock.current = request;
    setStopping(true);
    try {
      if (activeStoredTurn) await api.cancelAgentTurn(selectedSession.id, activeStoredTurn.turnId);
      else await api.cancelAgentTurn(selectedSession.id);
    } catch (stopError) {
      if (!owner.isCurrent() || stopLock.current !== request) return;
      stopLock.current = null;
      setStopping(false);
      setError(friendlyError(stopError));
    }
  }, [activeStoredTurn, api, captureView, selectedSession, selectedTurnRunning, stopping]);

  const handleRunCommand = useCallback(
    async (command: string) => {
      if (!canRun || !selectedSession || running) return;
      const owner = captureView();
      if (!owner.isCurrent()) return;
      setRunning(true);
      setError(null);
      try {
        const body = await api.run(selectedSession.id, command);
        replaceSession(body.session, owner);
        if (!owner.isCurrent()) return;
        setEntries((current) => [...current, body.terminalEntry]);
      } catch (runError) {
        if (!owner.isCurrent()) return;
        setError(friendlyError(runError));
        void loadSessions(statusFilterRef.current, undefined, owner);
      } finally {
        if (owner.isCurrent()) setRunning(false);
      }
    },
    [api, canRun, captureView, loadSessions, replaceSession, running, selectedSession],
  );

  const handleCommit = useCallback(
    async (message: string, files: string[] | null) => {
      if (!selectedSession || committing) return;
      const owner = captureView();
      if (!owner.isCurrent()) return;
      setCommitting(true);
      setError(null);
      setCommitNotice(null);
      try {
        const result = await api.commit(selectedSession.id, {
          message,
          ...(files ? { files } : {}),
        });
        replaceSession(result.session, owner);
        if (!owner.isCurrent()) return;
        setCommitNotice(result.push.ok ? CODE_COPY.commitPushed : result.push.output);
        void loadChanges(selectedSession.id);
      } catch (commitError) {
        if (!owner.isCurrent()) return;
        const message = friendlyError(commitError);
        setError(message);
        setReconnectError(requiresGitHubReconnect(commitError) ? message : null);
      } finally {
        if (owner.isCurrent()) setCommitting(false);
      }
    },
    [api, captureView, committing, loadChanges, replaceSession, selectedSession],
  );

  const handleDiscard = useCallback(
    async (files: string[]) => {
      if (!selectedSession || committing || files.length === 0) return;
      const owner = captureView();
      if (!owner.isCurrent()) return;
      setCommitting(true);
      setError(null);
      setCommitNotice(null);
      try {
        const result = await api.discardChanges(selectedSession.id, files);
        replaceSession(result.session, owner);
        if (!owner.isCurrent()) return;
        void loadChanges(selectedSession.id);
      } catch (discardError) {
        if (!owner.isCurrent()) return;
        setError(friendlyError(discardError));
      } finally {
        if (owner.isCurrent()) setCommitting(false);
      }
    },
    [api, captureView, committing, loadChanges, replaceSession, selectedSession],
  );

  const showHome = useCallback(() => {
    draftRevision.current += 1;
    if (paneRef.current) {
      paneRef.current.onClose();
      return;
    }
    setLocalSession(null);
    setSelectedId(null);
    setTurns([]);
    setEntries([]);
    setChangesOpen(false);
    setChanges(null);
    setError(null);
    setCommitNotice(null);
    setRailDrawerOpen(false);
    router.push(CODE_ROUTES.root);
  }, [router, setLocalSession, setSelectedId]);

  const openHome = useCallback(() => leaveLocalEdits(showHome), [leaveLocalEdits, showHome]);

  const showLocalDraft = useCallback(
    (rootId: string, modelId = '') => {
      showHome();
      handleDraftChange({ environment: 'local', localRootId: rootId, localModelId: modelId });
    },
    [handleDraftChange, showHome],
  );

  const handleRename = useCallback(async () => {
    const session = selectedSession;
    const next = titleDraft.trim();
    setRenaming(false);
    if (!session || !next || next === session.title) return;
    const owner = captureView();
    if (!owner.isCurrent()) return;
    try {
      replaceSession(await api.rename(session.id, next), owner);
    } catch (renameError) {
      if (!owner.isCurrent()) return;
      setError(friendlyError(renameError));
    }
  }, [api, captureView, replaceSession, selectedSession, titleDraft]);

  const handleSetArchived = useCallback(
    async (archived: boolean) => {
      const session = selectedSession;
      if (!session) return;
      const owner = captureView();
      if (!owner.isCurrent()) return;
      try {
        replaceSession(await api.setArchived(session.id, archived), owner);
      } catch (archiveError) {
        if (!owner.isCurrent()) return;
        setError(friendlyError(archiveError));
      }
    },
    [api, captureView, replaceSession, selectedSession],
  );

  const handleChangeSharing = useCallback(
    async (visibility: CloudCodeShareVisibility) => {
      const session = selectedSession;
      if (!session) return;
      const owner = captureView();
      if (!owner.isCurrent()) return;
      replaceSession(await api.setSharing(session.id, visibility), owner);
    },
    [api, captureView, replaceSession, selectedSession],
  );

  const requestDelete = useCallback(() => {
    const session = selectedSession;
    if (!session) return;
    const owner = captureView();
    if (!owner.isCurrent()) return;
    confirm({
      title: CODE_COPY.deleteSessionTitle,
      description: CODE_COPY.deleteSessionDescription,
      confirmLabel: CODE_COPY.deleteSessionConfirm,
      destructive: true,
      onConfirm: async () => {
        if (!owner.isCurrent()) return;
        try {
          await api.deleteSession(session.id);
          if (!owner.accountCurrent()) return;
          setSessions((current) => current.filter((entry) => entry.id !== session.id));
          if (owner.isCurrent()) openHome();
        } catch (deleteError) {
          if (!owner.isCurrent()) return;
          setError(friendlyError(deleteError));
        }
      },
    });
  }, [api, captureView, confirm, openHome, selectedSession]);

  const requestClose = useCallback(() => {
    const session = selectedSession;
    if (!session) return;
    const owner = captureView();
    if (!owner.isCurrent()) return;
    confirm({
      title: CODE_COPY.closeSessionTitle,
      description: CODE_COPY.closeSessionDescription,
      confirmLabel: CODE_COPY.closeSessionConfirm,
      destructive: true,
      onConfirm: async () => {
        if (!owner.isCurrent()) return;
        try {
          const closed = await api.close(session.id);
          replaceSession(closed, owner);
        } catch (closeError) {
          if (!owner.isCurrent()) return;
          setError(friendlyError(closeError));
        }
      },
    });
  }, [api, captureView, confirm, replaceSession, selectedSession]);

  const handleCreatePullRequest = useCallback(async () => {
    if (!selectedSession || pullRequestBusy) return;
    const owner = captureView();
    if (!owner.isCurrent()) return;
    setPullRequestBusy(true);
    setError(null);
    try {
      const body = await api.createPullRequest(selectedSession.id);
      replaceSession(body.session, owner);
    } catch (pullRequestError) {
      if (!owner.isCurrent()) return;
      const message = friendlyError(pullRequestError);
      setError(message);
      setReconnectError(requiresGitHubReconnect(pullRequestError) ? message : null);
    } finally {
      if (owner.isCurrent()) setPullRequestBusy(false);
    }
  }, [api, captureView, pullRequestBusy, replaceSession, selectedSession]);

  const openSession = useCallback(
    (openedId: string) => {
      setSelectedId(openedId);
      setTurns([]);
      setChangesOpen(false);
      setChanges(null);
      setError(null);
      setCommitNotice(null);
      setRailDrawerOpen(false);
      router.push(codeSessionPath(openedId));
    },
    [router, setSelectedId],
  );

  const panes = useCodePanes({
    enabled: !pane && !narrow,
    primaryId: selectedId,
    openPrimary: openSession,
  });

  const renameLocalSession = async (session: LocalDeveloperSession, title: string) => {
    const accountCurrent = capture();
    const result = await local.renameSession(session, title);
    if ('error' in result) return result.error;
    if (!accountCurrent()) return LOCAL_CODE_COPY.renameFailed;
    publishLocalSession((current) =>
      current?.rootId === session.rootId && current.id === session.id
        ? { ...current, title: result.renamed.title }
        : current,
    );
    return null;
  };

  const changeLocalArchive = async (session: LocalDeveloperSession, archived: boolean) => {
    const accountCurrent = capture();
    if (!(await local.setSessionArchived(session, archived)) || !accountCurrent()) return false;
    if (archived) {
      localSessionArchived(session);
    } else {
      setLocalArchivedThread((current) => (current === session.id ? null : current));
      publishLocalSession((current) => {
        if (current?.rootId !== session.rootId || current.id !== session.id) return current;
        const { archivedAt: _archivedAt, ...restored } = current;
        return { ...restored, status: restored.status === 'archived' ? 'idle' : restored.status };
      });
    }
    return true;
  };

  const railProps = {
    sessions: railSessions,
    hiddenSessionsExist,
    selectedId,
    loading: pageLoading,
    showLocalSearchSection: local.supported && showLocalSearchSection,
    filters,
    onFiltersChange: (patch: Partial<CodeSessionFilters>) => {
      if (patch.status !== undefined && patch.status !== statusFilterRef.current) {
        statusFilterRef.current = patch.status;
        listRevision.current += 1;
      }
      setFilters((current) => ({ ...current, ...patch }));
    },
    onNewSession: openHome,
    onSelectSession: (id: string, options?: { split: boolean }) =>
      leaveLocalEdits(() => {
        if (localSession) closeLocalSession();
        if (panes.select(id, options?.split === true)) return;
        openSession(id);
      }),
    localSection:
      local.supported && (sessionSearchQuery === '' || showLocalSearchSection) ? (
        <>
          <SshConnectionControl
            onConnected={(session) => {
              local.refresh();
              leaveLocalEdits(() => {
                setRailDrawerOpen(false);
                setLocalPrompt(null);
                openLocalSession(session);
              });
            }}
            onDisconnected={(rootId) => {
              local.refresh();
              if (localSession?.rootId === rootId) closeLocalSession();
            }}
          />
          <LocalSessionsSection
            groups={railLocalGroups}
            loading={local.loading || loadingLocalSearch}
            adding={local.adding}
            error={matchingLocalSearch?.error ?? local.error}
            unavailable={local.unavailable}
            selectedId={localSession?.id ?? null}
            activity={local.activity}
            onSelect={(session) => {
              if (session.id === localSession?.id) return;
              leaveLocalEdits(() => {
                setRailDrawerOpen(false);
                setLocalPrompt(null);
                openLocalSession(session);
              });
            }}
            onNewSession={(rootId) =>
              leaveLocalEdits(() => {
                const model = planStartingModelId(
                  local.modelsFor(rootId),
                  local.groups.find((group) => group.rootId === rootId)?.sessions ?? [],
                  accountPlanTier,
                );
                if (model === null) {
                  showLocalDraft(rootId);
                  return;
                }
                void local.startSession(rootId, model).then((session) => {
                  if (session) {
                    setRailDrawerOpen(false);
                    setLocalPrompt(null);
                    openLocalSession(session);
                  }
                });
              })
            }
            onAddFolder={() => void local.addFolder('folder')}
            onAddRepository={() => void local.addFolder('repository')}
            allowing={local.allowing}
            allowRefusals={local.allowRefusals}
            onAllowSessions={(rootId) => void local.allowSessions(rootId)}
            onReviewCommandAccess={() => openSettings('capabilities')}
            reviewingMcp={local.reviewingMcp}
            mcpRefusals={local.mcpRefusals}
            onReviewMcpServer={(rootId, server) => void local.reviewMcpServer(rootId, server)}
            showArchived={local.showArchived}
            onToggleArchived={() => local.setShowArchived(!local.showArchived)}
            sessionActions={local.sessionActions}
            actionError={local.actionError}
            onRename={renameLocalSession}
            selectedHasUnsavedEdits={localEditorDirty}
            onSetArchived={changeLocalArchive}
            onSetPinned={(session, pinned) => void local.setSessionPinned(session, pinned)}
          />
        </>
      ) : null,
  };

  const localGroup = local.groups.find((group) => group.rootId === localSession?.rootId) ?? null;
  const { retainRoots } = terminals;
  useEffect(() => {
    if (!local.settled || local.loading || local.error !== null) return;
    const allowed = local.groups.filter((group) => !group.sessionsWithheld);
    const listedRoots = new Set(allowed.map((group) => group.rootId));
    const incompleteRoots = new Set(
      allowed
        .filter((group) => group.unavailable || group.worktreesUnavailable)
        .map((group) => group.rootId),
    );
    retainRoots((rootId) => listedRoots.has(rootId) || incompleteRoots.has(approvedRootId(rootId)));
  }, [local.error, local.groups, local.loading, local.settled, retainRoots]);
  const listedLocalTitle = localGroup?.sessions.find(
    (session) => session.id === localSession?.id,
  )?.title;
  const draftFolder = localFolderChoice(local.groups, draft.localRootId);
  const folderChoices = localFolderChoices(local.groups);
  const desktopCode = desktopHost?.shell === 'electron';
  const showDraftTools = desktopCode && !pane && !localSession && !selectedSession;
  const draftTools = useCodeSideTools(showDraftTools);
  const changeDraftSideTool = (tool: DraftSideTool | null) => {
    if (tool !== null) lastDraftSideTool.current = tool;
    setDraftSideExpanded(false);
    setDraftSideTool(tool);
  };
  const needsLocalFolder = desktopCode && local.settled && folderChoices.length === 0;
  const isLocalDraft = draft.environment === 'local';
  const localDraftBlocked = isLocalDraft ? (draftFolder?.unavailable ?? null) : null;
  const localDraftStartError =
    isLocalDraft && localStartError?.rootId === draft.localRootId ? localStartError.message : null;
  const commandAccessGroup =
    isLocalDraft && !selectedSession && !localDraftBlocked && draftGroup?.sessionsWithheld
      ? draftGroup
      : null;
  const draftTerminalFolder =
    isLocalDraft && !localDraftBlocked && !commandAccessGroup ? draftFolder : null;
  const activeDraftTerminalRoot = useRef(draftTerminalFolder?.rootId);
  activeDraftTerminalRoot.current = draftTerminalFolder?.rootId;
  const draftTerminalReason =
    !isLocalDraft || !draftFolder
      ? LOCAL_CODE_COPY.chooseFolder
      : (localDraftBlocked ??
        (commandAccessGroup ? LOCAL_CODE_COPY.startNeedsCommandAccess : undefined));
  const openDraftTerminal = async () => {
    if (!showDraftTools || !draftTerminalFolder) return;
    const { rootId, name } = draftTerminalFolder;
    const owner = captureView();
    const knownPty = terminals.entries.get(rootId)?.pty ?? draftRuntime?.features?.terminalPty;
    const pty =
      knownPty ??
      (await listDeveloperModels(rootId)
        .then((runtime) => runtime.features?.terminalPty ?? local.terminalPty)
        .catch(() => local.terminalPty));
    if (!owner.isCurrent() || activeDraftTerminalRoot.current !== rootId) return;
    terminals.show({ rootId, folder: name, pty });
    setDraftSideTool((current) => (current === 'launcher' ? null : current));
  };
  const draftTerminalRootId = showDraftTools ? draftTerminalFolder?.rootId : undefined;
  const draftTerminalOpen =
    draftTerminalRootId !== undefined && terminals.entries.get(draftTerminalRootId)?.open === true;
  useShowTerminal(
    draftTerminalFolder !== null,
    draftTerminalOpen,
    () => {
      if (draftTerminalOpen) terminals.hide(draftTerminalRootId);
      else void openDraftTerminal();
    },
    showDraftTools,
  );
  const activeTerminalRootId =
    localSession &&
    localSession.environment !== 'ssh' &&
    localGroup &&
    !localGroup.unavailable &&
    !localGroup.sessionsWithheld
      ? localSession.rootId
      : (draftTerminalRootId ?? null);
  const linkedCommandAccessGroup =
    routeNotice === LOCAL_CODE_COPY.sessionWithheld && localRoute !== null
      ? localRouteCommandAccessGroup(local.groups, localRoute.rootId)
      : undefined;
  const linkedUsesDraftNotice =
    linkedCommandAccessGroup !== undefined &&
    linkedCommandAccessGroup.rootId === commandAccessGroup?.rootId;
  const commandAccessWasRefused = (group: DeveloperSessionGroup) =>
    group.commandAccessRefused ||
    local.allowRefusals[group.rootId] === LOCAL_CODE_COPY.sessionsRefused;
  const commandAccessMessage = (group: DeveloperSessionGroup, message: string) =>
    commandAccessWasRefused(group)
      ? LOCAL_CODE_COPY.startCommandAccessDenied
      : (local.allowRefusals[group.rootId] ?? message);
  const commandAccessAction = (group: DeveloperSessionGroup, label: string) =>
    commandAccessWasRefused(group) ? (
      <button
        type="button"
        className={styles['secondaryButton']}
        onClick={() => openSettings('capabilities')}
      >
        {LOCAL_CODE_COPY.reviewCommandAccess}
      </button>
    ) : (
      <button
        type="button"
        className={styles['secondaryButton']}
        disabled={local.allowing !== null}
        onClick={() => {
          setLocalStartError((current) => (current?.rootId === group.rootId ? null : current));
          void local.allowSessions(group.rootId);
        }}
      >
        {local.allowing === group.rootId ? LOCAL_CODE_COPY.allowingSessions : label}
      </button>
    );
  const composerLocal: CodeLocalState = {
    agentMode: draftRuntime?.defaultAgentMode ?? LOCAL_FALLBACK_AGENT_MODE,
    supported: local.supported,
    worktrees: local.worktrees,
    folders: folderChoices,
    models: localChoices,
    setups: localProviderSetups(draftRuntime, local.cliProgram),
    modelId: localModelId,
    modelUnreachable: localModelSetup(draftRuntime, localModelId) !== null,
    adding: local.adding,
    placement: local.worktrees ? localPlacement : 'local',
    primaryRootId: draft.localRootId,
    onMakePrimary: (rootId) => handleDraftChange({ environment: 'local', localRootId: rootId }),
    onAddFolder: () => void local.addFolder(),
    onModelChange: (modelId) => handleDraftChange({ localModelId: modelId }),
    onBranchSwitched: local.refresh,
    onPlacementChange: (placement) => {
      if (placement === localPlacement) return;
      draftRevision.current += 1;
      setLocalPlacement(placement);
    },
  };

  const unavailableNotice = availability
    ? !availability.deploymentEnabled
      ? CODE_COPY.deploymentDisabled
      : !availability.planEntitled
        ? CODE_COPY.planNotEntitled
        : null
    : null;

  const planUpgradeRequired =
    availability !== null &&
    availability.deploymentEnabled &&
    !availability.planEntitled &&
    !local.supported &&
    selectedSession === null;
  const minimumPlan = agiCodeMinimumPlan();
  const upgradeFromPlan = minimumPlan
    ? CODE_COPY.upgradeFromPlan.replace(UPGRADE_PLAN_SLOT, getBillingPlanPricing(minimumPlan).label)
    : null;

  const agentContextWindow = getModelMetadata(agentModel)?.contextWindow ?? null;
  const closed = selectedSession?.state === 'closed';
  const archived = selectedSession?.archivedAt != null;
  const isNotebookSession = selectedSession?.runtimeId === NOTEBOOK_TEMPLATE_ID;
  const notebookIdentity = sessionSnapshot();
  const notebookSessionId = selectedSession?.id;

  const notices = (
    <>
      {unavailableNotice && !planUpgradeRequired && (!isLocalDraft || selectedSession !== null) && (
        <div className={styles['notice']} role="status" data-testid="code-unavailable">
          <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
          <span>{unavailableNotice}</span>
          {unavailableNotice === CODE_COPY.planNotEntitled && (
            <span className={styles['noticeActions']}>
              <button
                type="button"
                className={styles['secondaryButton']}
                onClick={() => openUpgrade((href) => guardedRouter.push(href))}
              >
                {CODE_COPY.upgradeAction}
              </button>
            </span>
          )}
        </div>
      )}
      {localDraftBlocked && !selectedSession && (
        <div className={styles['notice']} role="status">
          <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
          <span>{localDraftBlocked}</span>
        </div>
      )}
      {isLocalDraft &&
        !selectedSession &&
        !localDraftBlocked &&
        !commandAccessGroup &&
        localDraftPlanRequired && (
          <div className={styles['notice']} role="status" data-testid="local-plan-required">
            <span>{localCloudModelsPlanLine()}</span>
            <span className={styles['noticeActions']}>
              <button
                type="button"
                className={styles['secondaryButton']}
                onClick={() => openUpgrade((href) => guardedRouter.push(href))}
              >
                {CODE_COPY.upgradeAction}
              </button>
              {localModeHost ? (
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  onClick={() => openSettings(LOCAL_MODELS_SETTINGS_SECTION)}
                >
                  {LOCAL_CODE_COPY.setUpLocalModel}
                </button>
              ) : (
                <a
                  className={styles['secondaryButton']}
                  href={helpArticlePath(LOCAL_MODELS_HELP_ARTICLE)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {LOCAL_CODE_COPY.setUpLocalModel}
                </a>
              )}
            </span>
          </div>
        )}
      {isLocalDraft &&
        !selectedSession &&
        localDraftStartError &&
        !(
          commandAccessGroup && localDraftStartError === LOCAL_CODE_COPY.startCommandAccessDenied
        ) && (
          <div className={`${styles['notice']} ${styles['noticeError']}`} role="alert">
            <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
            <span>{localDraftStartError}</span>
            {localDraftStartError === LOCAL_CODE_COPY.startCommandAccessDenied && (
              <span className={styles['noticeActions']}>
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  onClick={() => openSettings('capabilities')}
                >
                  {LOCAL_CODE_COPY.reviewCommandAccess}
                </button>
              </span>
            )}
          </div>
        )}
      {commandAccessGroup && !linkedUsesDraftNotice && (
        <div className={styles['notice']} data-code-command-access>
          <span id={commandAccessNoticeId} role="status">
            {commandAccessMessage(commandAccessGroup, LOCAL_CODE_COPY.startNeedsCommandAccess)}
          </span>
          <span className={styles['noticeActions']}>
            {commandAccessAction(commandAccessGroup, LOCAL_CODE_COPY.allowSessions)}
          </span>
        </div>
      )}
      {(isLocalDraft || needsLocalFolder) &&
        !selectedSession &&
        local.error !== null &&
        !localDraftStartError &&
        !(commandAccessGroup && local.error === LOCAL_CODE_COPY.startCommandAccessDenied) && (
          <div className={`${styles['notice']} ${styles['noticeError']}`} role="alert">
            <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
            <span>{local.error}</span>
          </div>
        )}
      {localDeletion && !selectedSession && (
        <LocalListNotice
          line={localSessionDeletedLine(localDeletion.outcome)}
          summary={LOCAL_CODE_COPY.keptArchivesList}
          items={localDeletion.outcome.keptWorktreeArchives}
          testId="local-session-deleted"
          actions={
            <>
              {localDeletion.outcome.keptWorktreeArchives.length > 0 && (
                <button
                  type="button"
                  className={styles['secondaryButton']}
                  onClick={requestDiscardArchives}
                >
                  {LOCAL_CODE_COPY.deleteArchives}
                </button>
              )}
              <button
                type="button"
                className={styles['secondaryButton']}
                onClick={() => setLocalDeletion(null)}
              >
                <X size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
                {CODE_COPY.dismiss}
              </button>
            </>
          }
        />
      )}
      {localWorktreeRemovedRef !== null && !selectedSession && (
        <div className={styles['notice']} role="status" data-testid="local-worktree-removed">
          <span>{localWorktreeRemovedLine(localWorktreeRemovedRef)}</span>
          <span className={styles['noticeActions']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              onClick={() => setLocalWorktreeRemovedRef(null)}
            >
              <X size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
              {CODE_COPY.dismiss}
            </button>
          </span>
        </div>
      )}
      {localArchivedThread !== null && !selectedSession && (
        <div className={styles['notice']} role="status" data-testid="local-session-archived">
          <span>
            {localSessionArchivedLine(localArchivedThread, local.sessionActions.unarchive)}
          </span>
          <span className={styles['noticeActions']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              onClick={() => setLocalArchivedThread(null)}
            >
              <X size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
              {CODE_COPY.dismiss}
            </button>
          </span>
        </div>
      )}
      {routeNotice && (
        <div
          className={styles['notice']}
          role="status"
          data-code-command-access={linkedCommandAccessGroup ? true : undefined}
        >
          <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
          <span id={linkedUsesDraftNotice ? commandAccessNoticeId : undefined}>
            {linkedCommandAccessGroup
              ? commandAccessMessage(linkedCommandAccessGroup, routeNotice)
              : routeNotice}
          </span>
          <span className={styles['noticeActions']}>
            {linkedCommandAccessGroup &&
              commandAccessAction(
                linkedCommandAccessGroup,
                LOCAL_CODE_COPY.allowLinkedSession(linkedCommandAccessGroup.name),
              )}
            {routeNotice === routeWaitingNotice.current &&
              routeNotice !== LOCAL_CODE_COPY.sessionWithheld && (
                <button type="button" className={styles['secondaryButton']} onClick={local.refresh}>
                  {CODE_COPY.retry}
                </button>
              )}
            <button
              type="button"
              className={styles['secondaryButton']}
              onClick={dismissRouteNotice}
            >
              <X size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
              {CODE_COPY.dismiss}
            </button>
          </span>
        </div>
      )}
      {error && (
        <div className={`${styles['notice']} ${styles['noticeError']}`} role="alert">
          <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
          <span>{error}</span>
          <span className={styles['noticeActions']}>
            {error === reconnectError && (
              <a className={styles['primaryButton']} href={githubInstallHref()}>
                {CODE_COPY.githubReauthorizeAction}
              </a>
            )}
            <button
              type="button"
              className={styles['secondaryButton']}
              onClick={() => void loadSessions(statusFilter)}
            >
              <RefreshCw size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
              {CODE_COPY.retry}
            </button>
            <button
              type="button"
              className={styles['secondaryButton']}
              onClick={() => setError(null)}
            >
              <X size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
              {CODE_COPY.dismiss}
            </button>
          </span>
        </div>
      )}
    </>
  );

  const sessionListInAppHeader = !pane && narrow && phone;
  const sessionListInCodeHeader = !pane && (narrow ? !phone : railCollapsed);
  const sessionListButton = (
    <button
      ref={narrow ? railTriggerRef : expandRailRef}
      type="button"
      className={styles[sessionListInAppHeader ? 'appBarButton' : 'headerButton']}
      aria-label={narrow ? CODE_COPY.openSessionList : CODE_COPY.expandRail}
      aria-expanded={narrow ? railDrawerOpen : false}
      aria-controls={narrow ? CODE_RAIL_DRAWER_ID : undefined}
      onClick={toggleSessionRail}
    >
      <PanelLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
    </button>
  );
  const sessionHeaderControls = (
    <>
      {sessionListButton}
      {!narrow && railCollapsed && (
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={CODE_COPY.search}
          title={CODE_COPY.search}
          onClick={() => emitAppCommand('open-search')}
        >
          <Search size={HEADER_GLYPH_SIZE} aria-hidden="true" />
        </button>
      )}
    </>
  );
  const draftPanelButtonClass = sessionListInAppHeader
    ? `${styles['appBarButton']} ${styles['appBarToolsButton']}`
    : styles['headerButton'];
  const draftPanelButton = showDraftTools ? (
    <button
      type="button"
      className={`${draftPanelButtonClass} ${draftSideTool ? styles['headerButtonActive'] : ''}`}
      aria-label={LOCAL_PANEL_COPY.rightPanel}
      aria-pressed={draftSideTool !== null}
      title={LOCAL_PANEL_COPY.rightPanel}
      onClick={() => changeDraftSideTool(draftSideTool ? null : lastDraftSideTool.current)}
    >
      <PanelLeft
        className={styles['glyphPanelRight']}
        size={HEADER_GLYPH_SIZE}
        aria-hidden="true"
      />
    </button>
  ) : null;
  const narrowHeaderSlot = sessionListInAppHeader ? (
    <div className={styles['appBarSlot']} data-testid="code-app-bar">
      {sessionListButton}
      <span className={styles['appBarTitle']}>{CODE_COPY.surface}</span>
      {draftPanelButton}
    </div>
  ) : null;

  const paneTools = pane ? (
    <CodePaneTools onClose={pane.onClose} />
  ) : panes.active ? (
    <CodePaneTools
      layout={panes.layout}
      onToggleLayout={panes.toggleLayout}
      onClose={panes.closePrimary}
    />
  ) : null;

  if (firstRun.state === 'checking' || firstRun.state === 'show') {
    return (
      <CodePageFrame pane={pane} narrowHeaderSlot={null}>
        {firstRun.state === 'show' ? (
          <CodeFirstRunWizard onFinish={firstRun.finish} />
        ) : (
          <div className={styles['wizard']}>
            <Spinner size="sm" aria-label={CODE_COPY.wizardChecking} />
          </div>
        )}
      </CodePageFrame>
    );
  }

  const showSetupLinks =
    !selectedSession &&
    !pageLoading &&
    sessions.length === 0 &&
    statusFilter === 'open' &&
    !hiddenSessionsExist;

  return (
    <CodePageFrame
      pane={pane}
      narrowHeaderSlot={narrowHeaderSlot}
      onToggleSidebar={toggleSessionRail}
    >
      {confirmDialog}
      <div
        className={styles['surface']}
        data-pane-layout={panes.active ? panes.layout : undefined}
        data-pane-count={panes.active ? panes.panes.length + 1 : undefined}
      >
        {!narrow && !railCollapsed && !pane && (
          <div className={`${styles['rail']} ${styles['railDocked']}`} data-sidebar-region="header">
            <CodeRail
              {...railProps}
              collapseButtonRef={collapseRailRef}
              onCollapse={toggleSessionRail}
            />
          </div>
        )}

        {narrow && !pane && (
          <Sheet open={railDrawerOpen} onOpenChange={setRailDrawerOpen}>
            <SheetContent
              id={CODE_RAIL_DRAWER_ID}
              side="left"
              className="w-[290px] max-w-[85vw] gap-0 overflow-y-auto p-0"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                railTriggerRef.current?.focus();
              }}
            >
              <SheetTitle className="sr-only">{CODE_COPY.surface}</SheetTitle>
              <div
                className={`${styles['rail']} ${styles['railDrawer']}`}
                data-sidebar-region="header"
              >
                <CodeRail {...railProps} />
              </div>
            </SheetContent>
          </Sheet>
        )}

        <div
          className={styles['main']}
          data-pane-focused={panes.active ? String(panes.primaryFocused) : undefined}
          onMouseDownCapture={panes.active ? panes.focusPrimary : undefined}
          onFocusCapture={panes.active ? panes.focusPrimary : undefined}
        >
          {localSession && localGroup ? (
            <LocalSessionPanel
              key={`${localSession.rootId}:${localSession.id}`}
              terminals={terminals}
              session={
                listedLocalTitle === undefined || listedLocalTitle === localSession.title
                  ? localSession
                  : { ...localSession, title: listedLocalTitle }
              }
              group={localGroup}
              runtimeModels={local.modelsFor(localGroup.rootId)}
              planTier={accountPlanTier}
              cliProgram={local.cliProgram}
              onNewSessionWith={
                localFolderChoice(local.groups, approvedRootId(localSession.rootId)) === null
                  ? undefined
                  : (modelId) =>
                      leaveLocalEdits(() =>
                        showLocalDraft(approvedRootId(localSession.rootId), modelId),
                      )
              }
              modelsStale={local.modelsStale(localGroup.rootId)}
              verbose={verbose}
              sessionListControl={sessionListInCodeHeader ? sessionHeaderControls : undefined}
              initialPrompt={localPrompt?.sessionId === localSession.id ? localPrompt : undefined}
              onPromptSent={() => setLocalPrompt(null)}
              onSessionsChanged={local.refresh}
              onRename={
                local.sessionActions.rename
                  ? (title) => renameLocalSession(localSession, title)
                  : undefined
              }
              cleanupFailures={local.cleanupFailures[localSession.id]}
              onDismissCleanupFailures={() => local.dismissCleanupFailures(localSession.id)}
              onDeleted={(outcome) => localSessionDeleted(localSession, outcome)}
              onArchived={() => {
                local.refresh();
                localSessionArchived(localSession);
              }}
              onWorktreeRemoved={(snapshotRef) => {
                setLocalWorktreeRemovedRef(snapshotRef);
                forgetLocalSession(localSession.rootId, localSession.id);
              }}
              onForked={(forked) => {
                local.refresh();
                leaveLocalEdits(() => openLocalSession(forked));
              }}
              onClose={() => leaveLocalEdits(closeLocalSession)}
              onEditorDirtyChange={setLocalEditorDirty}
            />
          ) : (
            <>
              {(selectedSession ||
                sessionListInCodeHeader ||
                (showDraftTools && !sessionListInAppHeader)) && (
                <header
                  className={styles['header']}
                  data-window-edge={sessionListInCodeHeader ? 'left' : undefined}
                >
                  {sessionListInCodeHeader && sessionHeaderControls}
                  {!selectedSession && (
                    <h1 className={styles['headerTitle']}>{CODE_COPY.surface}</h1>
                  )}
                  {!sessionListInAppHeader && draftPanelButton}
                  {selectedSession && (
                    <>
                      <span className={styles['headerGlyph']}>
                        <TerminalSquare size={HEADER_GLYPH_SIZE} aria-hidden="true" />
                      </span>
                      {renaming ? (
                        <input
                          className={`${styles['headerTitle']} ${styles['headerTitleInput']}`}
                          ref={titleInputRef}
                          value={titleDraft}
                          aria-label={CODE_COPY.renameLabel}
                          maxLength={CODE_LIMITS.title}
                          onChange={(event) => {
                            titleEditedRef.current = true;
                            setTitleDraft(event.target.value);
                          }}
                          onBlur={() => void handleRename()}
                          onKeyDown={(event) => {
                            if (isImeComposingKey(event.nativeEvent)) return;
                            if (event.key === RENAME_COMMIT_KEY) {
                              event.preventDefault();
                              void handleRename();
                            }
                            if (event.key === RENAME_CANCEL_KEY) {
                              event.preventDefault();
                              setRenaming(false);
                            }
                          }}
                        />
                      ) : (
                        <h1 className={styles['headerTitle']}>{selectedSession.title}</h1>
                      )}
                      <span className={styles['headerChip']}>
                        <span className={styles['headerChipText']}>
                          {sessionContextChip(selectedSession)}
                        </span>
                      </span>
                      <div className={styles['headerActions']}>
                        <button
                          type="button"
                          className={`${styles['headerButton']} ${
                            changesOpen ? styles['headerButtonActive'] : ''
                          }`}
                          aria-label={CODE_COPY.changes}
                          aria-pressed={changesOpen}
                          onClick={() => setChangesOpen((open) => !open)}
                        >
                          <PanelsTopLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
                        </button>
                        <CodeSessionMenu
                          verbose={verbose}
                          closed={closed}
                          archived={archived}
                          deletable={closed || archived}
                          securityScanHref={
                            selectedSession.repositoryUrl && !closed && !archived
                              ? securityScanPagePath(selectedSession.id)
                              : null
                          }
                          onOpenTerminal={() => setChangesOpen(true)}
                          onSetVerbose={setVerbose}
                          onEditEnvironment={() => setChangesOpen(true)}
                          onRename={() => {
                            setTitleDraft(selectedSession.title);
                            setRenaming(true);
                          }}
                          onShare={() => setShareOpen(true)}
                          onSetArchived={(next) => void handleSetArchived(next)}
                          onDeleteSession={requestDelete}
                          onCloseSession={requestClose}
                        />
                        <CodeShareDialog
                          key={renderedSelectionRevision}
                          session={selectedSession}
                          open={shareOpen}
                          onOpenChange={setShareOpen}
                          onChangeVisibility={handleChangeSharing}
                        />
                        {paneTools}
                      </div>
                    </>
                  )}
                </header>
              )}

              <div
                className={`${styles['body']} ${showDraftTools && draftSideTool === 'simulator' ? styles['bodyFloatHost'] : ''}`}
              >
                <div
                  className={
                    styles[showDraftTools && draftSideExpanded ? 'columnHidden' : 'column']
                  }
                >
                  {selectedSession ? (
                    <div
                      className={styles['scroll']}
                      data-testid="code-scroll"
                      onScroll={(event) => {
                        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
                        followTranscript.current =
                          scrollHeight - scrollTop - clientHeight <= TRANSCRIPT_FOLLOW_DISTANCE_PX;
                      }}
                    >
                      <div className={styles['center']}>
                        {detailLoading && (
                          <div className={styles['notice']} role="status">
                            <Spinner size="sm" aria-label={CODE_COPY.openingSession} />
                            <span>{CODE_COPY.openingSession}</span>
                          </div>
                        )}

                        {!detailLoading && truncatedSessionId === selectedSession.id && (
                          <div className={styles['notice']} role="status">
                            <span>{CODE_COPY.earlierTurnsNotShown}</span>
                          </div>
                        )}

                        {!detailLoading && (
                          <CodeTranscript
                            session={selectedSession}
                            items={transcript}
                            approvals={approvals}
                            busy={busy || selectedTurnRunning}
                            busySince={
                              busySince ??
                              selectedBackgroundTurn ??
                              activeStoredTurn?.startedAt ??
                              null
                            }
                            verbose={verbose}
                            onDecideApproval={(approval, decision) =>
                              void handleApproval(approval, decision)
                            }
                            onRetryTask={(goal, mode) => void handleSubmit(goal, mode)}
                          />
                        )}

                        {isNotebookSession && (
                          <NotebookPanel
                            workspace={notebookWorkspace}
                            selectionRevision={renderedSelectionRevision}
                            sessionId={selectedSession.id}
                            sessionReady={selectedSession.state === 'ready'}
                            onSession={(next) => {
                              if (
                                !notebookIdentity?.isCurrent() ||
                                next.id !== notebookSessionId ||
                                renderedSelectionRevision !== selectionRevision.current
                              )
                                return;
                              replaceSession(next, captureView());
                            }}
                          />
                        )}

                        <div ref={transcriptEndRef} />
                      </div>
                    </div>
                  ) : planUpgradeRequired ? (
                    <div className={styles['greetingArea']} data-testid="code-upgrade">
                      <div className={`${styles['center']} ${styles['upgradePanel']}`}>
                        <h1 className={styles['greeting']}>
                          <AgiMark size={GREETING_MARK_SIZE} />
                          {CODE_COPY.upgradeHeading}
                        </h1>
                        <p className={styles['upgradeBody']}>
                          {[CODE_COPY.upgradeBody, upgradeFromPlan].filter(Boolean).join(' ')}
                        </p>
                        <Link href={UPGRADE_PATH} className={styles['upgradeAction']}>
                          {CODE_COPY.upgradeAction}
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className={styles['greetingArea']} data-testid="code-home">
                      <div className={styles['center']}>
                        <h1 className={styles['greeting']}>
                          <AgiMark size={GREETING_MARK_SIZE} spinning={busy} />
                          {/* The nameless variant waits for the account, so the name
                          never pops in after the greeting has already rendered. */}
                          {firstName
                            ? CODE_COPY.greetingWithName.replace(GREETING_NAME_SLOT, firstName)
                            : nameResolved
                              ? CODE_COPY.greeting
                              : null}
                        </h1>
                        {needsLocalFolder && (
                          <div className={styles['setupLinks']}>
                            <button
                              type="button"
                              className={styles['setupChip']}
                              disabled={local.adding || busy}
                              onClick={() => {
                                const owner = captureView(true);
                                void local.addFolder().then((root) => {
                                  if (root && owner.isCurrent()) {
                                    handleDraftChange({
                                      environment: 'local',
                                      localRootId: root.id,
                                    });
                                  }
                                });
                              }}
                            >
                              {local.adding
                                ? LOCAL_CODE_COPY.addingFolder
                                : LOCAL_CODE_COPY.chooseFolder}
                            </button>
                          </div>
                        )}
                        {showSetupLinks && !needsLocalFolder && (
                          <nav className={styles['setupLinks']} aria-label={CODE_COPY.setupLabel}>
                            <span className={styles['setupLabel']}>{CODE_COPY.setupLabel}</span>
                            <div className={styles['setupChips']} data-testid="code-setup-chips">
                              <Link href={CODE_ROUTES.cli} className={styles['setupChip']}>
                                <TerminalSquare size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
                                {CODE_COPY.setupTerminal}
                              </Link>
                              <Link
                                href={CODE_ROUTES.editorExtension}
                                className={styles['setupChip']}
                              >
                                <Code2 size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
                                {CODE_COPY.setupEditor}
                              </Link>
                              <ContinueOnDesktop
                                label={CODE_COPY.setupDesktop}
                                fallbackHref={CODE_ROUTES.desktop}
                                glyphSize={NOTICE_GLYPH_SIZE}
                                className={styles['setupChip']}
                              />
                            </div>
                          </nav>
                        )}
                        <CodeUsageDashboard
                          planTier={accountPlanTier}
                          linkOnly={phone}
                          collapsed={desktopCode}
                        />
                      </div>
                    </div>
                  )}

                  <div className={styles['noticeArea']} data-testid="code-notices">
                    <div className={styles['center']}>{notices}</div>
                  </div>

                  {planUpgradeRequired ? null : archived ? (
                    <div className={styles['composerArea']} data-testid="code-composer-area">
                      <div className={styles['center']}>
                        <div className={styles['closedBanner']} role="status">
                          <span className={styles['closedBannerText']}>
                            {CODE_COPY.archivedBanner}
                          </span>
                          <button
                            type="button"
                            className={styles['primaryButton']}
                            onClick={() => void handleSetArchived(false)}
                          >
                            {CODE_COPY.unarchiveSession}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : closed ? (
                    <div className={styles['composerArea']} data-testid="code-composer-area">
                      <div className={styles['center']}>
                        <div className={styles['closedBanner']} role="status">
                          <span className={styles['closedBannerText']}>
                            {CODE_COPY.closedBanner}
                          </span>
                          <button
                            type="button"
                            className={styles['primaryButton']}
                            onClick={openHome}
                          >
                            {CODE_COPY.closedBannerAction}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <CodeComposer
                      dictationDestination={
                        selectedId ? (selectedSession?.id ?? null) : 'new-cloud-code'
                      }
                      dictationModel={
                        selectedSession
                          ? ((runtimeRunsOwnAgent(selectedSession.runtimeId)
                              ? sessionModelsRef.current[selectedSession.id]
                              : undefined) ?? agentModel)
                          : (runtimeRunsOwnAgent(draft.runtimeId) ? draft.harnessModelId : '') ||
                            agentModel
                      }
                      value={task}
                      onChange={(value) => {
                        draftRevision.current += 1;
                        setTask(value);
                      }}
                      onSubmit={(text, repository, pictures) =>
                        void handleSubmit(text, turnMode, repository, pictures)
                      }
                      {...(!selectedId
                        ? {
                            onSubmitInBackground: async (text, repository, pictures) =>
                              (await handleSubmit(text, turnMode, repository, pictures, true)) ===
                              true,
                          }
                        : {})}
                      startBlockedBy={commandAccessGroup ? commandAccessNoticeId : undefined}
                      disabled={
                        isLocalDraft && !selectedSession
                          ? draftFolder === null ||
                            localDraftBlocked !== null ||
                            (localDraftPlanRequired && !commandAccessGroup)
                          : !canCreate
                      }
                      busy={busy || selectedTurnRunning}
                      showChips={!selectedSession}
                      showHint={
                        !selectedSession && !isLocalDraft && sessions.length === 0 && !hintDismissed
                      }
                      onDismissHint={() => setHintDismissed(true)}
                      draft={draft}
                      onDraftChange={handleDraftChange}
                      onOpenEmptyEnvironment={handleOpenEmptyEnvironment}
                      runtimes={runtimes}
                      harnessModels={harnessModels}
                      local={composerLocal}
                      api={api}
                      turnRunning={selectedTurnRunning}
                      stopping={stopping}
                      onStop={() => void handleStopTurn()}
                      contextTokens={
                        selectedSession
                          ? selectedSession.contextInputTokens + selectedSession.contextOutputTokens
                          : null
                      }
                      contextWindow={agentContextWindow}
                      turnControls={turnControls}
                      turnMode={turnMode}
                      onTurnModeChange={setTurnMode}
                    />
                  )}
                </div>

                {showDraftTools && draftSideTool && (
                  <CodeDraftSidePanel
                    tool={draftSideTool}
                    available={draftTools}
                    expanded={draftSideExpanded}
                    terminalUnavailableReason={draftTerminalReason}
                    onOpenTerminal={openDraftTerminal}
                    onExpandedChange={setDraftSideExpanded}
                    onToolChange={changeDraftSideTool}
                  />
                )}
                {selectedSession && changesOpen && !localSession && (
                  <CodeChangesPanel
                    key={renderedSelectionRevision}
                    session={selectedSession}
                    entries={entries}
                    canRun={canRun}
                    committing={committing}
                    commitNotice={commitNotice}
                    running={running}
                    wide={changesWide}
                    changes={changes}
                    changesLoading={changesLoading}
                    pullRequestBusy={pullRequestBusy}
                    onToggleWide={() => setChangesWide((open) => !open)}
                    onCommit={(message, files) => void handleCommit(message, files)}
                    onDiscard={(files) => void handleDiscard(files)}
                    onRunCommand={(command) => void handleRunCommand(command)}
                    onRefreshChanges={() => void loadChanges(selectedSession.id)}
                    onCreatePullRequest={() => void handleCreatePullRequest()}
                    onLoadPullRequestStatus={api.pullRequestStatus}
                    onClose={() => setChangesOpen(false)}
                  />
                )}
              </div>
            </>
          )}
          <WorkspaceTerminalDocks terminals={terminals} activeRootId={activeTerminalRootId} />
        </div>
        {panes.active &&
          panes.panes.map((entry) => (
            <CloudCodePage
              key={entry.key}
              api={injectedApi}
              sessionId={entry.sessionId}
              pane={{
                focused: panes.isFocused(entry.key),
                initialSession: sessions.find((session) => session.id === entry.sessionId) ?? null,
                onFocus: () => panes.focus(entry.key),
                onClose: () => panes.close(entry.key),
                onSessionOpened: (id) => panes.replace(entry.key, id),
                onSessionChange: (next) => replaceSession(next, captureView()),
              }}
            />
          ))}
      </div>
    </CodePageFrame>
  );
}
