/**
 * TasksPage — the `/tasks` page body: the user's Cloud task (agent-run) history
 * and active work. AGI Work / Research / Chat turns that run as durable Managed
 * Cloud agent runs (`cloud_agent_runs`) are listed here from
 * `GET /api/llm/v1/chat/completions/runs` via the shared run client. Active runs
 * can be stopped; every run links back to its conversation.
 *
 * The durable run domain + list/cancel API already existed; this page is the
 * missing web consumer that turns AGI Work from a composer toggle into a
 * visible, browsable work surface (Cowork "Active task list" parity).
 */

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ListChecks, Loader2, MessageSquare, RotateCcw, X } from 'lucide-react';
import type {
  CloudAgentRun,
  CloudAgentRunSnapshotPage,
  ManagedCloudAgentRunClient,
} from '@agiworkforce/cloud-contracts';
import { Button } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import { TaskDetailPanel } from './TaskDetailPanel';
import {
  TASK_TONE_BADGE_CLASS,
  type AgentTaskState,
  isCancellableState,
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

export async function readTaskJournal(
  client: ManagedCloudAgentRunClient,
  runId: string,
  signal?: AbortSignal,
): Promise<TaskJournalSnapshot> {
  let afterSequence = -1;
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
 * What this surface cannot decide for itself.
 *
 * The run client is already shared (createManagedCloudAgentRunClient in
 * cloud-contracts); what differs per host is how it is authenticated and what
 * "open this conversation" means — a Next.js route push on web, a panel switch
 * inside the desktop shell.
 */
export interface TasksTransport {
  /** Authenticated Cloud agent-run client for this host. */
  client: ManagedCloudAgentRunClient;
  /** Navigate to the conversation a run belongs to. */
  openConversation(conversationId: string): void;
  /** Report a non-fatal failure to the user. */
  notifyError(message: string): void;
  /** Optional way out of the empty state: start a new AGI Work run. Hosts that
   *  have no such action omit it. */
  startWork?: () => void;
}

export function TasksPage({ transport }: { transport: TasksTransport }) {
  const [filter, setFilter] = useState<TaskFilter>('active');
  const [runs, setRuns] = useState<CloudAgentRun[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [journal, setJournal] = useState<TaskJournalSnapshot | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);

  const getClient = useCallback(() => transport.client, [transport.client]);

  const load = useCallback(
    async (nextFilter: TaskFilter, cursor: string | null) => {
      const isInitial = cursor === null;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const page = await getClient().listRuns({
          // "Active" omits states so the server applies its DEFAULT_ACTIVE_STATES;
          // "All" passes every state explicitly.
          states: nextFilter === 'all' ? ALL_STATES : undefined,
          cursor: cursor ?? undefined,
          limit: PAGE_SIZE,
        });
        setRuns((prev) => (isInitial ? page.runs : [...prev, ...page.runs]));
        setNextCursor(page.nextCursor);
      } catch (err) {
        console.error('[Tasks] Failed to load tasks:', err);
        setError('Could not load your tasks. Check your connection and retry.');
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
    async (runId: string, signal?: AbortSignal) => {
      setJournalLoading(true);
      setJournalError(null);
      try {
        const next = await readTaskJournal(getClient(), runId, signal);
        if (!signal?.aborted) setJournal(next);
      } catch (err) {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
        console.error('[Tasks] Failed to load task journal:', err);
        setJournalError('Could not load this task journal. Retry or open the source chat.');
      } finally {
        if (!signal?.aborted) setJournalLoading(false);
      }
    },
    [getClient],
  );

  useEffect(() => {
    if (!selectedRunId) {
      setJournal(null);
      setJournalError(null);
      setJournalLoading(false);
      return;
    }
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
        setRuns((prev) => prev.map((r) => (r.id === runId ? updated : r)));
        setJournal((current) =>
          current?.run.id === runId ? { ...current, run: updated } : current,
        );
      } catch (err) {
        console.error('[Tasks] Failed to cancel task:', err);
        transport.notifyError('Could not stop the task. Check its activity before retrying.');
      } finally {
        setCancellingId(null);
      }
    },
    [getClient, transport],
  );

  const openConversation = useCallback(
    (run: CloudAgentRun) => {
      if (run.conversationId) transport.openConversation(run.conversationId);
    },
    [transport],
  );

  const selectedRun =
    journal?.run ?? runs.find((candidate) => candidate.id === selectedRunId) ?? null;

  return (
    <div
      data-testid="tasks-view"
      className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 py-6"
    >
      <header className="mb-4 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Tasks</h1>
        <span className="text-sm text-muted-foreground">— your Cloud work runs</span>
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
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void load(filter, null)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--chat-accent-primary)]/15">
            <ListChecks className="h-7 w-7 text-[var(--chat-accent-primary)]" />
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
              return (
                <div
                  key={run.id}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    selected ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      aria-label={`View details for ${workModeLabel(run.workMode)} task`}
                      aria-pressed={selected}
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {workModeLabel(run.workMode)}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            TASK_TONE_BADGE_CLASS[tone],
                          )}
                        >
                          {taskStateLabel(run.state)}
                        </span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{run.model}</span>
                        <span aria-hidden>·</span>
                        <span className="shrink-0">
                          {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                        </span>
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
            onRefresh={() => {
              if (selectedRunId) void loadJournal(selectedRunId);
            }}
            onClose={() => setSelectedRunId(null)}
            onOpenConversation={(conversationId) => transport.openConversation(conversationId)}
          />
        </div>
      )}
    </div>
  );
}
