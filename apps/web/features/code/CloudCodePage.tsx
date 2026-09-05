'use client';

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Blocks,
  Bot,
  ChevronRight,
  Download,
  ExternalLink,
  GitBranch,
  GitFork,
  Globe2,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  CloudCodeAvailability,
  CloudCodeRuntime,
  CloudCodeNetworkAccess,
  CloudCodeSession,
  CloudCodeTerminalEntry,
} from '@agiworkforce/types';
import { getRoutingSlotModel, NOTEBOOK_TEMPLATE_ID } from '@agiworkforce/types';
import { WebAppShell } from '@shared/components/layout/WebAppShell';
import {
  cloudCodeApi,
  type CloudCodeAgentTurn,
  type CloudCodeApi,
} from './services/cloud-code-api';
import styles from './CloudCodePage.module.css';
import { toUserMessage } from '@/lib/user-error-message';
import { selectHarnessRunner } from '@/lib/e2b/harnesses/registry';
import { HARNESS_MAX_TURNS, HARNESS_RUN_DEADLINE_MS } from '@/lib/e2b/harnesses/budget';
import { NotebookPanel } from '@/features/notebook/NotebookPanel';

const AGENT_MODEL_ID = getRoutingSlotModel('coding_balanced');
const HARNESS_HINT_TASK_PLACEHOLDER = 'your task';
const MS_PER_MINUTE = 60_000;
const HARNESS_BUDGET_MINUTES = Math.round(HARNESS_RUN_DEADLINE_MS / MS_PER_MINUTE);

function headlessHarnessCommand(runtimeId: string): string | null {
  const runner = selectHarnessRunner(runtimeId);
  if (!runner) return null;
  return runner.buildCommand({
    prompt: HARNESS_HINT_TASK_PLACEHOLDER,
    workspacePath: '',
    maxTurns: HARNESS_MAX_TURNS,
    timeoutMs: HARNESS_RUN_DEADLINE_MS,
    resumeSessionId: null,
  });
}

type ApprovalPrompt = {
  turnId: string;
  stepIndex: number;
  command: string;
  reason: string;
  goal: string;
};

const NETWORK_OPTIONS: Array<{
  id: CloudCodeNetworkAccess;
  label: string;
  description: string;
  icon: typeof WifiOff;
}> = [
  {
    id: 'none',
    label: 'No network',
    description: 'Safest default. Commands cannot reach the internet.',
    icon: WifiOff,
  },
  {
    id: 'trusted',
    label: 'Trusted hosts',
    description: 'GitHub, npm, and PyPI only. Recommended for repositories.',
    icon: ShieldCheck,
  },
  {
    id: 'full',
    label: 'Full network',
    description: 'Unrestricted outbound internet for this isolated environment.',
    icon: Globe2,
  },
];

function parseExtraHosts(value: string): string[] {
  return value
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `code_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function describeRuntime(runtime: CloudCodeRuntime): string {
  const cores = runtime.cpuCount > 0 ? `${runtime.cpuCount} vCPU` : null;
  const memory = runtime.memoryMB > 0 ? `${Math.round(runtime.memoryMB / 1024)} GB RAM` : null;
  const detail = [runtime.summary, [cores, memory].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
  const label = detail ? `${runtime.name}, ${detail}` : runtime.name;
  return runtime.needsUserCredential ? `${label}, needs your own API key` : label;
}

// Named friendly but returning error.message verbatim: with a 500 carrying
// "upstream exploded: trace 0xdeadbeef" that string rendered on the page.
// toUserMessage keeps a sentence somebody wrote and drops operator detail.
function friendlyError(error: unknown): string {
  return toUserMessage(error, 'Something went wrong. Please retry.');
}

function agentOutcomeLabel(turn: CloudCodeAgentTurn): string {
  switch (turn.stopReason) {
    case 'done':
      return 'Finished';
    case 'awaiting_approval':
      return 'Waiting for your approval';
    case 'max_steps':
      return 'Stopped at the step limit';
    case 'timeout':
      return 'Timed out';
    case 'cancelled':
      return 'Cancelled';
    case 'denied':
      return 'Stopped, command denied';
    default:
      return 'Failed';
  }
}

function sessionStateLabel(session: CloudCodeSession): string {
  if (session.state === 'ready') return 'Ready';
  if (session.state === 'running') return 'Command running';
  if (session.state === 'provisioning') return 'Provisioning';
  if (session.state === 'failed') return 'Needs attention';
  return 'Closed';
}

export interface CloudCodePageProps {
  api?: CloudCodeApi;
}

export function CloudCodePage({ api = cloudCodeApi }: CloudCodePageProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [availability, setAvailability] = useState<CloudCodeAvailability | null>(null);
  const [runtimes, setRuntimes] = useState<CloudCodeRuntime[]>([]);
  const [sessions, setSessions] = useState<CloudCodeSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CloudCodeTerminalEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('New workspace');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [repositoryBranch, setRepositoryBranch] = useState('');
  const [networkAccess, setNetworkAccess] = useState<CloudCodeNetworkAccess>('none');
  const [extraHosts, setExtraHosts] = useState('');
  // Empty string is "the default image", the catalogue never contains one, so
  // it cannot collide with a real template id.
  const [runtimeId, setRuntimeId] = useState('');
  const [taskGoal, setTaskGoal] = useState('');
  const taskFieldId = useId();
  const runtimeFieldId = useId();
  const harnessRuntimes = useMemo(
    () => runtimes.filter((runtime) => runtime.kind === 'harness'),
    [runtimes],
  );
  const imageRuntimes = useMemo(
    () => runtimes.filter((runtime) => runtime.kind === 'image'),
    [runtimes],
  );
  const selectedRuntime = useMemo(
    () => runtimes.find((runtime) => runtime.id === runtimeId) ?? null,
    [runtimes, runtimeId],
  );
  const runtimeHelpId = `${runtimeFieldId}-help`;
  const runtimeHelpText = useMemo(() => {
    if (runtimes.length === 0) {
      return 'Managed Code is not configured for this deployment, so no harness can be started.';
    }
    if (!selectedRuntime?.agentCommand) {
      return 'Pick a coding agent to have its CLI already installed in the workspace, or an environment to drive yourself. This cannot be changed after the session is created.';
    }
    const headless = headlessHarnessCommand(selectedRuntime.id);
    if (!headless) {
      return `The workspace starts with ${selectedRuntime.name} installed, but an agent turn runs the generic tool-calling loop rather than ${selectedRuntime.name} directly; run \`${selectedRuntime.agentCommand}\` yourself in the terminal to use it as a harness. This cannot be changed after the session is created.`;
    }
    return `The workspace starts with ${selectedRuntime.name} installed. An agent turn runs it headlessly as \`${headless}\`, capped at ${HARNESS_BUDGET_MINUTES} minutes; run it yourself in the terminal to drive it interactively, then use Commit and push to publish the result. This cannot be changed after the session is created.`;
  }, [runtimes.length, selectedRuntime]);
  const [fullNetworkAccepted, setFullNetworkAccepted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitNotice, setCommitNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState('');
  const [agentTurn, setAgentTurn] = useState<CloudCodeAgentTurn | null>(null);
  const [agentGoal, setAgentGoal] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalPrompt[]>([]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessions],
  );
  const isNotebookSession = selectedSession?.runtimeId === NOTEBOOK_TEMPLATE_ID;

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
        setRuntimeId((current) =>
          current && body.runtimes.some((runtime) => runtime.id === current) ? current : '',
        );
        setSelectedId((current) => {
          if (current && body.sessions.some((session) => session.id === current)) return current;
          return (
            body.sessions.find((session) => session.state !== 'closed')?.id ??
            body.sessions[0]?.id ??
            null
          );
        });
        if (body.sessions.length === 0) setShowCreate(true);
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

  useEffect(() => {
    if (!selectedId || showCreate) {
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
  }, [api, replaceSession, selectedId, showCreate]);

  useEffect(() => {
    const end = terminalEndRef.current;
    if (typeof end?.scrollIntoView === 'function') {
      end.scrollIntoView({ block: 'nearest' });
    }
  }, [entries, running]);

  const openCreate = useCallback(() => {
    setShowCreate(true);
    setError(null);
    setConfirmClose(false);
  }, []);

  const canCreate =
    availability?.deploymentEnabled === true &&
    availability.storageReady === true &&
    availability.planEntitled === true;
  const canRun = canCreate;

  // Approvals outlive the tab that created them (the backend persists them with a
  // 30-minute expiry), so a reload or a session switch has to re-read them or a
  // half-finished agent turn becomes unresumable from the UI.
  useEffect(() => {
    setAgentTurn(null);
    setAgentGoal('');
    setPendingApprovals([]);
    if (!selectedId || showCreate || !canRun) return;
    const controller = new AbortController();
    void api
      .listApprovals(selectedId, controller.signal)
      .then(setPendingApprovals)
      .catch((approvalsError) => {
        if (approvalsError instanceof DOMException && approvalsError.name === 'AbortError') return;
        setError(friendlyError(approvalsError));
      });
    return () => controller.abort();
  }, [api, canRun, selectedId, showCreate]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!canCreate || (networkAccess === 'full' && !fullNetworkAccepted)) return;
    setCreating(true);
    setError(null);
    try {
      const body = await api.create({
        requestId: makeRequestId(),
        title,
        repositoryUrl: repositoryUrl.trim() || null,
        repositoryBranch: repositoryBranch.trim() || null,
        networkAccess,
        fullNetworkAcknowledged: networkAccess === 'full' ? fullNetworkAccepted : undefined,
        runtimeId: runtimeId || null,
        extraHosts: networkAccess === 'full' ? undefined : parseExtraHosts(extraHosts),
      });
      replaceSession(body.session);
      setSelectedId(body.session.id);
      setEntries(body.terminalEntries);
      setShowCreate(false);
      setTitle('New workspace');
      setRepositoryUrl('');
      setRepositoryBranch('');
      setNetworkAccess('none');
      setFullNetworkAccepted(false);
      setRuntimeId('');
      setExtraHosts('');

      // createCloudCodeSession provisions synchronously and returns the session
      // already `ready`, so the task can start in the same gesture rather than
      // making the reader find the agent box afterwards.
      const submittedGoal = taskGoal.trim();
      setTaskGoal('');
      if (submittedGoal && body.session.state === 'ready') {
        await startAgentTurnForSession(body.session, submittedGoal);
      }
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setCreating(false);
    }
  }

  async function handleRun(event: FormEvent) {
    event.preventDefault();
    if (!canRun || !selectedSession || !command.trim() || running) return;
    const submitted = command.trim();
    setCommand('');
    setRunning(true);
    setError(null);
    try {
      const body = await api.run(selectedSession.id, submitted);
      replaceSession(body.session);
      setEntries((current) => [...current, body.terminalEntry]);
    } catch (runError) {
      setCommand(submitted);
      setError(friendlyError(runError));
      void loadSessions();
    } finally {
      setRunning(false);
    }
  }

  function applyAgentTurn(turn: CloudCodeAgentTurn, turnGoal: string) {
    setAgentTurn(turn);
    setAgentGoal(turnGoal);
    setPendingApprovals(
      turn.pendingApproval
        ? [
            {
              turnId: turn.turnId,
              stepIndex: turn.pendingApproval.stepIndex,
              command: turn.pendingApproval.command,
              reason: turn.pendingApproval.reason,
              goal: turnGoal,
            },
          ]
        : [],
    );
  }

  /**
   * Shared by the task box on the create form and the one in an open session, so
   * a turn started either way reports progress and failure identically.
   *
   * `restoreGoal` puts the text back where the reader typed it when the turn is
   * refused, losing what they wrote is worse than the failure itself.
   */
  async function startAgentTurnForSession(
    session: CloudCodeSession,
    submitted: string,
    restoreGoal?: (value: string) => void,
  ) {
    setAgentBusy(true);
    setAgentTurn(null);
    setPendingApprovals([]);
    setError(null);
    try {
      const turn = await api.startAgentTurn(session.id, {
        goal: submitted,
        model: AGENT_MODEL_ID,
        idempotencyKey: makeRequestId(),
      });
      applyAgentTurn(turn, submitted);
      void loadSessions();
    } catch (turnError) {
      restoreGoal?.(submitted);
      setAgentGoal('');
      setError(friendlyError(turnError));
      void loadSessions();
    } finally {
      setAgentBusy(false);
    }
  }

  async function handleAgentTurn(event: FormEvent) {
    event.preventDefault();
    if (!canRun || !selectedSession || !goal.trim() || agentBusy) return;
    if (selectedSession.state !== 'ready') return;
    const submitted = goal.trim();
    setGoal('');
    await startAgentTurnForSession(selectedSession, submitted, setGoal);
  }

  async function handleApproval(approval: ApprovalPrompt, decision: 'approve' | 'reject') {
    if (!selectedSession || agentBusy) return;
    setAgentBusy(true);
    setError(null);
    try {
      const turn = await api.decideApproval(selectedSession.id, {
        turnId: approval.turnId,
        stepIndex: approval.stepIndex,
        decision,
      });
      applyAgentTurn(turn, agentGoal || approval.goal);
      void loadSessions();
    } catch (decisionError) {
      setError(friendlyError(decisionError));
      // The approval may have expired or been decided elsewhere; re-read rather
      // than leaving a card that can no longer be acted on.
      void api
        .listApprovals(selectedSession.id)
        .then(setPendingApprovals)
        .catch(() => setPendingApprovals([]));
    } finally {
      setAgentBusy(false);
    }
  }

  async function handleClose() {
    if (!selectedSession || closing) return;
    setClosing(true);
    setError(null);
    try {
      const closed = await api.close(selectedSession.id);
      replaceSession(closed);
      setConfirmClose(false);
    } catch (closeError) {
      setError(friendlyError(closeError));
    } finally {
      setClosing(false);
    }
  }

  async function handleCommit(event: FormEvent) {
    event.preventDefault();
    if (!selectedSession || !commitMessage.trim() || committing) return;
    const submitted = commitMessage.trim();
    setCommitting(true);
    setError(null);
    setCommitNotice(null);
    try {
      const result = await api.commit(selectedSession.id, submitted);
      replaceSession(result.session);
      setCommitMessage('');
      setCommitNotice(result.push.ok ? 'Pushed to the repository.' : result.push.output);
    } catch (commitError) {
      setError(friendlyError(commitError));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <WebAppShell>
      <main className={styles['main']}>
        <div className={styles['page']}>
          <div className={styles['eyebrow']}>
            <TerminalSquare size={14} /> Managed Code
          </div>
          <div className={styles['titleRow']}>
            <div>
              <h1 className={styles['title']}>Build in an isolated cloud workspace.</h1>
              <p className={styles['subtitle']}>
                Create a persistent environment, attach a public GitHub repository, and run terminal
                commands without exposing your local files or credentials.
              </p>
            </div>
            <button className={styles['primaryButton']} onClick={openCreate} disabled={!canCreate}>
              <Plus size={15} /> New session
            </button>
          </div>

          {availability && !availability.deploymentEnabled && (
            <div className={styles['banner']} role="status">
              <LockKeyhole size={17} />
              <div>
                <strong>Managed Code is not enabled on this deployment.</strong>
                <br />
                Existing session history remains readable. Use the desktop app for local code, or
                ask an operator to enable managed sandbox execution.
              </div>
            </div>
          )}
          {availability && !availability.storageReady && (
            <div className={styles['banner']} role="status">
              <AlertTriangle size={17} />
              <div>
                <strong>Managed Code is coming soon.</strong>
                <br />
                Cloud sessions are not available yet. Use the desktop app to run code locally in the
                meantime.
              </div>
            </div>
          )}
          {availability?.deploymentEnabled && !availability.planEntitled && (
            <div className={styles['banner']} role="status">
              <AlertTriangle size={17} />
              <div>
                <strong>
                  Your {availability.planTier} plan does not include managed sessions.
                </strong>
                <br />
                Upgrade to a plan with managed sandboxes, or use local Code in the desktop app.
              </div>
            </div>
          )}
          {error && (
            <div className={styles['errorBanner']} role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button className={styles['ghostButton']} onClick={() => void loadSessions()}>
                <RefreshCw size={14} /> Retry
              </button>
              <button className={styles['ghostButton']} onClick={() => setError(null)}>
                <X size={14} /> Dismiss
              </button>
            </div>
          )}

          {pageLoading ? (
            <div className={styles['loading']}>
              <Loader2 className={styles['spin']} size={22} aria-label="Loading Code sessions" />
            </div>
          ) : (
            <div className={styles['grid']}>
              {/* A sessions panel whose only content is "no sessions yet" pushed
                  the task box below the fold and said nothing the panel beside it
                  did not. It appears once there is a session to list. */}
              {sessions.length > 0 && (
                <section className={styles['panel']} aria-label="Code sessions">
                  <div className={styles['panelHeader']}>
                    <h2 className={styles['panelTitle']}>Sessions</h2>
                    <button
                      className={styles['ghostButton']}
                      onClick={() => void loadSessions()}
                      aria-label="Refresh sessions"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                  <div className={styles['sessionList']}>
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        className={`${styles['sessionButton']} ${
                          !showCreate && selectedId === session.id
                            ? styles['sessionButtonActive']
                            : ''
                        }`}
                        onClick={() => {
                          setSelectedId(session.id);
                          setShowCreate(false);
                          setConfirmClose(false);
                        }}
                      >
                        <span className={styles['sessionIcon']}>
                          <TerminalSquare size={15} />
                        </span>
                        <span className={styles['sessionMeta']}>
                          <span className={styles['sessionName']}>{session.title}</span>
                          <span className={styles['sessionState']}>
                            {sessionStateLabel(session)} · {session.networkAccess}
                          </span>
                        </span>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {showCreate ? (
                <section className={`${styles['panel']} ${styles['createPanel']}`}>
                  <h2 className={styles['createHeading']}>What should we build?</h2>
                  <p className={styles['createDescription']}>
                    Describe a task and the agent starts on it in a fresh isolated workspace. It
                    asks before running anything that needs approval. No environment receives your
                    browser cookies, local SSH keys, or local files.
                  </p>
                  <form onSubmit={handleCreate}>
                    {/* The task leads, and the workspace settings below are its
                        configuration. It used to be the other way round: you filled
                        in a provisioning form, created a session, and only then found
                        the box that actually does the work. */}
                    <div className={styles['field']}>
                      <label className={styles['label']} htmlFor={taskFieldId}>
                        Task
                      </label>
                      <textarea
                        id={taskFieldId}
                        className={styles['input']}
                        style={{ minHeight: 86, padding: '10px 11px', resize: 'vertical' }}
                        value={taskGoal}
                        onChange={(event) => setTaskGoal(event.target.value)}
                        placeholder="Install dependencies and run the test suite"
                        maxLength={8000}
                        disabled={creating}
                      />
                      <span className={styles['help']}>
                        Optional. Leave it empty to open an empty workspace and drive it yourself.
                      </span>
                    </div>

                    <label className={styles['field']}>
                      <span className={styles['label']}>Session name</span>
                      <input
                        className={styles['input']}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        maxLength={120}
                        required
                        disabled={creating}
                      />
                    </label>
                    <label className={styles['field']}>
                      <span className={styles['label']}>Public GitHub repository (optional)</span>
                      <div style={{ position: 'relative' }}>
                        <GitFork
                          size={15}
                          style={{ position: 'absolute', left: 11, top: 12, opacity: 0.55 }}
                        />
                        <input
                          className={styles['input']}
                          style={{ paddingLeft: 34 }}
                          value={repositoryUrl}
                          onChange={(event) => setRepositoryUrl(event.target.value)}
                          placeholder="https://github.com/owner/repository"
                          maxLength={500}
                          disabled={creating}
                        />
                      </div>
                      <span className={styles['help']}>
                        Private repositories and credentials are intentionally not supported in this
                        first release. Repository setup requires Trusted hosts or Full network.
                      </span>
                    </label>

                    {/* Only meaningful once there is something to clone, which is
                        why it appears with the repository rather than sitting
                        permanently disabled. */}
                    {repositoryUrl.trim() ? (
                      <label className={styles['field']}>
                        <span className={styles['label']}>Branch (optional)</span>
                        <div style={{ position: 'relative' }}>
                          <GitBranch
                            size={15}
                            style={{ position: 'absolute', left: 11, top: 12, opacity: 0.55 }}
                          />
                          <input
                            className={styles['input']}
                            style={{ paddingLeft: 34 }}
                            value={repositoryBranch}
                            onChange={(event) => setRepositoryBranch(event.target.value)}
                            placeholder="main"
                            maxLength={255}
                            disabled={creating}
                          />
                        </div>
                        <span className={styles['help']}>
                          Leave it empty to clone the repository&rsquo;s default branch.
                        </span>
                      </label>
                    ) : null}

                    {/* htmlFor rather than a wrapping label: the help text is a
                        sibling, so it describes the control instead of being read
                        out as part of its name. */}
                    <div className={styles['field']}>
                      <label className={styles['label']} htmlFor={runtimeFieldId}>
                        Coding harness
                      </label>
                      <select
                        id={runtimeFieldId}
                        aria-describedby={runtimeHelpId}
                        className={styles['input']}
                        value={runtimeId}
                        onChange={(event) => setRuntimeId(event.target.value)}
                        disabled={creating || runtimes.length === 0}
                      >
                        <option value="">
                          No agent, Python 3, Node.js, git, curl, build-essential, GitHub CLI
                        </option>
                        {harnessRuntimes.length > 0 && (
                          <optgroup label="Coding agents">
                            {harnessRuntimes.map((runtime) => (
                              <option key={runtime.id} value={runtime.id}>
                                {describeRuntime(runtime)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {imageRuntimes.length > 0 && (
                          <optgroup label="Environments">
                            {imageRuntimes.map((runtime) => (
                              <option key={runtime.id} value={runtime.id}>
                                {describeRuntime(runtime)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <span className={styles['help']} id={runtimeHelpId}>
                        {runtimeHelpText}
                      </span>
                    </div>

                    <fieldset className={styles['field']} style={{ border: 0, padding: 0 }}>
                      <legend className={styles['label']}>Network access</legend>
                      <div className={styles['networkGrid']}>
                        {NETWORK_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          return (
                            <label
                              key={option.id}
                              className={`${styles['networkOption']} ${
                                networkAccess === option.id ? styles['networkOptionSelected'] : ''
                              }`}
                            >
                              <input
                                type="radio"
                                name="network-access"
                                value={option.id}
                                checked={networkAccess === option.id}
                                onChange={() => {
                                  setNetworkAccess(option.id);
                                  if (option.id !== 'full') setFullNetworkAccepted(false);
                                }}
                                disabled={creating}
                              />
                              <span className={styles['networkTitle']}>
                                <Icon size={14} /> {option.label}
                              </span>
                              <span className={styles['networkCopy']}>{option.description}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    {networkAccess !== 'full' && (
                      <label className={styles['field']}>
                        <span className={styles['label']}>Extra allowed hosts (optional)</span>
                        <input
                          className={styles['input']}
                          value={extraHosts}
                          onChange={(event) => setExtraHosts(event.target.value)}
                          placeholder="api.example.com, *.internal.example.com"
                          disabled={creating}
                        />
                        <span className={styles['help']}>
                          Comma-separated hostnames this session may reach on top of{' '}
                          {networkAccess === 'trusted' ? 'the trusted hosts above' : 'nothing else'}
                          . A single leading wildcard subdomain is allowed, up to 10 hosts.
                        </span>
                      </label>
                    )}

                    {networkAccess === 'full' && (
                      <label className={styles['acknowledgement']}>
                        <input
                          type="checkbox"
                          checked={fullNetworkAccepted}
                          onChange={(event) => setFullNetworkAccepted(event.target.checked)}
                        />
                        <span>
                          I understand commands in this session can contact any internet host. The
                          environment remains isolated and receives no AGI Workforce credentials.
                        </span>
                      </label>
                    )}

                    <div className={styles['formActions']}>
                      {sessions.length > 0 && (
                        <button
                          className={styles['secondaryButton']}
                          type="button"
                          onClick={() => setShowCreate(false)}
                          disabled={creating}
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        className={styles['primaryButton']}
                        type="submit"
                        disabled={
                          creating ||
                          !canCreate ||
                          !title.trim() ||
                          (networkAccess === 'full' && !fullNetworkAccepted) ||
                          (Boolean(repositoryUrl.trim()) && networkAccess === 'none')
                        }
                      >
                        {creating ? (
                          <Loader2 className={styles['spin']} size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                        {creating
                          ? 'Provisioning…'
                          : taskGoal.trim()
                            ? 'Start task'
                            : 'Create session'}
                      </button>
                    </div>
                  </form>
                </section>
              ) : selectedSession ? (
                <section className={`${styles['panel']} ${styles['terminalPanel']}`}>
                  <div className={styles['terminalHeader']}>
                    <div className={styles['terminalIdentity']}>
                      <div className={styles['terminalTitle']}>{selectedSession.title}</div>
                      <div className={styles['terminalMeta']}>
                        <span>
                          <span className={styles['statusDot']} />
                          {sessionStateLabel(selectedSession)}
                        </span>
                        <span>{selectedSession.workspacePath}</span>
                        <span>{selectedSession.networkAccess} network</span>
                        {selectedSession.extraHosts.length > 0 && (
                          <span>+ {selectedSession.extraHosts.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    {selectedSession.state !== 'closed' &&
                      (confirmClose ? (
                        <div style={{ display: 'flex', gap: 7 }}>
                          <button
                            className={styles['ghostButton']}
                            onClick={() => setConfirmClose(false)}
                            disabled={closing}
                          >
                            Cancel
                          </button>
                          <button
                            className={styles['dangerButton']}
                            onClick={() => void handleClose()}
                            disabled={closing}
                          >
                            {closing && <Loader2 className={styles['spin']} size={13} />}
                            Close permanently
                          </button>
                        </div>
                      ) : (
                        <button
                          className={styles['ghostButton']}
                          onClick={() => setConfirmClose(true)}
                        >
                          Close session
                        </button>
                      ))}
                  </div>
                  {selectedSession.repositoryUrl &&
                    selectedSession.state !== 'closed' &&
                    selectedSession.state !== 'provisioning' &&
                    selectedSession.state !== 'failed' && (
                      <form
                        className={styles['commitRow']}
                        onSubmit={(event) => void handleCommit(event)}
                      >
                        <input
                          className={styles['input']}
                          value={commitMessage}
                          onChange={(event) => setCommitMessage(event.target.value)}
                          placeholder="Commit message"
                          maxLength={500}
                          disabled={committing}
                          aria-label="Commit message"
                        />
                        <button
                          className={styles['secondaryButton']}
                          type="submit"
                          disabled={committing || !commitMessage.trim()}
                        >
                          {committing ? <Loader2 className={styles['spin']} size={13} /> : null}
                          Commit and push
                        </button>
                      </form>
                    )}
                  {commitNotice && <div className={styles['help']}>{commitNotice}</div>}
                  {detailLoading ? (
                    <div className={styles['loading']}>
                      <Loader2
                        className={styles['spin']}
                        size={20}
                        aria-label="Attaching to session"
                      />
                    </div>
                  ) : (
                    <>
                      <div className={styles['terminal']} aria-live="polite">
                        <div className={styles['terminalIntro']}>
                          Managed sandbox · commands run remotely · session pauses after every
                          command
                        </div>
                        {entries.map((entry) => (
                          <div key={entry.id}>
                            <div className={styles['terminalCommand']}>
                              <span className={styles['prompt']}>$ </span>
                              {entry.command}
                            </div>
                            {entry.stdout && <pre className={styles['stdout']}>{entry.stdout}</pre>}
                            {entry.stderr && <pre className={styles['stderr']}>{entry.stderr}</pre>}
                            <div className={styles['exitCode']}>exit {entry.exitCode}</div>
                          </div>
                        ))}
                        {running && (
                          <div className={styles['terminalCommand']}>
                            <span className={styles['prompt']}>$ </span>
                            <Loader2 className={styles['spin']} size={12} /> running…
                          </div>
                        )}
                        <div ref={terminalEndRef} />
                      </div>
                      <form className={styles['commandForm']} onSubmit={handleRun}>
                        <input
                          className={styles['commandInput']}
                          value={command}
                          onChange={(event) => setCommand(event.target.value)}
                          placeholder={
                            selectedSession.state === 'closed'
                              ? 'This session is closed'
                              : 'Run a command…'
                          }
                          maxLength={2000}
                          disabled={!canRun || running || selectedSession.state !== 'ready'}
                          aria-label="Terminal command"
                        />
                        <button
                          className={styles['primaryButton']}
                          type="submit"
                          disabled={
                            !canRun ||
                            running ||
                            !command.trim() ||
                            selectedSession.state !== 'ready'
                          }
                        >
                          {running ? <Loader2 className={styles['spin']} size={14} /> : 'Run'}
                        </button>
                      </form>

                      {isNotebookSession && (
                        <NotebookPanel
                          sessionId={selectedSession.id}
                          sessionReady={selectedSession.state === 'ready'}
                          onSession={replaceSession}
                        />
                      )}

                      <section
                        aria-label="Agent turn"
                        style={{
                          borderTop: '1px solid var(--chat-border)',
                          padding: 14,
                          display: 'grid',
                          gap: 12,
                        }}
                      >
                        <div
                          className={styles['eyebrow']}
                          style={{ fontSize: 12, letterSpacing: '0.07em' }}
                        >
                          <Bot size={13} /> Agent
                        </div>
                        <form onSubmit={handleAgentTurn} style={{ display: 'grid', gap: 9 }}>
                          <label className={styles['label']} htmlFor="cloud-code-agent-goal">
                            Describe a task. The agent works in this workspace and asks before it
                            runs a command that needs your approval.
                          </label>
                          <textarea
                            id="cloud-code-agent-goal"
                            className={styles['input']}
                            style={{ minHeight: 74, padding: '10px 11px', resize: 'vertical' }}
                            value={goal}
                            onChange={(event) => setGoal(event.target.value)}
                            placeholder="Install dependencies and run the test suite"
                            maxLength={8000}
                            disabled={
                              !canRun || agentBusy || running || selectedSession.state !== 'ready'
                            }
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              className={styles['primaryButton']}
                              type="submit"
                              disabled={
                                !canRun ||
                                agentBusy ||
                                running ||
                                !goal.trim() ||
                                selectedSession.state !== 'ready'
                              }
                            >
                              {agentBusy ? (
                                <Loader2 className={styles['spin']} size={14} />
                              ) : (
                                <Bot size={14} />
                              )}
                              {agentBusy ? 'Agent working…' : 'Start agent turn'}
                            </button>
                          </div>
                        </form>

                        {agentTurn && (
                          <div className={styles['banner']} style={{ marginTop: 0 }} role="status">
                            <Bot size={17} />
                            <div style={{ minWidth: 0 }}>
                              <strong>{agentOutcomeLabel(agentTurn)}</strong>
                              {' · '}
                              {agentTurn.stepsUsed} step{agentTurn.stepsUsed === 1 ? '' : 's'}
                              {agentGoal && (
                                <>
                                  <br />
                                  <span>{agentGoal}</span>
                                </>
                              )}
                              {agentTurn.finalMessage && (
                                <pre className={styles['stdout']} style={{ marginTop: 8 }}>
                                  {agentTurn.finalMessage}
                                </pre>
                              )}
                              {agentTurn.errorMessage && (
                                <pre className={styles['stderr']} style={{ marginTop: 8 }}>
                                  {agentTurn.errorMessage}
                                </pre>
                              )}
                            </div>
                          </div>
                        )}

                        {pendingApprovals.map((approval) => (
                          <div
                            key={`${approval.turnId}:${approval.stepIndex}`}
                            className={styles['acknowledgement']}
                            style={{ marginTop: 0, display: 'grid', gap: 9 }}
                          >
                            <div>
                              <strong>Approval required</strong>
                              <br />
                              {approval.reason}
                            </div>
                            <pre className={styles['stdout']} style={{ margin: 0 }}>
                              $ {approval.command}
                            </pre>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                              <button
                                className={styles['ghostButton']}
                                type="button"
                                disabled={agentBusy}
                                onClick={() => void handleApproval(approval, 'reject')}
                              >
                                Reject
                              </button>
                              <button
                                className={styles['primaryButton']}
                                type="button"
                                disabled={agentBusy}
                                onClick={() => void handleApproval(approval, 'approve')}
                              >
                                Approve and continue
                              </button>
                            </div>
                          </div>
                        ))}
                      </section>
                    </>
                  )}
                </section>
              ) : null}
            </div>
          )}

          <div className={styles['links']}>
            <a className={styles['linkCard']} href="/download">
              <Download size={18} />
              <div>
                <strong>Work with local code</strong>
                <span>Use the desktop app for files and tools on this computer.</span>
              </div>
              <ExternalLink size={14} />
            </a>
            <a className={styles['linkCard']} href="/vscode-extension">
              <Blocks size={18} />
              <div>
                <strong>Open in VS Code</strong>
                <span>Install the extension for IDE-native agent workflows.</span>
              </div>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </main>
    </WebAppShell>
  );
}
