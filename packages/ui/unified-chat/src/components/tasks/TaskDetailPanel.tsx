import { Download, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  applyAgentActivityEvent,
  type AgentActivityArtifactEntry,
  type AgentActivityContextEntry,
  type AgentActivityEntry,
  type AgentActivityProgressEntry,
  type AgentActivityState,
  type AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { Button } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import {
  taskStateLabel,
  taskStateTone,
  TASK_TONE_BADGE_CLASS,
  workModeLabel,
} from './task-display';

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

function ProgressRow({ entry }: { entry: AgentActivityProgressEntry | AgentActivityToolEntry }) {
  const summary = entry.kind === 'progress' ? entry.summary : entry.summary || entry.name;
  return (
    <li className="flex gap-2 text-xs">
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
      <span className="min-w-0">
        <span className="block text-foreground">{summary}</span>
        <span className="text-[11px] text-muted-foreground">{progressStatus(entry)}</span>
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
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {output.mimeType}
        {size ? ` · ${size}` : ''}
      </div>
      {safePath ? (
        <a
          href={output.uri}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
        >
          <Download className="h-3 w-3" />
          Download and open
        </a>
      ) : (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Download unavailable for this historical output.
        </div>
      )}
    </li>
  );
}

export interface TaskDetailPanelProps {
  run: CloudAgentRun | null;
  events: AgentEventEnvelope[];
  loading: boolean;
  error: string | null;
  truncated?: boolean;
  onRefresh(): void;
  onClose(): void;
  onOpenConversation(conversationId: string): void;
}

export function TaskDetailPanel({
  run,
  events,
  loading,
  error,
  truncated = false,
  onRefresh,
  onClose,
  onOpenConversation,
}: TaskDetailPanelProps) {
  if (!run) {
    return (
      <aside
        aria-label="Task details"
        className="flex min-h-56 items-center justify-center rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground lg:sticky lg:top-0 lg:min-h-[420px]"
      >
        Select a task to review its progress, outputs, and durable context.
      </aside>
    );
  }

  const activity = projectTaskJournal(events);
  const entries = activity?.entries ?? [];
  const progress = entries.filter(
    (entry): entry is Extract<AgentActivityEntry, { kind: 'progress' } | { kind: 'tool' }> =>
      entry.kind === 'progress' || entry.kind === 'tool',
  );
  const outputs = entries.filter(
    (entry): entry is AgentActivityArtifactEntry => entry.kind === 'artifact',
  );
  const context = entries.filter(
    (entry): entry is AgentActivityContextEntry => entry.kind === 'context',
  );
  const tone = taskStateTone(run.state);

  return (
    <aside
      aria-label="Task details"
      className="min-h-0 rounded-xl border bg-card lg:sticky lg:top-0 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto"
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card p-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {workModeLabel(run.workMode)} task
          </div>
          <span
            className={cn(
              'mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
              TASK_TONE_BADGE_CLASS[tone],
            )}
          >
            {taskStateLabel(run.state)}
          </span>
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
            <p className="mt-2 text-[11px] text-muted-foreground">
              This historical run has no source-conversation reference.
            </p>
          )}
        </details>
      </div>

      {truncated ? (
        <p className="border-t p-4 text-[11px] text-muted-foreground">
          This unusually long journal is truncated after 4,000 events. Open the source chat for the
          complete transcript.
        </p>
      ) : null}
    </aside>
  );
}
