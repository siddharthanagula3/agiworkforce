import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { Brain, CheckCircle2, XCircle, Pause, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const AgentStatusBanner = () => {
  const agentStatus = useUnifiedChatStore((s) => s.agentStatus);

  if (!agentStatus) return null;

  const getStatusIcon = () => {
    switch (agentStatus.status) {
      case 'running':
        return <Brain className="h-4 w-4 text-zinc-400" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-zinc-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-zinc-400" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-zinc-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-zinc-400" />;
    }
  };

  const getStatusColor = () => {
    // Neutral zinc colors for all statuses
    return 'bg-zinc-800/50 border-white/5 text-zinc-300';
  };

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2 border-b', getStatusColor())}>
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-sm font-medium">
          {agentStatus.currentStep || agentStatus.currentGoal || agentStatus.name}
        </span>
      </div>
      {agentStatus.progress > 0 && (
        <div className="flex-1 max-w-xs">
          <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-current transition-all duration-300"
              style={{ width: `${agentStatus.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
