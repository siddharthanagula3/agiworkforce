'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PanelLeft,
  PanelsTopLeft,
  RefreshCw,
  TerminalSquare,
  TriangleAlert,
  X,
} from '@agiworkforce/icons';
import { Sheet, SheetContent, SheetTitle, Spinner, useConfirmAction } from '@agiworkforce/ui';
import type {
  CloudCodeAgentTurnRecord,
  CloudCodeAvailability,
  CloudCodeRuntime,
  CloudCodeSession,
  CloudCodeTerminalEntry,
} from '@agiworkforce/types';
import { getRoutingSlotModel, NOTEBOOK_TEMPLATE_ID } from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { useGreeting } from '@features/chat/components/GreetingBanner/useGreeting';
import { useModelStore } from '@shared/stores/model-store';
import { getModelMetadata } from '@shared/config/llm';
import { toUserMessage } from '@/lib/user-error-message';
import { NotebookPanel } from '@/features/notebook/NotebookPanel';
import {
  cloudCodeApi,
  CloudCodeApiError,
  type CloudCodeAgentTurn,
  type CloudCodeApi,
  type CloudCodeChanges,
} from './services/cloud-code-api';
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
  parseExtraHosts,
  sessionContextChip,
  stopReasonIsRetryable,
  type CodeSessionFilters,
} from './code-surface';
import {
  buildCodeTranscript,
  type CodeApprovalPrompt,
  type CodeTurnRecord,
} from './code-transcript';
import { CodeRail } from './components/CodeRail';
import { CodeComposer, EMPTY_CODE_DRAFT, type CodeDraft } from './components/CodeComposer';
import { CodeTranscript } from './components/CodeTranscript';
import { CodeChangesPanel } from './components/CodeChangesPanel';
import { CodeSessionMenu } from './components/CodeSessionMenu';
import styles from './CloudCodePage.module.css';

const CODE_ROUTING_SLOT = 'coding_balanced';
const HEADER_GLYPH_SIZE = 16;
const NOTICE_GLYPH_SIZE = 16;
const DEFAULT_SESSION_TITLE_WORDS = 6;
const GREETING_MARK_SIZE = 28;
const GREETING_NAME_SLOT = '{name}';
const DOCUMENT_TITLE_SEPARATOR = ' · ';
const MISSING_SESSION_STATUSES = new Set([403, 404]);
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

function toTurnRecord(record: CloudCodeAgentTurnRecord): CodeTurnRecord {
  return {
    id: record.turnId,
    turnId: record.turnId,
    at: record.createdAt,
    goal: record.goal,
    stopReason: record.stopReason,
    finalMessage: record.finalMessage,
    errorMessage: record.errorMessage,
    steps: record.steps,
    retryable: record.stopReason !== null && stopReasonIsRetryable(record.stopReason),
  };
}

function titleFromTask(task: string): string {
  const words = task.trim().split(/\s+/).slice(0, DEFAULT_SESSION_TITLE_WORDS).join(' ');
  return words.length > 0 ? words : CODE_COPY.surface;
}

function resolveAgentModel(selectedModelId: string | null): string {
  const capable = selectedModelId ? getModelMetadata(selectedModelId)?.capabilities.tools : false;
  return capable && selectedModelId ? selectedModelId : getRoutingSlotModel(CODE_ROUTING_SLOT);
}

export interface CloudCodePageProps {
  api?: CloudCodeApi;
  /** The session in the URL. Absent on the surface root, which is the home. */
  sessionId?: string;
}

export function CloudCodePage({ api = cloudCodeApi, sessionId }: CloudCodePageProps) {
  const [availability, setAvailability] = useState<CloudCodeAvailability | null>(null);
  const [runtimes, setRuntimes] = useState<CloudCodeRuntime[]>([]);
  const [sessions, setSessions] = useState<CloudCodeSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(sessionId ?? null);
  const [entries, setEntries] = useState<CloudCodeTerminalEntry[]>([]);
  const [turns, setTurns] = useState<CodeTurnRecord[]>([]);
  const [approvals, setApprovals] = useState<CodeApprovalPrompt[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<CodeDraft>(EMPTY_CODE_DRAFT);
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitNotice, setCommitNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<CodeSessionFilters>(DEFAULT_CODE_FILTERS);
  const statusFilter: CodeStatusFilter = filters.status;
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesWide, setChangesWide] = useState(false);
  const [changes, setChanges] = useState<CloudCodeChanges | null>(null);
  const [changesLoading, setChangesLoading] = useState(false);
  const [pullRequestBusy, setPullRequestBusy] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [busySince, setBusySince] = useState<string | null>(null);
  const [turnRunning, setTurnRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [hiddenSessionsExist, setHiddenSessionsExist] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [hintDismissed, setHintDismissed] = useState(false);
  const [railDrawerOpen, setRailDrawerOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const railTriggerRef = useRef<HTMLButtonElement>(null);
  const hiddenProbeRef = useRef(false);
  const routeSessionRef = useRef<string | null>(sessionId ?? null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const routerRef = useRef(router);
  const { firstName, nameResolved } = useGreeting();
  const selectedModelId = useModelStore((state) => state.selectedModelId);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

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
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has(CODE_MISSING_SESSION_PARAM)) return;
    setRouteNotice(CODE_COPY.sessionNotFound);
    routerRef.current.replace(CODE_ROUTES.root);
  }, []);

  useEffect(() => {
    const next = sessionId ?? null;
    if (routeSessionRef.current === next) return;
    routeSessionRef.current = next;
    if (next !== null) setRouteNotice(null);
    setSelectedId(next);
    setTurns([]);
    setEntries([]);
    setChangesOpen(false);
    setChanges(null);
    setCommitNotice(null);
  }, [sessionId]);

  const replaceSession = useCallback((next: CloudCodeSession) => {
    setSessions((current) => {
      const exists = current.some((session) => session.id === next.id);
      const updated = exists
        ? current.map((session) => (session.id === next.id ? next : session))
        : [next, ...current];
      return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  const loadChanges = useCallback(
    async (sessionId: string, signal?: AbortSignal) => {
      setChangesLoading(true);
      try {
        const body = await api.changes(sessionId, signal);
        replaceSession(body.session);
        setChanges(body);
      } catch (changesError) {
        if (changesError instanceof DOMException && changesError.name === 'AbortError') return;
        setError(friendlyError(changesError));
      } finally {
        setChangesLoading(false);
      }
    },
    [api, replaceSession],
  );

  const loadSessions = useCallback(
    async (status: CodeStatusFilter, signal?: AbortSignal) => {
      setPageLoading(true);
      setError(null);
      try {
        const body = await api.list(status, signal);
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
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(friendlyError(loadError));
      } finally {
        setPageLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(statusFilter, controller.signal);
    return () => controller.abort();
  }, [loadSessions, statusFilter]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessions],
  );

  const canCreate =
    availability?.deploymentEnabled === true &&
    availability.storageReady === true &&
    availability.planEntitled === true;
  const canRun = canCreate;

  useEffect(() => {
    if (!selectedId) {
      setEntries([]);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setError(null);
    void api
      .get(selectedId, controller.signal)
      .then((body) => {
        replaceSession(body.session);
        setEntries(body.terminalEntries);
        // Merge rather than replace: this read races the turn running in this
        // tab, and a response computed before that turn's row existed used to
        // wipe it out of the transcript.
        setTurns((current) => {
          const stored = body.turns.map(toTurnRecord);
          const storedIds = new Set(stored.map((record) => record.id));
          return [
            ...stored,
            ...current.filter((record) => !record.turnId || !storedIds.has(record.turnId)),
          ];
        });
      })
      .catch((detailError) => {
        if (detailError instanceof DOMException && detailError.name === 'AbortError') return;
        if (
          detailError instanceof CloudCodeApiError &&
          MISSING_SESSION_STATUSES.has(detailError.status)
        ) {
          setSelectedId(null);
          setRouteNotice(CODE_COPY.sessionNotFound);
          routerRef.current.replace(codeHomeAfterMissingSession());
          return;
        }
        setError(friendlyError(detailError));
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [api, replaceSession, selectedId]);

  // Approvals outlive the tab that created them (the backend persists them with a
  // 30-minute expiry), so a reload or a session switch has to re-read them or a
  // half-finished agent turn becomes unresumable from the UI.
  useEffect(() => {
    setApprovals([]);
    if (!selectedId || !canRun) return;
    const controller = new AbortController();
    void api
      .listApprovals(selectedId, controller.signal)
      .then(setApprovals)
      .catch((approvalsError) => {
        if (approvalsError instanceof DOMException && approvalsError.name === 'AbortError') return;
        setError(friendlyError(approvalsError));
      });
    return () => controller.abort();
  }, [api, canRun, selectedId]);

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
    void Promise.resolve(api.list('all', controller.signal))
      .then((body) => setHiddenSessionsExist(body.sessions.length > 0))
      .catch(() => undefined);
    return () => controller.abort();
  }, [api, pageLoading, sessions.length, statusFilter]);

  useEffect(() => {
    if (!renaming) return;
    const frame = window.requestAnimationFrame(() => titleInputRef.current?.select());
    return () => window.cancelAnimationFrame(frame);
  }, [renaming]);

  const transcript = useMemo(() => buildCodeTranscript(entries, turns), [entries, turns]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const title = selectedSession?.title.trim();
    document.title = title
      ? `${title}${DOCUMENT_TITLE_SEPARATOR}${CODE_COPY.surface}`
      : CODE_COPY.surface;
  }, [selectedSession]);

  useEffect(() => {
    const end = transcriptEndRef.current;
    if (typeof end?.scrollIntoView === 'function') end.scrollIntoView({ block: 'nearest' });
  }, [transcript, busy]);

  const railSessions = useMemo(() => filterAndSortSessions(sessions, filters), [sessions, filters]);

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
              retryable: stopReasonIsRetryable(turn.stopReason),
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

  const startTurn = useCallback(
    async (session: CloudCodeSession, goal: string) => {
      const recordId = makeRequestId();
      setTurns((current) => [
        ...current,
        {
          id: recordId,
          turnId: null,
          at: new Date().toISOString(),
          goal,
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
        const turn = await api.startAgentTurn(session.id, {
          goal,
          model: resolveAgentModel(selectedModelId),
          idempotencyKey: makeRequestId(),
        });
        applyTurn(recordId, turn, goal);
        void loadSessions(statusFilter);
      } catch (turnError) {
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
        setTask(goal);
        void loadSessions(statusFilter);
      } finally {
        setBusy(false);
        setBusySince(null);
        setTurnRunning(false);
        setStopping(false);
      }
    },
    [api, applyTurn, loadSessions, selectedModelId, statusFilter],
  );

  const createSession = useCallback(
    async (title: string): Promise<CloudCodeSession | null> => {
      if (!canCreate || busy) return null;
      if (draft.networkAccess === 'full' && !draft.fullNetworkAccepted) return null;
      setBusy(true);
      setBusySince(new Date().toISOString());
      setError(null);
      try {
        const body = await api.create({
          requestId: makeRequestId(),
          title,
          repository: draft.repository
            ? { ...draft.repository, branch: draft.repositoryBranch.trim() || null }
            : null,
          repositoryUrl: draft.repository ? null : draft.repositoryUrl.trim() || null,
          repositoryBranch: draft.repository ? null : draft.repositoryBranch.trim() || null,
          networkAccess: draft.networkAccess,
          fullNetworkAcknowledged:
            draft.networkAccess === 'full' ? draft.fullNetworkAccepted : undefined,
          runtimeId: draft.runtimeId || null,
          extraHosts:
            draft.networkAccess === 'full' ? undefined : parseExtraHosts(draft.extraHosts),
        });
        replaceSession(body.session);
        setSelectedId(body.session.id);
        setEntries(body.terminalEntries);
        setTurns([]);
        setDraft(EMPTY_CODE_DRAFT);
        router.push(codeSessionPath(body.session.id));
        return body.session;
      } catch (createError) {
        setError(friendlyError(createError));
        return null;
      } finally {
        setBusy(false);
        setBusySince(null);
      }
    },
    [api, busy, canCreate, draft, replaceSession, router],
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!canCreate || busy) return;

      if (selectedSession && selectedSession.state === 'ready') {
        setTask('');
        await startTurn(selectedSession, text);
        return;
      }

      const created = await createSession(titleFromTask(text));
      if (!created) {
        setTask(text);
        return;
      }
      setTask('');
      if (created.state === 'ready') await startTurn(created, text);
    },
    [busy, canCreate, createSession, selectedSession, startTurn],
  );

  const handleOpenEmptyEnvironment = useCallback(() => {
    void createSession(CODE_COPY.surface);
  }, [createSession]);

  const handleApproval = useCallback(
    async (approval: CodeApprovalPrompt, decision: 'approve' | 'reject') => {
      if (!selectedSession || busy) return;
      const recordId = makeRequestId();
      setTurns((current) => [
        ...current,
        {
          id: recordId,
          turnId: approval.turnId,
          at: new Date().toISOString(),
          goal: approval.goal,
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
        applyTurn(recordId, turn, approval.goal);
        void loadSessions(statusFilter);
      } catch (decisionError) {
        setTurns((current) => current.filter((record) => record.id !== recordId));
        setError(friendlyError(decisionError));
        // The approval may have expired or been decided elsewhere; re-read rather
        // than leaving a card that can no longer be acted on.
        void api
          .listApprovals(selectedSession.id)
          .then(setApprovals)
          .catch(() => setApprovals([]));
      } finally {
        setBusy(false);
        setBusySince(null);
        setTurnRunning(false);
        setStopping(false);
      }
    },
    [api, applyTurn, busy, loadSessions, selectedSession, statusFilter],
  );

  const handleStopTurn = useCallback(async () => {
    if (!selectedSession || !turnRunning || stopping) return;
    setStopping(true);
    try {
      await api.cancelAgentTurn(selectedSession.id);
    } catch (stopError) {
      setStopping(false);
      setError(friendlyError(stopError));
    }
  }, [api, selectedSession, stopping, turnRunning]);

  const handleRunCommand = useCallback(
    async (command: string) => {
      if (!canRun || !selectedSession || running) return;
      setRunning(true);
      setError(null);
      try {
        const body = await api.run(selectedSession.id, command);
        replaceSession(body.session);
        setEntries((current) => [...current, body.terminalEntry]);
      } catch (runError) {
        setError(friendlyError(runError));
        void loadSessions(statusFilter);
      } finally {
        setRunning(false);
      }
    },
    [api, canRun, loadSessions, replaceSession, running, selectedSession, statusFilter],
  );

  const handleCommit = useCallback(
    async (message: string) => {
      if (!selectedSession || committing) return;
      setCommitting(true);
      setError(null);
      setCommitNotice(null);
      try {
        const result = await api.commit(selectedSession.id, message);
        replaceSession(result.session);
        setCommitNotice(result.push.ok ? CODE_COPY.commitPushed : result.push.output);
        void loadChanges(selectedSession.id);
      } catch (commitError) {
        setError(friendlyError(commitError));
      } finally {
        setCommitting(false);
      }
    },
    [api, committing, loadChanges, replaceSession, selectedSession],
  );

  const openHome = useCallback(() => {
    setSelectedId(null);
    setTurns([]);
    setEntries([]);
    setChangesOpen(false);
    setChanges(null);
    setError(null);
    setCommitNotice(null);
    setRailDrawerOpen(false);
    router.push(CODE_ROUTES.root);
  }, [router]);

  const handleRename = useCallback(async () => {
    const session = selectedSession;
    const next = titleDraft.trim();
    setRenaming(false);
    if (!session || !next || next === session.title) return;
    try {
      replaceSession(await api.rename(session.id, next));
    } catch (renameError) {
      setError(friendlyError(renameError));
    }
  }, [api, replaceSession, selectedSession, titleDraft]);

  const handleSetArchived = useCallback(
    async (archived: boolean) => {
      const session = selectedSession;
      if (!session) return;
      try {
        replaceSession(await api.setArchived(session.id, archived));
      } catch (archiveError) {
        setError(friendlyError(archiveError));
      }
    },
    [api, replaceSession, selectedSession],
  );

  const requestDelete = useCallback(() => {
    const session = selectedSession;
    if (!session) return;
    confirm({
      title: CODE_COPY.deleteSessionTitle,
      description: CODE_COPY.deleteSessionDescription,
      confirmLabel: CODE_COPY.deleteSessionConfirm,
      destructive: true,
      onConfirm: async () => {
        try {
          await api.deleteSession(session.id);
          setSessions((current) => current.filter((entry) => entry.id !== session.id));
          openHome();
        } catch (deleteError) {
          setError(friendlyError(deleteError));
        }
      },
    });
  }, [api, confirm, openHome, selectedSession]);

  const requestClose = useCallback(() => {
    const session = selectedSession;
    if (!session) return;
    confirm({
      title: CODE_COPY.closeSessionTitle,
      description: CODE_COPY.closeSessionDescription,
      confirmLabel: CODE_COPY.closeSessionConfirm,
      destructive: true,
      onConfirm: async () => {
        try {
          const closed = await api.close(session.id);
          replaceSession(closed);
        } catch (closeError) {
          setError(friendlyError(closeError));
        }
      },
    });
  }, [api, confirm, replaceSession, selectedSession]);

  const handleCreatePullRequest = useCallback(async () => {
    if (!selectedSession || pullRequestBusy) return;
    setPullRequestBusy(true);
    setError(null);
    try {
      const body = await api.createPullRequest(selectedSession.id);
      replaceSession(body.session);
    } catch (pullRequestError) {
      setError(friendlyError(pullRequestError));
    } finally {
      setPullRequestBusy(false);
    }
  }, [api, pullRequestBusy, replaceSession, selectedSession]);

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
    [router],
  );

  const railProps = {
    sessions: railSessions,
    hiddenSessionsExist,
    selectedId,
    loading: pageLoading,
    filters,
    onFiltersChange: (patch: Partial<CodeSessionFilters>) =>
      setFilters((current) => ({ ...current, ...patch })),
    onNewSession: openHome,
    onSelectSession: openSession,
  };

  const unavailableNotice = availability
    ? !availability.deploymentEnabled
      ? CODE_COPY.deploymentDisabled
      : !availability.storageReady
        ? CODE_COPY.storageNotReady
        : !availability.planEntitled
          ? CODE_COPY.planNotEntitled
          : null
    : null;

  const agentContextWindow =
    getModelMetadata(resolveAgentModel(selectedModelId))?.contextWindow ?? null;
  const closed = selectedSession?.state === 'closed';
  const archived = selectedSession?.archivedAt != null;
  const isNotebookSession = selectedSession?.runtimeId === NOTEBOOK_TEMPLATE_ID;

  const notices = (
    <>
      {unavailableNotice && (
        <div className={styles['notice']} role="status">
          <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
          <span>{unavailableNotice}</span>
        </div>
      )}
      {routeNotice && (
        <div className={styles['notice']} role="status">
          <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
          <span>{routeNotice}</span>
          <span className={styles['noticeActions']}>
            <button
              type="button"
              className={styles['secondaryButton']}
              onClick={() => setRouteNotice(null)}
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

  const narrowHeaderSlot = narrow ? (
    <div className={styles['appBarSlot']}>
      <span className={styles['appBarTitle']}>{CODE_COPY.surface}</span>
      <button
        ref={railTriggerRef}
        type="button"
        className={styles['headerButton']}
        aria-label={CODE_COPY.recents}
        aria-expanded={railDrawerOpen}
        onClick={() => setRailDrawerOpen(true)}
      >
        <PanelLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
      </button>
    </div>
  ) : null;

  return (
    <WebAppShell narrowHeaderSlot={narrowHeaderSlot} rail={false}>
      {confirmDialog}
      <div className={styles['surface']}>
        {!railCollapsed && (
          <div className={`${styles['rail']} ${styles['railDocked']}`}>
            <CodeRail {...railProps} onCollapse={() => setRailCollapsed(true)} />
          </div>
        )}

        {narrow && (
          <Sheet open={railDrawerOpen} onOpenChange={setRailDrawerOpen}>
            <SheetContent
              side="left"
              className="w-[290px] max-w-[85vw] gap-0 overflow-y-auto p-0"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                railTriggerRef.current?.focus();
              }}
            >
              <SheetTitle className="sr-only">{CODE_COPY.surface}</SheetTitle>
              <div className={`${styles['rail']} ${styles['railDrawer']}`}>
                <CodeRail {...railProps} />
              </div>
            </SheetContent>
          </Sheet>
        )}

        <div className={styles['main']}>
          {(selectedSession || (railCollapsed && !narrow)) && (
            <header className={styles['header']}>
              {!narrow && railCollapsed && (
                <button
                  type="button"
                  className={styles['headerButton']}
                  aria-label={CODE_COPY.expandRail}
                  onClick={() => setRailCollapsed(false)}
                >
                  <PanelLeft size={HEADER_GLYPH_SIZE} aria-hidden="true" />
                </button>
              )}
              {!selectedSession && railCollapsed && (
                <h1 className={styles['headerTitle']}>{CODE_COPY.surface}</h1>
              )}
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
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onBlur={() => void handleRename()}
                      onKeyDown={(event) => {
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
                      onOpenTerminal={() => setChangesOpen(true)}
                      onSetVerbose={setVerbose}
                      onEditEnvironment={() => setChangesOpen(true)}
                      onRename={() => {
                        setTitleDraft(selectedSession.title);
                        setRenaming(true);
                      }}
                      onSetArchived={(next) => void handleSetArchived(next)}
                      onDeleteSession={requestDelete}
                      onCloseSession={requestClose}
                    />
                  </div>
                </>
              )}
            </header>
          )}

          <div className={styles['body']}>
            <div className={styles['column']}>
              {selectedSession ? (
                <div className={styles['scroll']}>
                  <div className={styles['center']}>
                    {notices}

                    {detailLoading && (
                      <div className={styles['notice']} role="status">
                        <Spinner size="sm" aria-label={CODE_COPY.openingSession} />
                        <span>{CODE_COPY.openingSession}</span>
                      </div>
                    )}

                    {!detailLoading && (
                      <CodeTranscript
                        session={selectedSession}
                        items={transcript}
                        approvals={approvals}
                        busy={busy}
                        busySince={busySince}
                        verbose={verbose}
                        onDecideApproval={(approval, decision) =>
                          void handleApproval(approval, decision)
                        }
                        onRetryTask={(goal) => void handleSubmit(goal)}
                      />
                    )}

                    {isNotebookSession && (
                      <NotebookPanel
                        sessionId={selectedSession.id}
                        sessionReady={selectedSession.state === 'ready'}
                        onSession={replaceSession}
                      />
                    )}

                    <div ref={transcriptEndRef} />
                  </div>
                </div>
              ) : (
                <div className={styles['greetingArea']}>
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
                    {notices}
                  </div>
                </div>
              )}

              {archived ? (
                <div className={styles['composerArea']}>
                  <div className={styles['center']}>
                    <div className={styles['closedBanner']} role="status">
                      <span className={styles['closedBannerText']}>{CODE_COPY.archivedBanner}</span>
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
                <div className={styles['composerArea']}>
                  <div className={styles['center']}>
                    <div className={styles['closedBanner']} role="status">
                      <span className={styles['closedBannerText']}>{CODE_COPY.closedBanner}</span>
                      <button type="button" className={styles['primaryButton']} onClick={openHome}>
                        {CODE_COPY.closedBannerAction}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <CodeComposer
                  value={task}
                  onChange={setTask}
                  onSubmit={(text) => void handleSubmit(text)}
                  disabled={!canCreate}
                  busy={busy}
                  showChips={!selectedSession}
                  showHint={!selectedSession && sessions.length === 0 && !hintDismissed}
                  onDismissHint={() => setHintDismissed(true)}
                  draft={draft}
                  onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
                  onOpenEmptyEnvironment={handleOpenEmptyEnvironment}
                  runtimes={runtimes}
                  api={api}
                  turnRunning={turnRunning}
                  stopping={stopping}
                  onStop={() => void handleStopTurn()}
                  contextTokens={
                    selectedSession
                      ? selectedSession.contextInputTokens + selectedSession.contextOutputTokens
                      : null
                  }
                  contextWindow={agentContextWindow}
                />
              )}
            </div>

            {selectedSession && changesOpen && (
              <CodeChangesPanel
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
                onCommit={(message) => void handleCommit(message)}
                onRunCommand={(command) => void handleRunCommand(command)}
                onRefreshChanges={() => void loadChanges(selectedSession.id)}
                onCreatePullRequest={() => void handleCreatePullRequest()}
                onClose={() => setChangesOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </WebAppShell>
  );
}
