'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useUIStore } from '@shared/stores/layout-store';
import { getModelMetadata } from '@shared/config/llm';
import { toUserMessage } from '@/lib/user-error-message';
import { NotebookPanel } from '@/features/notebook/NotebookPanel';
import {
  cloudCodeApi,
  type CloudCodeAgentTurn,
  type CloudCodeApi,
} from './services/cloud-code-api';
import {
  CODE_COPY,
  CODE_SIZES,
  DEFAULT_CODE_FILTERS,
  DEFAULT_RUNTIME_ID,
  filterAndSortSessions,
  parseExtraHosts,
  sessionContextChip,
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
const CHANGED_FILES_COMMAND = 'git status --porcelain';

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
}

export function CloudCodePage({ api = cloudCodeApi }: CloudCodePageProps) {
  const [availability, setAvailability] = useState<CloudCodeAvailability | null>(null);
  const [runtimes, setRuntimes] = useState<CloudCodeRuntime[]>([]);
  const [sessions, setSessions] = useState<CloudCodeSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CloudCodeTerminalEntry[]>([]);
  const [turns, setTurns] = useState<CodeTurnRecord[]>([]);
  const [approvals, setApprovals] = useState<CodeApprovalPrompt[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CodeDraft>(EMPTY_CODE_DRAFT);
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitNotice, setCommitNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState<CodeSessionFilters>(DEFAULT_CODE_FILTERS);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesWide, setChangesWide] = useState(false);
  const [changedFiles, setChangedFiles] = useState<string[] | null>(null);
  const [verbose, setVerbose] = useState(false);
  const [busySince, setBusySince] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [railDrawerOpen, setRailDrawerOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const railTriggerRef = useRef<HTMLButtonElement>(null);

  const { firstName, nameResolved } = useGreeting();
  const selectedModelId = useModelStore((state) => state.selectedModelId);
  const setShellCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(`(max-width: ${CODE_SIZES.narrowViewport}px)`);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // This surface has its own left column, so two full sidebars would sit side by
  // side. The shell's rail collapses while Code is mounted and the reader's own
  // choice is restored when they leave.
  useEffect(() => {
    const previous = useUIStore.getState().sidebarCollapsed;
    setShellCollapsed(true);
    return () => setShellCollapsed(previous);
  }, [setShellCollapsed]);

  const replaceSession = useCallback((next: CloudCodeSession) => {
    setSessions((current) => {
      const exists = current.some((session) => session.id === next.id);
      const updated = exists
        ? current.map((session) => (session.id === next.id ? next : session))
        : [next, ...current];
      return updated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);

  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      setPageLoading(true);
      setError(null);
      try {
        const body = await api.list(signal);
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
    void loadSessions(controller.signal);
    return () => controller.abort();
  }, [loadSessions]);

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
      })
      .catch((detailError) => {
        if (detailError instanceof DOMException && detailError.name === 'AbortError') return;
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

  const transcript = useMemo(() => buildCodeTranscript(entries, turns), [entries, turns]);

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
              stopReason: turn.stopReason,
              finalMessage: turn.finalMessage,
              errorMessage: turn.errorMessage ?? null,
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
          at: new Date().toISOString(),
          goal,
          stopReason: null,
          finalMessage: '',
          errorMessage: null,
        },
      ]);
      setBusy(true);
      setBusySince(new Date().toISOString());
      setError(null);
      try {
        const turn = await api.startAgentTurn(session.id, {
          goal,
          model: resolveAgentModel(selectedModelId),
          idempotencyKey: makeRequestId(),
        });
        applyTurn(recordId, turn, goal);
        void loadSessions();
      } catch (turnError) {
        setTurns((current) => current.filter((record) => record.id !== recordId));
        setTask(goal);
        setError(friendlyError(turnError));
        void loadSessions();
      } finally {
        setBusy(false);
        setBusySince(null);
      }
    },
    [api, applyTurn, loadSessions, selectedModelId],
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
          repositoryUrl: draft.repositoryUrl.trim() || null,
          repositoryBranch: draft.repositoryBranch.trim() || null,
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
        return body.session;
      } catch (createError) {
        setError(friendlyError(createError));
        return null;
      } finally {
        setBusy(false);
        setBusySince(null);
      }
    },
    [api, busy, canCreate, draft, replaceSession],
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
          at: new Date().toISOString(),
          goal: approval.goal,
          stopReason: null,
          finalMessage: '',
          errorMessage: null,
        },
      ]);
      setBusy(true);
      setBusySince(new Date().toISOString());
      setError(null);
      try {
        const turn = await api.decideApproval(selectedSession.id, {
          turnId: approval.turnId,
          stepIndex: approval.stepIndex,
          decision,
        });
        applyTurn(recordId, turn, approval.goal);
        void loadSessions();
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
      }
    },
    [api, applyTurn, busy, loadSessions, selectedSession],
  );

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
        void loadSessions();
      } finally {
        setRunning(false);
      }
    },
    [api, canRun, loadSessions, replaceSession, running, selectedSession],
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
      } catch (commitError) {
        setError(friendlyError(commitError));
      } finally {
        setCommitting(false);
      }
    },
    [api, committing, replaceSession, selectedSession],
  );

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

  /**
   * `git status` is the only change source the executor exposes: its git surface
   * is clone, add, commit and push with no status or diff, so this runs the real
   * command and the terminal entry it writes shows up in the transcript.
   */
  const handleCheckChanges = useCallback(async () => {
    if (!canRun || !selectedSession || running) return;
    setRunning(true);
    setError(null);
    try {
      const body = await api.run(selectedSession.id, CHANGED_FILES_COMMAND);
      replaceSession(body.session);
      setEntries((current) => [...current, body.terminalEntry]);
      setChangedFiles(
        body.terminalEntry.stdout.split('\n').filter((line) => line.trim().length > 0),
      );
    } catch (checkError) {
      setError(friendlyError(checkError));
    } finally {
      setRunning(false);
    }
  }, [api, canRun, replaceSession, running, selectedSession]);

  const openHome = useCallback(() => {
    setSelectedId(null);
    setTurns([]);
    setEntries([]);
    setChangesOpen(false);
    setChangedFiles(null);
    setError(null);
    setCommitNotice(null);
    setRailDrawerOpen(false);
  }, []);

  const openSession = useCallback((sessionId: string) => {
    setSelectedId(sessionId);
    setTurns([]);
    setChangesOpen(false);
    setChangedFiles(null);
    setError(null);
    setCommitNotice(null);
    setRailDrawerOpen(false);
  }, []);

  const railProps = {
    sessions: railSessions,
    totalSessions: sessions.length,
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

  const closed = selectedSession?.state === 'closed';
  const isNotebookSession = selectedSession?.runtimeId === NOTEBOOK_TEMPLATE_ID;

  const notices = (
    <>
      {unavailableNotice && (
        <div className={styles['notice']} role="status">
          <TriangleAlert size={NOTICE_GLYPH_SIZE} aria-hidden="true" />
          <span>{unavailableNotice}</span>
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
              onClick={() => void loadSessions()}
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
    <WebAppShell narrowHeaderSlot={narrowHeaderSlot}>
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
                  <h1 className={styles['headerTitle']}>{selectedSession.title}</h1>
                  <span className={styles['headerChip']}>
                    {sessionContextChip(selectedSession)}
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
                      onOpenTerminal={() => setChangesOpen(true)}
                      onSetVerbose={setVerbose}
                      onEditEnvironment={() => setChangesOpen(true)}
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

              {closed ? (
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
                changedFiles={changedFiles}
                onToggleWide={() => setChangesWide((open) => !open)}
                onCommit={(message) => void handleCommit(message)}
                onRunCommand={(command) => void handleRunCommand(command)}
                onCheckChanges={() => void handleCheckChanges()}
                onClose={() => setChangesOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
    </WebAppShell>
  );
}
