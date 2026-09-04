import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ListChecks, Loader2, MessageSquare, RotateCcw, ShieldQuestion, X } from 'lucide-react';
import {
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
  type CloudAgentRun,
  type CloudAgentRunSnapshotPage,
  type ManagedCloudAgentRunClient,
} from '@agiworkforce/cloud-contracts';
import { Button } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import { toUserMessageWithStatus } from '../../lib/network-error';
import { getManagedModelPresentationLabel } from '../../lib/modelInfo';
import { TaskDetailPanel } from './TaskDetailPanel';
import {
  TASK_TONE_BADGE_CLASS,
  type AgentTaskState,
  type AgiWorkRerunGoal,
  formatTaskCost,
  isCancellableState,
  isLiveTaskState,
  taskStateLabel,
  taskStateTone,
  workModeLabel,
} from './task-display';

type TaskFilter = 'active' | 'all';

const ALL_STATES: AgentTaskState[] = [
  'queued',
  'running',
  'awaiting_input',
  'ready_for_review',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'archived',
];

const PAGE_SIZE = 25;

const FILTERS: Array<{ id: TaskFilter; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'all', label: 'All' },
];

interface TaskJournalSnapshot extends CloudAgentRunSnapshotPage {
  truncated: boolean;
}

const TASK_JOURNAL_PAGE_SIZE = 500;
const TASK_JOURNAL_MAX_PAGES = 8;

/**
 * How long to wait before re-reading the journal of a run that is still live.
 *
 * The runs API is a plain paged read with no push channel, so an open detail
 * panel used to freeze at whatever the run had done the moment it was opened.
 * a running task looked stalled. Polling only happens while the selected run is
 * in a state that can still emit events ({@link isLiveTaskState}) and stops the
 * moment it is terminal, so an idle Tasks tab issues no traffic at all.
 */
export const TASK_JOURNAL_POLL_INTERVAL_MS = 4_000;

export async function readTaskJournal(
  client: ManagedCloudAgentRunClient,
  runId: string,
  signal?: AbortSignal,
  options?: { afterSequence?: number },
): Promise<TaskJournalSnapshot> {
  let afterSequence =
    typeof options?.afterSequence === 'number' && Number.isFinite(options.afterSequence)
      ? Math.max(-1, Math.trunc(options.afterSequence))
      : -1;
  let latest: CloudAgentRunSnapshotPage | null = null;
  const events: CloudAgentRunSnapshotPage['events'] = [];

  for (let pageIndex = 0; pageIndex < TASK_JOURNAL_MAX_PAGES; pageIndex += 1) {
    const page = await client.getRun(runId, {
      afterSequence,
      limit: TASK_JOURNAL_PAGE_SIZE,
      signal,
    });
    latest = page;
    events.push(...page.events);
    afterSequence = page.nextAfterSequence;
    if (afterSequence >= page.run.lastEventSequence || page.events.length === 0) {
      return { ...page, events, truncated: false };
    }
  }

  if (!latest) {
    throw new Error('Task journal is unavailable');
  }
  return { ...latest, events, truncated: afterSequence < latest.run.lastEventSequence };
}

/**
 * Replace a run in the list without losing its name.
 *
 * Only the list endpoint joins `conversationTitle`; the journal read and the
 * cancel response do not. Merging one of those in raw would blank the row's
 * headline back to its work-mode label the moment a task was opened or
 * cancelled.
 */
function mergeRun(previous: CloudAgentRun, next: CloudAgentRun): CloudAgentRun {
  if (next.conversationTitle || !previous.conversationTitle) return next;
  return { ...next, conversationTitle: previous.conversationTitle };
}

function approvalFailureMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'ManagedCloudAgentRunAlreadyResumingError') {
    return 'Another device already answered this approval.';
  }
  if (name === 'ManagedCloudAgentRunApprovalExpiredError') {
    return 'This approval expired and the task can no longer continue from it.';
  }
  return 'Could not send your decision. Check the task activity before retrying.';
}

export interface TasksTransport {
  client: ManagedCloudAgentRunClient;
  openConversation(conversationId: string): void;
  /**
   * Fallback name for a run whose own `conversationTitle` is absent, resolved
   * by the host from whatever it already holds. The list endpoint joins the
   * title server-side, so this only covers a run read through another path.
   * Returning nothing is fine; the row falls back to its work-mode label.
   */
  conversationTitle?(conversationId: string): string | null | undefined;
  notifyError(message: string): void;
  startWork?: () => void;
  rerunWork?(goal: AgiWorkRerunGoal): void;
}

export function TasksPage({ transport }: { transport: TasksTransport }) {
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [runs, setRuns] = useState<CloudAgentRun[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(null);
  const [guidanceByRunId, setGuidanceByRunId] = useState<Record<string, string>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [journal, setJournal] = useState<TaskJournalSnapshot | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const journalRef = useRef<TaskJournalSnapshot | null>(null);

  const getClient = useCallback(() => transport.client, [transport.client]);

  const load = useCallback(
    async (nextFilter: TaskFilter, cursor: string | null) => {
      const isInitial = cursor === null;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const page = await getClient().listRuns({
          states: nextFilter === 'all' ? ALL_STATES : undefined,
          cursor: cursor ?? undefined,
          limit: PAGE_SIZE,
        });
        setRuns((prev) => (isInitial ? page.runs : [...prev, ...page.runs]));
        setNextCursor(page.nextCursor);
      } catch (err) {
        console.error('[Tasks] Failed to load tasks:', err);
        setError(toUserMessageWithStatus(err, 'Could not load your tasks. Retry in a moment.'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getClient],
  );

  useEffect(() => {
    void load(filter, null);
  }, [filter, load]);

  const loadJournal = useCallback(
    async (runId: string, signal?: AbortSignal, options?: { background?: boolean }) => {
      const background = options?.background === true;
      if (!background) setJournalLoading(true);
      setJournalError(null);
      try {
        const previous = journalRef.current;
        const resumable =
          background && previous !== null && previous.run.id === runId && !previous.truncated
            ? previous
            : null;
        const page = await readTaskJournal(
          getClient(),
          runId,
          signal,
          resumable ? { afterSequence: resumable.nextAfterSequence } : undefined,
        );
        if (signal?.aborted) return;
        const next: TaskJournalSnapshot = resumable
          ? { ...page, events: [...resumable.events, ...page.events] }
          : page;
        journalRef.current = next;
        setJournal(next);
        setRuns((prev) => prev.map((r) => (r.id === next.run.id ? mergeRun(r, next.run) : r)));
      } catch (err) {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        console.error('[Tasks] Failed to load task journal:', err);
        setJournalError(
          background
            ? 'Live updates stopped: this task journal could not be re-read. Refresh to retry.'
            : 'Could not load this task journal. Retry or open the source chat.',
        );
      } finally {
        if (!signal?.aborted && !background) setJournalLoading(false);
      }
    },
    [getClient],
  );

  useEffect(() => {
    if (!selectedRunId) {
      journalRef.current = null;
      setJournal(null);
      setJournalError(null);
      setJournalLoading(false);
      return;
    }
    journalRef.current = null;
    setJournal(null);
    const controller = new AbortController();
    void loadJournal(selectedRunId, controller.signal);
    return () => controller.abort();
  }, [loadJournal, selectedRunId]);

  const handleCancel = useCallback(
    async (runId: string) => {
      setCancellingId(runId);
      try {
        const updated = await getClient().cancelRun(runId);
        setRuns((prev) => prev.map((r) => (r.id === runId ? mergeRun(r, updated) : r)));
        const openJournal = journalRef.current;
        if (openJournal?.run.id === runId) {
          const next = { ...openJournal, run: updated };
          journalRef.current = next;
          setJournal(next);
        }
      } catch (err) {
        console.error('[Tasks] Failed to cancel task:', err);
        transport.notifyError('Could not stop the task. Check its activity before retrying.');
      } finally {
        setCancellingId(null);
      }
    },
    [getClient, transport],
  );

  const handleApproval = useCallback(
    async (run: CloudAgentRun, decision: 'approved' | 'rejected') => {
      const pending = run.pendingApproval;
      if (!pending) return;
      const guidance = guidanceByRunId[run.id]?.trim();
      setResolvingApprovalId(run.id);
      try {
        await getClient().resumeRun(
          run.id,
          pending.toolCalls.map((call) => ({ toolCallId: call.toolCallId, decision })),
          guidance ? { guidance } : {},
        );
        setGuidanceByRunId((current) => {
          const next = { ...current };
          delete next[run.id];
          return next;
        });
        await load(filter, null);
        if (selectedRunId === run.id) await loadJournal(run.id);
      } catch (err) {
        console.error('[Tasks] Failed to resolve task approval:', err);
        transport.notifyError(approvalFailureMessage(err));
        await load(filter, null);
      } finally {
        setResolvingApprovalId(null);
      }
    },
    [filter, getClient, guidanceByRunId, load, loadJournal, selectedRunId, transport],
  );

  const runTitle = useCallback(
    (run: CloudAgentRun): { title: string; isFallback: boolean } => {
      const resolved =
        run.conversationTitle?.trim() ||
        (run.conversationId ? transport.conversationTitle?.(run.conversationId)?.trim() : null);
      return resolved
        ? { title: resolved, isFallback: false }
        : { title: workModeLabel(run.workMode), isFallback: true };
    },
    [transport],
  );

  const openConversation = useCallback(
    (run: CloudAgentRun) => {
      if (run.conversationId) transport.openConversation(run.conversationId);
    },
    [transport],
  );

  const selectedRun =
    journal?.run ?? runs.find((candidate) => candidate.id === selectedRunId) ?? null;
  const autoRefreshing = selectedRun !== null && isLiveTaskState(selectedRun.state);

  useEffect(() => {
    if (!selectedRunId || !autoRefreshing || journalError || journalLoading) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void loadJournal(selectedRunId, controller.signal, { background: true });
    }, TASK_JOURNAL_POLL_INTERVAL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [autoRefreshing, journal, journalError, journalLoading, loadJournal, selectedRunId]);

  return (
    <div
      data-testid="tasks-view"
      className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-6"
    >
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" />
        <h1 className="font-[var(--chat-font-serif)] text-[28px] font-medium">Tasks</h1>
        <span className="text-sm text-muted-foreground">, your Cloud work runs</span>
      </header>

      <div className="mb-4 flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFilter(f.id);
              setSelectedRunId(null);
            }}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div role="status" className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">Loading your tasks…</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"
        >
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load(filter, null)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--chat-accent-primary)]/15">
            <ListChecks className="h-7 w-7 text-[var(--chat-accent-primary-text)]" />
          </div>
          <p className="text-base font-semibold text-foreground">
            No {filter === 'active' ? 'active ' : ''}tasks yet
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Runs from AGI Work, Research, and long tool sessions show up here.
          </p>
          {transport.startWork ? (
            <Button size="sm" onClick={transport.startWork}>
              Start AGI Work
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-2">
            {runs.map((run) => {
              const tone = taskStateTone(run.state);
              const cancellable = isCancellableState(run.state);
              const selected = selectedRunId === run.id;
              const { title, isFallback } = runTitle(run);
              return (
                <div
                  key={run.id}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    selected ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  {/*
                    The action group is shrink-0, so on a phone it held its
                    width and left the details button 146px: the task title got
                    31px of "AGI Work" and the model label 9px of its display
                    name. The actions drop to their own line instead.
                  */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button
                      type="button"
                      aria-label={`View details for ${title}, ${taskStateLabel(run.state)}`}
                      aria-pressed={selected}
                      className="min-w-0 flex-1 basis-full text-left sm:basis-auto"
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{title}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-medium',
                            TASK_TONE_BADGE_CLASS[tone],
                          )}
                        >
                          {taskStateLabel(run.state)}
                        </span>
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {isFallback ? null : (
                          <>
                            <span className="shrink-0">{workModeLabel(run.workMode)}</span>
                            <span aria-hidden>·</span>
                          </>
                        )}
                        <span className="truncate">
                          {getManagedModelPresentationLabel(run.model)}
                        </span>
                        <span aria-hidden>·</span>
                        <span className="shrink-0">
                          {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                        </span>
                        {run.usage && run.usage.costCents !== null ? (
                          <>
                            <span aria-hidden>·</span>
                            <span data-testid={`task-cost-${run.id}`} className="shrink-0">
                              {formatTaskCost(run.usage.costCents)}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {run.conversationId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => openConversation(run)}
                        >
                          <MessageSquare className="mr-1 h-3 w-3" />
                          Open chat
                        </Button>
                      ) : null}
                      {cancellable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          disabled={cancellingId === run.id}
                          onClick={() => void handleCancel(run.id)}
                        >
                          {cancellingId === run.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <X className="mr-1 h-3.5 w-3.5" /> Stop
                            </>
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {run.state === 'awaiting_input' && run.pendingApproval ? (
                    <div
                      data-testid={`task-pending-approval-${run.id}`}
                      className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
                    >
                      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <ShieldQuestion className="h-3.5 w-3.5 text-amber-500" />
                        Waiting for your approval
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {run.pendingApproval.toolCalls.map((call) => (
                          <li key={call.toolCallId} className="min-w-0">
                            <span className="block truncate text-xs font-medium text-foreground">
                              {call.name}
                            </span>
                            <span className="block truncate font-mono text-[12px] text-muted-foreground">
                              {call.argsPreview}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <textarea
                        data-testid={`task-approval-guidance-${run.id}`}
                        value={guidanceByRunId[run.id] ?? ''}
                        onChange={(event) =>
                          setGuidanceByRunId((current) => ({
                            ...current,
                            [run.id]: event.target.value,
                          }))
                        }
                        disabled={resolvingApprovalId === run.id}
                        rows={2}
                        maxLength={TOOL_APPROVAL_GUIDANCE_MAX_LENGTH}
                        placeholder="Add guidance to steer this run (optional)"
                        aria-label="Guidance for this task"
                        className="mt-2.5 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                      />
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          disabled={resolvingApprovalId === run.id}
                          onClick={() => void handleApproval(run, 'approved')}
                        >
                          {resolvingApprovalId === run.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          disabled={resolvingApprovalId === run.id}
                          onClick={() => void handleApproval(run, 'rejected')}
                        >
                          Deny
                        </Button>
                        <span className="text-[12px] text-muted-foreground">
                          asked{' '}
                          {formatDistanceToNow(new Date(run.pendingApproval.requestedAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {nextCursor ? (
              <div className="flex justify-center py-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void load(filter, nextCursor)}
                >
                  {loadingMore ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Show more
                </Button>
              </div>
            ) : null}
          </div>

          <TaskDetailPanel
            run={selectedRun}
            events={journal?.events ?? []}
            loading={journalLoading}
            error={journalError}
            truncated={journal?.truncated}
            autoRefreshing={autoRefreshing && !journalError}
            onRefresh={() => {
              if (selectedRunId) void loadJournal(selectedRunId);
            }}
            onClose={() => setSelectedRunId(null)}
            onOpenConversation={(conversationId) => transport.openConversation(conversationId)}
            onRerun={
              transport.rerunWork && selectedRun?.workMode === 'agiwork'
                ? (goal) => transport.rerunWork?.(goal)
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
