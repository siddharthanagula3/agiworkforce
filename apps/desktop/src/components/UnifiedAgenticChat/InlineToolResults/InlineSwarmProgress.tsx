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
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-card/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Spawning swarm agents...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-card/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Swarm execution failed</p>
          {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
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
    return <Clock className="h-3 w-3 text-muted-foreground" />;
  };

  return (
    <div className="mt-3 rounded-lg bg-card/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/60 border-b border-white/10">
        <Users className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-medium text-foreground">Swarm Execution</span>
        <span className="ml-auto text-xs text-muted-foreground">{agents.length} agents</span>
      </div>

      <div className="p-3 space-y-3">
        {goal && <p className="text-xs text-muted-foreground line-clamp-2">{goal}</p>}

        <div className="space-y-2">
          {agents.map((agent, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                {statusIcon(agent.status)}
                <span className="text-xs text-foreground flex-1 truncate">{agent.name}</span>
                <span className="text-xs text-muted-foreground">{agent.progress}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
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
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Overall Progress</span>
            <span>{totalProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-500 transition-all duration-500"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        {results && (
          <div className="p-2 rounded bg-muted/60 text-xs text-muted-foreground line-clamp-3">
            {results}
          </div>
        )}
      </div>
    </div>
  );
}
