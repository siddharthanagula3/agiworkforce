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
import type { CloudAgentRun, ManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { Button } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
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

  const handleCancel = useCallback(
    async (runId: string) => {
      setCancellingId(runId);
      try {
        const updated = await getClient().cancelRun(runId);
        setRuns((prev) => prev.map((r) => (r.id === runId ? updated : r)));
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

  return (
    <div
      data-testid="tasks-view"
      className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 py-6"
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
            onClick={() => setFilter(f.id)}
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
        <div className="flex flex-col gap-2">
          {runs.map((run) => {
            const tone = taskStateTone(run.state);
            const cancellable = isCancellableState(run.state);
            return (
              <div
                key={run.id}
                className={cn(
                  'group rounded-lg border p-3 transition-colors',
                  run.conversationId && 'cursor-pointer hover:bg-accent',
                )}
                onClick={() => openConversation(run)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
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
                  </div>
                  {cancellable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                      disabled={cancellingId === run.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCancel(run.id);
                      }}
                    >
                      {cancellingId === run.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <X className="mr-1 h-3.5 w-3.5" /> Stop
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{run.model}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">
                    {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                  </span>
                  {run.conversationId && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <MessageSquare className="h-3 w-3" /> Open chat
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {nextCursor && (
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
          )}
        </div>
      )}
    </div>
  );
}
