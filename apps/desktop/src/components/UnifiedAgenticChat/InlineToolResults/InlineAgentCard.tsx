import { Bot, Loader2, AlertCircle, Pause, Play, X, CheckCircle2 } from 'lucide-react';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { cn } from '@/lib/utils';

interface AgentData {
  agentId?: string;
  name?: string;
  goal?: string;
  status?: 'running' | 'paused' | 'completed' | 'error';
  progress?: number;
}

const STATUS_CONFIG = {
  running: { label: 'Running', color: 'text-blue-400', dot: 'bg-blue-400 animate-pulse' },
  paused: { label: 'Paused', color: 'text-amber-400', dot: 'bg-amber-400' },
  completed: { label: 'Completed', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  error: { label: 'Error', color: 'text-red-400', dot: 'bg-red-400' },
};

export function InlineAgentCard({ result, status, onExpand }: ToolResultProps) {
  const data = result?.data as AgentData | undefined;

  if (status === 'running' && !data) {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-card/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Starting agent...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-card/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Agent failed to start</p>
          {result?.error && <p className="text-xs text-muted-foreground mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { name = 'Agent', goal, status: agentStatus = 'running', progress = 0 } = data;
  const statusCfg = STATUS_CONFIG[agentStatus] ?? STATUS_CONFIG.running;
  const isRunning = agentStatus === 'running';
  const isPaused = agentStatus === 'paused';

  return (
    <div className="mt-3 rounded-lg bg-card/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/60 border-b border-white/10">
        {agentStatus === 'completed' ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        ) : (
          <Bot className="h-4 w-4 text-blue-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-foreground flex-1 truncate">{name}</span>
        <div className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', statusCfg.dot)} />
          <span className={cn('text-xs font-medium', statusCfg.color)}>{statusCfg.label}</span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {goal && <p className="text-xs text-muted-foreground line-clamp-2">{goal}</p>}

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                agentStatus === 'error' ? 'bg-red-500' : 'bg-blue-500',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {(isRunning || isPaused) && (
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onExpand?.(isRunning ? 'pause-agent' : 'resume-agent')}
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {isRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isRunning ? 'Pause' : 'Resume'}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onExpand?.('cancel-agent')}
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-red-400"
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
