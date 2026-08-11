'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Blocks,
  ChevronRight,
  Download,
  ExternalLink,
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
  CloudCodeNetworkAccess,
  CloudCodeSession,
  CloudCodeTerminalEntry,
} from '@agiworkforce/types';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';
import { WebSidebar } from '@/features/chat/v3/WebSidebar';
import { resolveWebViewRoute } from '@/features/chat/v3/WebShellV3';
import { cloudCodeApi, type CloudCodeApi, CloudCodeApiError } from './services/cloud-code-api';
import styles from './CloudCodePage.module.css';

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

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `code_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function friendlyError(error: unknown): string {
  if (error instanceof CloudCodeApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please retry.';
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
  const router = useRouter();
  const { openSettings } = useSettingsModal();
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [availability, setAvailability] = useState<CloudCodeAvailability | null>(null);
  const [sessions, setSessions] = useState<CloudCodeSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CloudCodeTerminalEntry[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('New workspace');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [networkAccess, setNetworkAccess] = useState<CloudCodeNetworkAccess>('none');
  const [fullNetworkAccepted, setFullNetworkAccepted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [command, setCommand] = useState('');
  const [running, setRunning] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessions],
  );

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
        setSessions(body.sessions);
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

  const handleSidebarMode = useCallback(
    (mode: 'chat' | 'work' | 'code') => {
      if (mode === 'chat') router.push('/chat');
    },
    [router],
  );

  const handleSidebarView = useCallback(
    (view: string) => {
      const route = resolveWebViewRoute(view);
      if (route) router.push(route);
    },
    [router],
  );

  const canCreate =
    availability?.deploymentEnabled === true &&
    availability.storageReady === true &&
    availability.planEntitled === true;
  const canRun = canCreate;

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
        networkAccess,
        fullNetworkAcknowledged: networkAccess === 'full' ? fullNetworkAccepted : undefined,
      });
      replaceSession(body.session);
      setSelectedId(body.session.id);
      setEntries(body.terminalEntries);
      setShowCreate(false);
      setTitle('New workspace');
      setRepositoryUrl('');
      setNetworkAccess('none');
      setFullNetworkAccepted(false);
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

  return (
    <div className={styles['shell']}>
      <div className={styles['sidebar']}>
        <WebSidebar
          mode="code"
          onModeChange={handleSidebarMode}
          onNewChat={openCreate}
          onNavigateView={handleSidebarView}
          // CRIT-008: open the modal in place. `/settings/account` renders a
          // SettingsModalRedirect that lands the user on /chat, so navigating
          // there threw away the code session they were looking at.
          onOpenAccountMenu={() => openSettings('account')}
        />
      </div>

      <div className={styles['mobileHeader']}>
        <button className={styles['ghostButton']} onClick={() => router.push('/chat')}>
          Chat
        </button>
        <strong>Code</strong>
        <button className={styles['ghostButton']} onClick={openCreate}>
          <Plus size={15} /> New
        </button>
      </div>

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
                ask an operator to enable managed E2B execution.
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
                  {sessions.length === 0 ? (
                    <div className={styles['emptySessions']}>
                      No Code sessions yet.
                      <br />
                      Start with a network-isolated workspace.
                    </div>
                  ) : (
                    sessions.map((session) => (
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
                    ))
                  )}
                </div>
              </section>

              {showCreate ? (
                <section className={`${styles['panel']} ${styles['createPanel']}`}>
                  <h2 className={styles['createHeading']}>Create a Code session</h2>
                  <p className={styles['createDescription']}>
                    Sessions persist between requests but pause when idle to stop compute billing.
                    No environment receives your browser cookies, local SSH keys, or local files.
                  </p>
                  <form onSubmit={handleCreate}>
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
                        {creating ? 'Provisioning…' : 'Create session'}
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
                          Managed E2B environment · commands run remotely · session pauses after
                          every command
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
    </div>
  );
}
