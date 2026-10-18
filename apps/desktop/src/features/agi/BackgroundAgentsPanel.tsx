import { CheckCircle2, Clock, Loader2, Pause, Play, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useConfirmAction, type ConfirmActionRequest } from '@agiworkforce/ui';

import { cn } from '../../lib/utils';
import {
  NOTIFICATION_TARGET_ATTRIBUTE,
  notificationTargetValue,
  useNotificationTarget,
} from '../notifications/notificationTarget';
import {
  isTerminalBackgroundAgentStatus,
  subscribeToBackgroundAgents,
  useBackgroundAgentStore,
  type BackgroundAgent,
  type BackgroundAgentBoundary,
  type BackgroundAgentStatus,
} from '../../stores/backgroundAgentStore';

const BOUNDARY_LABELS: Record<BackgroundAgentBoundary, string> = {
  local: 'Model: on this computer',
  on_device: 'Model: on this computer',
  managed_cloud: 'Model: AGI Cloud',
};

const STATUS_LABELS: Record<BackgroundAgentStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  taken_over: 'Taken over',
};

const STATUS_STYLES: Record<BackgroundAgentStatus, string> = {
  queued: 'text-warning-text bg-warning-fill/10',
  running: 'text-blue-400 bg-blue-400/10',
  paused: 'text-warning-text bg-warning-fill/10',
  completed: 'text-success-text bg-success-fill/10',
  failed: 'text-danger-text bg-danger-fill/10',
  cancelled: 'text-slate-400 bg-slate-400/10',
  taken_over: 'text-teal-400 bg-teal-400/10',
};

function StatusIcon({ status }: { status: BackgroundAgentStatus }) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === 'queued') return <Clock className="h-4 w-4" />;
  if (status === 'paused') return <Pause className="h-4 w-4" />;
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4" />;
  return <XCircle className="h-4 w-4" />;
}

function RunResult({ agent }: { agent: BackgroundAgent }) {
  const { summary, error } = agent;
  if (!summary && !error) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="background-agent-result">
      {error ? (
        <p className="whitespace-pre-wrap break-words text-xs text-danger-text">{error}</p>
      ) : null}
      {summary ? (
        <>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-100">
            {summary.description}
          </p>
          {summary.warnings.map((warning) => (
            <p key={warning} className="whitespace-pre-wrap break-words text-xs text-warning-text">
              {warning}
            </p>
          ))}
          {summary.actionsTaken.length > 0 ? (
            <details className="text-xs text-slate-300">
              <summary className="cursor-pointer text-slate-400">
                {summary.actionsTaken.length === 1
                  ? '1 step'
                  : `${summary.actionsTaken.length} steps`}
              </summary>
              <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5">
                {summary.actionsTaken.map((action, index) => (
                  <li key={`${index}-${action}`} className="whitespace-pre-wrap break-words">
                    {action}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function BackgroundAgentRow({
  agent,
  revealed,
  confirm,
}: {
  agent: BackgroundAgent;
  revealed: boolean;
  confirm: (request: ConfirmActionRequest) => void;
}) {
  const pauseAgent = useBackgroundAgentStore((s) => s.pauseAgent);
  const resumeAgent = useBackgroundAgentStore((s) => s.resumeAgent);
  const cancelAgent = useBackgroundAgentStore((s) => s.cancelAgent);

  const terminal = isTerminalBackgroundAgentStatus(agent.status);
  const percentage = Math.min(100, Math.max(0, agent.progress?.percentage ?? 0));
  const currentStep = agent.progress?.currentStep ?? 0;
  const totalSteps = agent.progress?.totalSteps ?? 0;
  const boundary = agent.context?.boundary;
  const boundaryLabel = boundary ? BOUNDARY_LABELS[boundary] : undefined;

  return (
    <li
      tabIndex={-1}
      {...{
        [NOTIFICATION_TARGET_ATTRIBUTE]: notificationTargetValue('background-agent', agent.id),
      }}
      className={cn(
        'rounded-lg border border-white/10 bg-white/5 p-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        revealed && 'ring-2 ring-ring',
      )}
      data-testid="background-agent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{agent.goal}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {agent.progress?.currentStepDescription}
          </p>
          {boundaryLabel ? (
            <p
              className="mt-0.5 truncate text-xs text-slate-400"
              data-testid="background-agent-boundary"
            >
              {boundaryLabel}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_STYLES[agent.status],
          )}
        >
          <StatusIcon status={agent.status} />
          {STATUS_LABELS[agent.status]}
        </span>
      </div>

      <div className="mt-2" aria-label={`Progress for ${agent.goal}`}>
        {totalSteps > 0 ? (
          <>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-teal-500 transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Step {currentStep} of {totalSteps} · {percentage}%
            </p>
          </>
        ) : currentStep > 0 ? (
          <p className="text-xs text-slate-500">Tool call {currentStep}</p>
        ) : null}
      </div>

      <RunResult agent={agent} />

      <div className="mt-3 flex flex-wrap gap-2">
        {agent.status === 'paused' ? (
          <button
            type="button"
            onClick={() => void resumeAgent(agent.id)}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10"
          >
            <Play className="h-3.5 w-3.5" />
            Resume
          </button>
        ) : (
          <button
            type="button"
            disabled={terminal}
            onClick={() => void pauseAgent(agent.id)}
            className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </button>
        )}
        <button
          type="button"
          disabled={terminal}
          onClick={() =>
            confirm({
              title: 'Cancel this background run?',
              description: `"${agent.goal}" stops now. Steps it has not reached are not run, and it cannot be resumed. What it has already done is not undone.`,
              confirmLabel: 'Cancel run',
              cancelLabel: 'Keep running',
              destructive: true,
              onConfirm: () => cancelAgent(agent.id).catch(() => undefined),
            })
          }
          className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40"
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </li>
  );
}

export function BackgroundAgentsPanel() {
  const agents = useBackgroundAgentStore((s) => s.agents);
  const activeCount = useBackgroundAgentStore((s) => s.activeCount);
  const maxAgents = useBackgroundAgentStore((s) => s.maxAgents);
  const error = useBackgroundAgentStore((s) => s.error);
  const listAgents = useBackgroundAgentStore((s) => s.listAgents);

  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [listed, setListed] = useState(false);
  const revealedAgentId = useNotificationTarget(
    'background-agent',
    agents.map((agent) => agent.id),
    listed,
  );

  useEffect(() => {
    let mounted = true;
    void Promise.resolve(listAgents()).finally(() => {
      if (mounted) setListed(true);
    });
    let unsubscribe: (() => void) | undefined;
    void subscribeToBackgroundAgents().then((fn) => {
      unsubscribe = fn;
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [listAgents]);

  const refresh = useCallback(() => {
    void listAgents();
  }, [listAgents]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-h5 text-slate-200">
          Background Agents ({activeCount}/{maxAgents} active)
        </h2>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-xs text-danger-text">{error}</p> : null}

      {agents.length === 0 ? (
        <p className="text-sm text-slate-500">
          No background agents yet. One appears here when a chat starts a background run or an
          automation trigger fires.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <BackgroundAgentRow
              key={agent.id}
              agent={agent}
              revealed={revealedAgentId === agent.id}
              confirm={confirm}
            />
          ))}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
