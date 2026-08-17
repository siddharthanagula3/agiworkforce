import { CheckCircle2, Clock, Loader2, Pause, Play, Repeat, XCircle } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { cn } from '../../lib/utils';
import {
  isTerminalBackgroundAgentStatus,
  subscribeToBackgroundAgents,
  useBackgroundAgentStore,
  type BackgroundAgent,
  type BackgroundAgentStatus,
} from '../../stores/backgroundAgentStore';

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
  queued: 'text-yellow-400 bg-yellow-400/10',
  running: 'text-blue-400 bg-blue-400/10',
  paused: 'text-amber-400 bg-amber-400/10',
  completed: 'text-green-400 bg-green-400/10',
  failed: 'text-red-400 bg-red-400/10',
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

function BackgroundAgentRow({ agent }: { agent: BackgroundAgent }) {
  const pauseAgent = useBackgroundAgentStore((s) => s.pauseAgent);
  const resumeAgent = useBackgroundAgentStore((s) => s.resumeAgent);
  const cancelAgent = useBackgroundAgentStore((s) => s.cancelAgent);
  const takeOverAgent = useBackgroundAgentStore((s) => s.takeOverAgent);

  const terminal = isTerminalBackgroundAgentStatus(agent.status);
  const percentage = Math.min(100, Math.max(0, agent.progress?.percentage ?? 0));

  return (
    <li className="rounded-lg border border-white/10 bg-white/5 p-3" data-testid="background-agent">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{agent.goal}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {agent.progress?.currentStepDescription}
          </p>
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
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-teal-500 transition-all" style={{ width: `${percentage}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Step {agent.progress?.currentStep ?? 0} of {agent.progress?.totalSteps ?? 0} ·{' '}
          {percentage}%
        </p>
      </div>

      {agent.error ? <p className="mt-2 text-xs text-red-400">{agent.error}</p> : null}

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
          onClick={() => void cancelAgent(agent.id)}
          className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40"
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="button"
          disabled={terminal}
          onClick={() => void takeOverAgent(agent.id)}
          className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40"
        >
          <Repeat className="h-3.5 w-3.5" />
          Take Over
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

  useEffect(() => {
    void listAgents();
    let unsubscribe: (() => void) | undefined;
    void subscribeToBackgroundAgents().then((fn) => {
      unsubscribe = fn;
    });
    return () => unsubscribe?.();
  }, [listAgents]);

  const refresh = useCallback(() => {
    void listAgents();
  }, [listAgents]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">
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

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {agents.length === 0 ? (
        <p className="text-sm text-slate-500">
          No background agents yet. Prefix a message with &amp; to push it to the background.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => (
            <BackgroundAgentRow key={agent.id} agent={agent} />
          ))}
        </ul>
      )}
    </div>
  );
}
