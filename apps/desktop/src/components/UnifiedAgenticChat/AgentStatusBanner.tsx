import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { Loader2, CheckCircle2, XCircle, Pause, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const AgentStatusBanner = () => {
  const agentStatus = useUnifiedChatStore((s) => s.agentStatus);

  if (!agentStatus) return null;

  const getStatusIcon = () => {
    switch (agentStatus.status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'paused':
        return <Pause className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getStatusColor = () => {
    switch (agentStatus.status) {
      case 'running':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-600';
      case 'completed':
        return 'bg-green-500/10 border-green-500/20 text-green-600';
      case 'failed':
        return 'bg-red-500/10 border-red-500/20 text-red-600';
      case 'paused':
        return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600';
      default:
        return 'bg-gray-500/10 border-gray-500/20 text-gray-600';
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2 border-b',
      getStatusColor()
    )}>
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
      {agentStatus.resourceUsage && (
        <div className="text-xs opacity-70">
          CPU: {agentStatus.resourceUsage.cpu.toFixed(1)}% |
          MEM: {agentStatus.resourceUsage.memory.toFixed(1)}%
        </div>
      )}
    </div>
  );
};
