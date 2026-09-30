import { useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Archive, ArchiveRestore, Check, MessageSquare, Pause, Play, X } from 'lucide-react';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import {
  AGENT_TASK_BOARD_STAGES,
  TOOL_APPROVAL_ACTION_LABELS,
  agentTaskBoardStage,
  type AgentTaskBoardStage,
} from '@agiworkforce/types';
import { Button, Spinner } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import {
  TASK_TONE_BADGE_CLASS,
  isArchivableState,
  isCancellableState,
  isPausableState,
  runWorkState,
  taskStateLabel,
  taskStateTone,
  workModeLabel,
} from './task-display';

const CARD_ACTION_CLASS = 'h-7 px-2 text-xs text-muted-foreground pointer-coarse:min-h-11';

export interface TasksBoardProps {
  runs: CloudAgentRun[];
  showEmptyStages: boolean;
  selectedRunId: string | null;
  runTitle(run: CloudAgentRun): { title: string; isFallback: boolean };
  cancellingId: string | null;
  pausingId: string | null;
  archivingId: string | null;
  resolvingApprovalId: string | null;
  canArchive: boolean;
  onSelect(runId: string): void;
  onOpenConversation(run: CloudAgentRun): void;
  onApprove(run: CloudAgentRun): void;
  onDeny(run: CloudAgentRun): void;
  onPause(runId: string): void;
  onResume(runId: string): void;
  onCancel(runId: string): void;
  onArchive(run: CloudAgentRun, archived: boolean): void;
}

export function TasksBoard({
  runs,
  showEmptyStages,
  selectedRunId,
  runTitle,
  cancellingId,
  pausingId,
  archivingId,
  resolvingApprovalId,
  canArchive,
  onSelect,
  onOpenConversation,
  onApprove,
  onDeny,
  onPause,
  onResume,
  onCancel,
  onArchive,
}: TasksBoardProps) {
  const cardButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ runId: string; from: AgentTaskBoardStage } | null>(null);

  const grouped = new Map<AgentTaskBoardStage, CloudAgentRun[]>();
  for (const run of runs) {
    const column = agentTaskBoardStage(runWorkState(run));
    grouped.set(column, [...(grouped.get(column) ?? []), run]);
  }
  const columns = AGENT_TASK_BOARD_STAGES.filter(
    (column) => (column.alwaysShown && showEmptyStages) || grouped.has(column.id),
  );

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const run = runs.find((candidate) => candidate.id === pending.runId);
    if (!run) {
      pendingFocus.current = null;
      return;
    }
    if (agentTaskBoardStage(runWorkState(run)) === pending.from) {
      const busy = [cancellingId, pausingId, archivingId, resolvingApprovalId].includes(run.id);
      if (!busy) pendingFocus.current = null;
      return;
    }
    pendingFocus.current = null;
    cardButtons.current.get(run.id)?.focus();
  }, [archivingId, cancellingId, pausingId, resolvingApprovalId, runs]);

  const move = (run: CloudAgentRun, action: () => void) => {
    pendingFocus.current = { runId: run.id, from: agentTaskBoardStage(runWorkState(run)) };
    action();
  };

  return (
    <div
      data-testid="tasks-board"
      className="flex min-h-0 gap-3 overflow-x-auto pb-2"
      role="region"
      aria-label="Task board"
    >
      {columns.map((column) => {
        const columnRuns = grouped.get(column.id) ?? [];
        const headingId = `tasks-board-${column.id}`;
        return (
          <section
            key={column.id}
            data-testid={`tasks-board-column-${column.id}`}
            aria-labelledby={headingId}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2"
          >
            <h2
              id={headingId}
              className="flex items-center justify-between px-1 text-sm font-medium text-foreground"
            >
              <span>{column.label}</span>
              <span className="text-xs text-muted-foreground">{columnRuns.length}</span>
            </h2>
            {columnRuns.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nothing here</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {columnRuns.map((run) => {
                  const workState = runWorkState(run);
                  const pausable = isPausableState(workState);
                  const pauseRequested = pausable && Boolean(run.pauseRequestedAt);
                  const selected = selectedRunId === run.id;
                  const { title, isFallback } = runTitle(run);
                  const pending = run.state === 'awaiting_input' ? run.pendingApproval : null;
                  const resolving = resolvingApprovalId === run.id;
                  return (
                    <li
                      key={run.id}
                      data-testid={`tasks-board-card-${run.id}`}
                      className={cn(
                        'flex flex-col gap-2 rounded-lg border bg-background p-2.5',
                        selected && 'border-primary',
                      )}
                    >
                      <button
                        type="button"
                        ref={(node) => {
                          if (node) cardButtons.current.set(run.id, node);
                          else cardButtons.current.delete(run.id);
                        }}
                        aria-label={`View details for ${title}, ${taskStateLabel(workState)}`}
                        aria-pressed={selected}
                        onClick={() => onSelect(run.id)}
                        className="flex min-w-0 flex-col gap-1 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="line-clamp-2 text-sm font-medium">{title}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-caption font-medium',
                              TASK_TONE_BADGE_CLASS[taskStateTone(workState)],
                            )}
                          >
                            {pauseRequested ? 'Pausing' : taskStateLabel(workState)}
                          </span>
                          {isFallback ? null : <span>{workModeLabel(run.workMode)}</span>}
                          <span>
                            {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                          </span>
                        </span>
                      </button>
                      {pending ? (
                        <p className="break-words text-xs text-muted-foreground">
                          Wants to run {pending.toolCalls.map((call) => call.name).join(', ')}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1">
                        {pending ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs pointer-coarse:min-h-11"
                              disabled={resolving}
                              aria-label={`${TOOL_APPROVAL_ACTION_LABELS.approve}: ${title}`}
                              onClick={() => move(run, () => onApprove(run))}
                            >
                              {resolving ? (
                                <Spinner size="sm" aria-label="Sending your decision" />
                              ) : (
                                <>
                                  <Check className="me-1 h-3.5 w-3.5" aria-hidden />
                                  {TOOL_APPROVAL_ACTION_LABELS.approve}
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={CARD_ACTION_CLASS}
                              disabled={resolving}
                              aria-label={`${TOOL_APPROVAL_ACTION_LABELS.deny}: ${title}`}
                              onClick={() => move(run, () => onDeny(run))}
                            >
                              {TOOL_APPROVAL_ACTION_LABELS.deny}
                            </Button>
                          </>
                        ) : null}
                        {pausable ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={CARD_ACTION_CLASS}
                            disabled={pausingId === run.id}
                            aria-label={`${pauseRequested ? 'Keep working' : 'Pause'}: ${title}`}
                            onClick={() =>
                              move(run, () => (pauseRequested ? onResume(run.id) : onPause(run.id)))
                            }
                          >
                            {pausingId === run.id ? (
                              <Spinner size="sm" aria-label="Updating task" />
                            ) : pauseRequested ? (
                              <>
                                <Play className="me-1 h-3.5 w-3.5" aria-hidden /> Keep working
                              </>
                            ) : (
                              <>
                                <Pause className="me-1 h-3.5 w-3.5" aria-hidden /> Pause
                              </>
                            )}
                          </Button>
                        ) : null}
                        {workState === 'paused' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={CARD_ACTION_CLASS}
                            disabled={pausingId === run.id}
                            aria-label={`Resume: ${title}`}
                            onClick={() => move(run, () => onResume(run.id))}
                          >
                            {pausingId === run.id ? (
                              <Spinner size="sm" aria-label="Resuming task" />
                            ) : (
                              <>
                                <Play className="me-1 h-3.5 w-3.5" aria-hidden /> Resume
                              </>
                            )}
                          </Button>
                        ) : null}
                        {isCancellableState(workState) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={CARD_ACTION_CLASS}
                            disabled={cancellingId === run.id}
                            aria-label={`Stop: ${title}`}
                            onClick={() => move(run, () => onCancel(run.id))}
                          >
                            {cancellingId === run.id ? (
                              <Spinner size="sm" aria-label="Stopping task" />
                            ) : (
                              <>
                                <X className="me-1 h-3.5 w-3.5" aria-hidden /> Stop
                              </>
                            )}
                          </Button>
                        ) : null}
                        {canArchive && run.state === 'archived' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={CARD_ACTION_CLASS}
                            disabled={archivingId === run.id}
                            aria-label={`Restore: ${title}`}
                            onClick={() => onArchive(run, false)}
                          >
                            {archivingId === run.id ? (
                              <Spinner size="sm" aria-label="Restoring task" />
                            ) : (
                              <>
                                <ArchiveRestore className="me-1 h-3.5 w-3.5" aria-hidden /> Restore
                              </>
                            )}
                          </Button>
                        ) : null}
                        {canArchive && isArchivableState(workState) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={CARD_ACTION_CLASS}
                            disabled={archivingId === run.id}
                            aria-label={`Archive: ${title}`}
                            onClick={() => onArchive(run, true)}
                          >
                            {archivingId === run.id ? (
                              <Spinner size="sm" aria-label="Archiving task" />
                            ) : (
                              <>
                                <Archive className="me-1 h-3.5 w-3.5" aria-hidden /> Archive
                              </>
                            )}
                          </Button>
                        ) : null}
                        {run.conversationId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={CARD_ACTION_CLASS}
                            aria-label={`Open chat: ${title}`}
                            onClick={() => onOpenConversation(run)}
                          >
                            <MessageSquare className="me-1 h-3 w-3" aria-hidden /> Open chat
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
