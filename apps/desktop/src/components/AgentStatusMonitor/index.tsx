import React from 'react';
import { Play, Pause, CheckCircle, XCircle, Clock, Activity, Cpu, HardDrive } from 'lucide-react';
import { AgentStatus } from '../../stores/unifiedChatStore';

interface AgentStatusMonitorProps {
  agents: AgentStatus[];
  onPauseAgent?: (agentId: string) => void;
  onResumeAgent?: (agentId: string) => void;
  onCancelAgent?: (agentId: string) => void;
  compact?: boolean;
  className?: string;
}

const statusConfig = {
  idle: {
    icon: Clock,
    color: 'text-gray-400 dark:text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    label: 'Idle',
  },
  running: {
    icon: Activity,
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    label: 'Running',
  },
  paused: {
    icon: Pause,
    color: 'text-yellow-500 dark:text-yellow-400',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    label: 'Paused',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-500 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'Failed',
  },
};

export const AgentStatusMonitor: React.FC<AgentStatusMonitorProps> = ({
  agents,
  onPauseAgent,
  onResumeAgent,
  onCancelAgent,
  compact = false,
  className = '',
}) => {
  if (agents.length === 0) {
    return (
      <div
        className={`flex items-center justify-center p-8 text-gray-500 dark:text-gray-400 ${className}`}
      >
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No active agents</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {agents.map((agent) => {
        const config = statusConfig[agent.status];
        const StatusIcon = config.icon;
        const duration = agent.startedAt
          ? Math.floor((Date.now() - new Date(agent.startedAt).getTime()) / 1000)
          : 0;

        return (
          <div
            key={agent.id}
            className={`border border-gray-200 dark:border-gray-700 rounded-lg ${config.bgColor} overflow-hidden transition-all hover:shadow-md`}
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1 min-w-0">
                <StatusIcon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {agent.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {config.label}
                    {duration > 0 && ` • ${formatDuration(duration)}`}
                  </p>
                </div>
              </div>

              {/* Actions */}
              {(agent.status === 'running' || agent.status === 'paused') && (
                <div className="flex items-center space-x-2 ml-2">
                  {agent.status === 'running' && onPauseAgent && (
                    <button
                      onClick={() => onPauseAgent(agent.id)}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                      title="Pause agent"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  {agent.status === 'paused' && onResumeAgent && (
                    <button
                      onClick={() => onResumeAgent(agent.id)}
                      className="p-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
                      title="Resume agent"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  {onCancelAgent && (
                    <button
                      onClick={() => onCancelAgent(agent.id)}
                      className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 transition-colors"
                      title="Cancel agent"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Progress and Details (non-compact) */}
            {!compact && (
              <>
                {/* Current Goal */}
                {agent.currentGoal && (
                  <div className="px-4 py-2 bg-white/50 dark:bg-black/20 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Goal
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{agent.currentGoal}</p>
                  </div>
                )}

                {/* Current Step */}
                {agent.currentStep && (
                  <div className="px-4 py-2 bg-white/50 dark:bg-black/20 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Current Step
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{agent.currentStep}</p>
                  </div>
                )}

                {/* Progress Bar */}
                {agent.status === 'running' && (
                  <div className="px-4 py-2 bg-white/50 dark:bg-black/20 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Progress
                      </span>
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                        {agent.progress}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${agent.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Resource Usage */}
                {agent.resourceUsage && (
                  <div className="px-4 py-2 bg-white/50 dark:bg-black/20 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Resources
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {/* CPU */}
                      <div className="flex items-center space-x-2">
                        <Cpu className="w-4 h-4 text-purple-500" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600 dark:text-gray-400">CPU</span>
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                              {agent.resourceUsage.cpu.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-purple-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(agent.resourceUsage.cpu, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Memory */}
                      <div className="flex items-center space-x-2">
                        <HardDrive className="w-4 h-4 text-orange-500" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-600 dark:text-gray-400">Memory</span>
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                              {agent.resourceUsage.memory.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-orange-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(agent.resourceUsage.memory, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Compact Mode Progress */}
            {compact && agent.status === 'running' && (
              <div className="px-4 pb-3">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${agent.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
