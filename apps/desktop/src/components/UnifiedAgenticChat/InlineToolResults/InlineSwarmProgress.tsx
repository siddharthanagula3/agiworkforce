import { Loader2, AlertCircle, CheckCircle2, Clock, Users } from 'lucide-react';
import type { ToolResultProps } from './index';
import { cn } from '@/lib/utils';

interface SwarmAgent {
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
}

interface SwarmProgressData {
  goal?: string;
  agents?: SwarmAgent[];
  totalProgress?: number;
  results?: string;
}

export function InlineSwarmProgress({ result, status }: ToolResultProps) {
  const data = result?.data as SwarmProgressData | undefined;

  if (status === 'running' && !data) {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Spawning swarm agents...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Swarm execution failed</p>
          {result?.error && <p className="text-xs text-zinc-500 mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { goal, agents = [], totalProgress = 0, results } = data;

  const statusIcon = (s: SwarmAgent['status']) => {
    if (s === 'running') return <Loader2 className="h-3 w-3 animate-spin text-blue-400" />;
    if (s === 'completed') return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
    if (s === 'error') return <AlertCircle className="h-3 w-3 text-red-400" />;
    return <Clock className="h-3 w-3 text-zinc-500" />;
  };

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border-b border-white/10">
        <Users className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-medium text-zinc-300">Swarm Execution</span>
        <span className="ml-auto text-xs text-zinc-500">{agents.length} agents</span>
      </div>

      <div className="p-3 space-y-3">
        {goal && <p className="text-xs text-zinc-400 line-clamp-2">{goal}</p>}

        <div className="space-y-2">
          {agents.map((agent, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                {statusIcon(agent.status)}
                <span className="text-xs text-zinc-300 flex-1 truncate">{agent.name}</span>
                <span className="text-xs text-zinc-500">{agent.progress}%</span>
              </div>
              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    agent.status === 'error' ? 'bg-red-500' : 'bg-blue-500',
                  )}
                  style={{ width: `${agent.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Overall Progress</span>
            <span>{totalProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-500 transition-all duration-500"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        {results && (
          <div className="p-2 rounded bg-zinc-800/60 text-xs text-zinc-400 line-clamp-3">
            {results}
          </div>
        )}
      </div>
    </div>
  );
}
