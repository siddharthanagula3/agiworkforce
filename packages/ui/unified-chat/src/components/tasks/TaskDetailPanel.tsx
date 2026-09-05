import {
  AlertTriangle,
  BookOpen,
  Brain,
  Download,
  ExternalLink,
  FileOutput,
  Folder,
  Globe,
  ListChecks,
  Loader2,
  MousePointerClick,
  Plug,
  RefreshCw,
  RotateCcw,
  Search,
  SquareTerminal,
  Terminal,
  Wrench,
  X,
  type LucideProps,
} from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type RefObject } from 'react';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope, AgentEventToolCategory } from '@agiworkforce/types/protocol';
import {
  AGIWORK_GOAL_PROGRESS_ID,
  AGIWORK_PLAN_PROGRESS_ID_PREFIX,
} from '../../lib/agi-work-progress';
import {
  applyAgentActivityEvent,
  type AgentActivityArtifactEntry,
  type AgentActivityContextEntry,
  type AgentActivityEntry,
  type AgentActivityErrorEntry,
  type AgentActivityProgressEntry,
  type AgentActivityState,
  type AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { Button } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import {
  type AgiWorkRerunGoal,
  formatTaskCost,
  formatTaskTokens,
  isLiveTaskState,
  taskStateLabel,
  taskStateTone,
  TASK_TONE_BADGE_CLASS,
  workModeLabel,
} from './task-display';

// Below `lg` the list and this panel can no longer sit side by side, so
// selecting a task switches it from a sticky sidebar to a `fixed inset-0`
// takeover of the whole screen. Only the takeover form is actually a dialog.
// on a wide viewport the run list beside it stays live and must not be
// treated as inert.
const MOBILE_TAKEOVER_QUERY = '(max-width: 1023.98px)';

function useIsNarrowViewport(query: string): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setNarrow(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return narrow;
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null);
}

/**
 * Contain focus inside the panel while it is covering the screen, close it on
 * Escape, and hand focus back to whatever opened it, without this, a
 * keyboard or screen-reader user opening a task on a phone could tab past the
 * (visually hidden but still-present) run list underneath, and Escape did
 * nothing.
 */
function useMobileTakeoverDialog(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
): void {
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // `onDismiss` is `() => setSelectedRunId(null)` at the call site, a fresh
  // closure every render, not memoized. A live task re-renders its caller
  // every poll tick (TASK_JOURNAL_POLL_INTERVAL_MS), so depending on the
  // callback directly would tear the listener down and steal focus back to
  // the panel's first control every few seconds instead of only on open.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableWithin(panel)[0] ?? panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [active, panelRef]);
}

function parseGoalDetail(detail: string | undefined): {
  constraints?: string;
  deliverable?: string;
} {
  if (!detail) return {};
  const result: { constraints?: string; deliverable?: string } = {};
  for (const line of detail.split('\n')) {
    const constraints = line.match(/^Constraints:\s*(.+)$/);
    if (constraints?.[1]) result.constraints = constraints[1].trim();
    const deliverable = line.match(/^Deliverable:\s*(.+)$/);
    if (deliverable?.[1]) result.deliverable = deliverable[1].trim();
  }
  return result;
}

export function projectTaskJournal(events: AgentEventEnvelope[]): AgentActivityState | undefined {
  return events.reduce<AgentActivityState | undefined>(
    (activity, event) => applyAgentActivityEvent(activity, event),
    undefined,
  );
}

function isSafeGeneratedFilePath(uri: string): boolean {
  return /^\/api\/files\/[A-Za-z0-9_-]+(?:\?.*)?$/.test(uri);
}

function formatBytes(value: number | undefined): string | null {
  if (value === undefined) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function progressStatus(entry: AgentActivityProgressEntry | AgentActivityToolEntry): string {
  if (entry.status === 'running') return 'In progress';
  if (entry.status === 'awaiting-approval') return 'Needs approval';
  if (entry.status === 'completed') return 'Completed';
  if (entry.status === 'cancelled') return 'Cancelled';
  if (entry.status === 'failed') return 'Failed';
  return 'Pending';
}

const TOOL_CATEGORY_ICON: Record<AgentEventToolCategory, ComponentType<LucideProps>> = {
  'web-search': Search,
  'web-fetch': Globe,
  'code-execution': SquareTerminal,
  filesystem: Folder,
  shell: Terminal,
  skill: BookOpen,
  memory: Brain,
  connector: Plug,
  mcp: Plug,
  'computer-use': MousePointerClick,
  artifact: FileOutput,
  other: Wrench,
};

function statusToneClass(status: AgentActivityToolEntry['status']): string {
  if (status === 'completed') return 'text-emerald-500';
  if (status === 'failed') return 'text-danger';
  if (status === 'cancelled') return 'text-muted-foreground';
  if (status === 'running' || status === 'awaiting-approval') return 'text-primary';
  return 'text-muted-foreground';
}

function ProgressRow({ entry }: { entry: AgentActivityProgressEntry | AgentActivityToolEntry }) {
  const summary = entry.kind === 'progress' ? entry.summary : entry.summary || entry.name;
  const tool = entry.kind === 'tool' ? entry : null;
  const ToolIcon = tool ? TOOL_CATEGORY_ICON[tool.category] : null;
  return (
    <li className="flex gap-2 text-xs">
      {tool && ToolIcon ? (
        <ToolIcon
          aria-hidden
          data-tool-category={tool.category}
          className={cn('mt-0.5 h-3 w-3 shrink-0', statusToneClass(entry.status))}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'mt-1 h-2 w-2 shrink-0 rounded-full',
            entry.status === 'completed' && 'bg-emerald-500',
            entry.status === 'failed' && 'bg-destructive',
            entry.status === 'cancelled' && 'bg-muted-foreground',
            (entry.status === 'running' || entry.status === 'awaiting-approval') && 'bg-primary',
            entry.status === 'pending' && 'bg-muted-foreground/50',
          )}
        />
      )}
      <span className="min-w-0">
        <span className="block text-foreground">{summary}</span>
        <span className="text-[12px] text-muted-foreground">{progressStatus(entry)}</span>
        {entry.kind === 'progress' && entry.detail ? (
          <span className="mt-0.5 block text-muted-foreground">{entry.detail}</span>
        ) : null}
      </span>
    </li>
  );
}

function OutputRow({ output }: { output: AgentActivityArtifactEntry }) {
  const size = formatBytes(output.sizeBytes);
  const safePath = isSafeGeneratedFilePath(output.uri);
  return (
    <li className="rounded-md border border-border/70 p-2">
      <div className="truncate text-xs font-medium text-foreground">{output.name}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">
        {output.mimeType}
        {size ? ` · ${size}` : ''}
      </div>
      {safePath ? (
        <a
          href={output.uri}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[12px] font-medium text-foreground hover:bg-accent"
        >
          <Download className="h-3 w-3" />
          Download and open
        </a>
      ) : (
        <div className="mt-2 text-[12px] text-muted-foreground">
          Download unavailable for this historical output.
        </div>
      )}
    </li>
  );
}

function TaskCostSection({ run }: { run: CloudAgentRun }) {
  const usage = run.usage;
  const live = isLiveTaskState(run.state);
  return (
    <section
      data-testid="task-cost"
      aria-label="Task cost and usage"
      className="mx-4 mb-4 rounded-md border border-border/70 p-3"
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        Cost and usage
      </p>
      {usage ? (
        <>
          {usage.costCents === null ? (
            <p className="mt-1.5 text-sm text-foreground">
              This run was metered against your free trial allowance rather than charged.
            </p>
          ) : (
            <p className="mt-1.5 text-lg font-semibold text-foreground">
              {formatTaskCost(usage.costCents)}
            </p>
          )}
          <p className="mt-1 text-[12px] text-muted-foreground">
            {formatTaskTokens(usage.inputTokens)} in · {formatTaskTokens(usage.outputTokens)} out
            {usage.reasoningTokens > 0
              ? ` · ${formatTaskTokens(usage.reasoningTokens)} reasoning`
              : ''}{' '}
            · {usage.providerCalls} model {usage.providerCalls === 1 ? 'call' : 'calls'}
          </p>
          {live ? (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              This is what has settled so far. The total grows while the task keeps working.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {live
            ? 'Cost and token usage are recorded when this task settles.'
            : 'No settled cost was recorded for this task.'}
        </p>
      )}
    </section>
  );
}

export interface TaskDetailPanelProps {
  run: CloudAgentRun | null;
  events: AgentEventEnvelope[];
  loading: boolean;
  error: string | null;
  truncated?: boolean;
  autoRefreshing?: boolean;
  onRefresh(): void;
  onClose(): void;
  onOpenConversation(conversationId: string): void;
  onRerun?(goal: AgiWorkRerunGoal): void;
}

export function TaskDetailPanel({
  run,
  events,
  loading,
  error,
  truncated = false,
  autoRefreshing = false,
  onRefresh,
  onClose,
  onOpenConversation,
  onRerun,
}: TaskDetailPanelProps) {
  const isMobileTakeover = useIsNarrowViewport(MOBILE_TAKEOVER_QUERY);
  const panelRef = useRef<HTMLElement | null>(null);
  const dialogActive = isMobileTakeover && run !== null;
  useMobileTakeoverDialog(panelRef, dialogActive, onClose);

  if (!run) {
    return (
      <aside
        aria-label="Task details"
        className="flex min-h-56 items-center justify-center rounded-xl border bg-card p-6 text-center lg:sticky lg:top-0 lg:min-h-[420px] lg:self-start"
      >
        <div className="flex max-w-64 flex-col items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
            aria-hidden
          >
            <ListChecks className="h-5 w-5" />
          </span>
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold text-foreground">Select a task</h2>
            <p className="text-sm leading-5 text-muted-foreground">
              Review progress, outputs, and durable context without leaving this page.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  const activity = projectTaskJournal(events);
  const entries = activity?.entries ?? [];
  const goalEntry = entries.find(
    (entry): entry is AgentActivityProgressEntry =>
      entry.kind === 'progress' && entry.progressId === AGIWORK_GOAL_PROGRESS_ID,
  );
  const planSteps = entries.filter(
    (entry): entry is AgentActivityProgressEntry =>
      entry.kind === 'progress' && entry.progressId.startsWith(AGIWORK_PLAN_PROGRESS_ID_PREFIX),
  );
  const progress = entries.filter(
    (entry): entry is Extract<AgentActivityEntry, { kind: 'progress' } | { kind: 'tool' }> =>
      (entry.kind === 'progress' &&
        entry.progressId !== AGIWORK_GOAL_PROGRESS_ID &&
        !entry.progressId.startsWith(AGIWORK_PLAN_PROGRESS_ID_PREFIX)) ||
      entry.kind === 'tool',
  );
  const outputs = entries.filter(
    (entry): entry is AgentActivityArtifactEntry => entry.kind === 'artifact',
  );
  const context = entries.filter(
    (entry): entry is AgentActivityContextEntry => entry.kind === 'context',
  );
  const failures = entries.filter(
    (entry): entry is AgentActivityErrorEntry => entry.kind === 'error',
  );
  const tone = taskStateTone(run.state);

  return (
    <aside
      ref={panelRef}
      aria-label="Task details"
      className="fixed inset-0 z-50 min-h-0 overflow-y-auto bg-card lg:sticky lg:inset-auto lg:z-auto lg:max-h-[calc(100vh-10rem)] lg:rounded-xl lg:border"
      {...(dialogActive ? { role: 'dialog' as const, 'aria-modal': true, tabIndex: -1 } : {})}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card p-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {workModeLabel(run.workMode)} task
          </div>
          <span
            className={cn(
              'mt-1 inline-flex rounded-full border px-2 py-0.5 text-[12px] font-medium',
              TASK_TONE_BADGE_CLASS[tone],
            )}
          >
            {taskStateLabel(run.state)}
          </span>
          {autoRefreshing ? (
            <span
              data-testid="task-auto-refreshing"
              className="ml-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground"
            >
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Updating automatically
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh task details"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
            aria-label="Close task details"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {error ? (
        <div role="alert" className="m-4 rounded-md border border-destructive/40 p-3 text-xs">
          {error}
        </div>
      ) : null}

      {goalEntry ? (
        <section
          data-testid="task-goal"
          aria-label="Task goal"
          className="m-4 rounded-md border border-border/70 bg-muted/30 p-3"
        >
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Goal
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">
            {goalEntry.summary}
          </p>
          {goalEntry.detail ? (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {goalEntry.detail}
            </p>
          ) : null}
          {onRerun && !isLiveTaskState(run.state) ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 text-xs"
              onClick={() =>
                onRerun({ goal: goalEntry.summary, ...parseGoalDetail(goalEntry.detail) })
              }
            >
              <RotateCcw className="mr-1.5 h-3 w-3" />
              Re-run this task
            </Button>
          ) : null}
        </section>
      ) : null}

      {planSteps.length > 0 ? (
        <section
          data-testid="task-plan"
          aria-label="Task plan"
          className="mx-4 mb-4 rounded-md border border-border/70 p-3"
        >
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plan · {planSteps.length}
          </p>
          <ol className="mt-2 flex flex-col gap-1.5">
            {planSteps.map((step) => (
              <li key={step.id} className="flex gap-2 text-xs text-foreground">
                <span
                  aria-hidden
                  className={cn(
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                    step.status === 'completed' && 'bg-emerald-500',
                    step.status === 'failed' && 'bg-destructive',
                    step.status === 'cancelled' && 'bg-muted-foreground',
                    step.status === 'running' && 'bg-primary',
                  )}
                />
                <span className="min-w-0 break-words">{step.summary}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {failures.length > 0 || run.state === 'failed' ? (
        <section
          data-testid="task-failure-reason"
          aria-label="Why this task failed"
          className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-danger" />
            Why this task failed
          </p>
          {failures.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-2">
              {failures.map((failure) => (
                <li key={failure.id} className="min-w-0">
                  <span className="block break-words text-xs text-foreground">
                    {failure.message}
                  </span>
                  {failure.code || failure.retryable ? (
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {failure.code ? failure.code : null}
                      {failure.code && failure.retryable ? ' · ' : null}
                      {failure.retryable ? 'Temporary, safe to run again' : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {loading
                ? 'Loading the failure reason…'
                : 'The engine recorded no reason for this failure. Open the source chat for the full transcript.'}
            </p>
          )}
        </section>
      ) : null}

      <TaskCostSection run={run} />

      <div className="flex flex-col divide-y">
        <details open className="group p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Progress · {progress.length}
          </summary>
          {progress.length > 0 ? (
            <ol className="mt-3 flex flex-col gap-3">
              {progress.map((entry) => (
                <ProgressRow key={entry.id} entry={entry} />
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {loading ? 'Loading task journal…' : 'No durable progress entries were recorded.'}
            </p>
          )}
        </details>

        <details open className="group p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Outputs · {outputs.length}
          </summary>
          {outputs.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {outputs.map((output) => (
                <OutputRow key={output.id} output={output} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {loading ? 'Loading outputs…' : 'No generated files are recorded for this task.'}
            </p>
          )}
        </details>

        <details open className="group p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Context
          </summary>
          {context.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {context.map((entry) => (
                <li key={entry.id} className="text-xs text-muted-foreground">
                  {entry.summary}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            The durable task record does not copy input filenames or folder paths. Review the source
            conversation for the exact attachments and project context used.
          </p>
          {run.conversationId ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 text-xs"
              onClick={() => onOpenConversation(run.conversationId!)}
            >
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Open source chat
            </Button>
          ) : (
            <p className="mt-2 text-[12px] text-muted-foreground">
              This historical run has no source-conversation reference.
            </p>
          )}
        </details>
      </div>

      {truncated ? (
        <p className="border-t p-4 text-[12px] text-muted-foreground">
          This unusually long journal is truncated after 4,000 events. Open the source chat for the
          complete transcript.
        </p>
      ) : null}
    </aside>
  );
}
