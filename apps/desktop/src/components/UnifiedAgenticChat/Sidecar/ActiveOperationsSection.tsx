import React from 'react';
import { useUnifiedChatStore } from '../../../stores/unifiedChatStore';
import {
  Activity,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Terminal,
  FileText,
  Wrench,
  Users,
} from 'lucide-react';

export interface ActiveOperationsSectionProps {
  className?: string;
}

export const ActiveOperationsSection: React.FC<ActiveOperationsSectionProps> = ({
  className = '',
}) => {
  const fileOperations = useUnifiedChatStore((state) => state.fileOperations);
  const terminalCommands = useUnifiedChatStore((state) => state.terminalCommands);
  const toolExecutions = useUnifiedChatStore((state) => state.toolExecutions);
  const backgroundTasks = useUnifiedChatStore((state) => state.backgroundTasks);
  const agents = useUnifiedChatStore((state) => state.agents);

  // Get recent operations (last 10)
  const recentFileOps = fileOperations.slice(-10).reverse();
  const recentTerminalCmds = terminalCommands.slice(-10).reverse();
  const recentToolExecs = toolExecutions.slice(-10).reverse();
  const activeBackgroundTasks = backgroundTasks.filter(
    (task) => task.status === 'running' || task.status === 'queued',
  );
  const activeAgents = agents.filter(
    (agent) => agent.status === 'running' || agent.status === 'idle',
  );

  const totalActive =
    activeBackgroundTasks.length +
    activeAgents.length +
    recentFileOps.filter((op) => !op.success && op.error).length;

  return (
    <div className={`active-operations-section h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-gray-600 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Active Operations
          </h3>
        </div>
        {totalActive > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-xs text-blue-700 dark:text-blue-300">
            <Loader2 size={12} className="animate-spin" />
            {totalActive} active
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Background Tasks */}
        {activeBackgroundTasks.length > 0 && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase">
              Background Tasks
            </h4>
            <div className="space-y-2">
              {activeBackgroundTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {task.name}
                    </span>
                    <span className="text-xs text-gray-500">{task.progress}%</span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {task.description}
                    </p>
                  )}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Agents */}
        {activeAgents.length > 0 && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase flex items-center gap-1">
              <Users size={12} />
              Active Agents
            </h4>
            <div className="space-y-2">
              {activeAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {agent.name}
                    </span>
                    <span className="text-xs text-purple-600 dark:text-purple-400">
                      {agent.status}
                    </span>
                  </div>
                  {agent.currentStep && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {agent.currentStep}
                    </p>
                  )}
                  {agent.progress > 0 && (
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-purple-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${agent.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent File Operations */}
        {recentFileOps.length > 0 && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase flex items-center gap-1">
              <FileText size={12} />
              Recent File Operations
            </h4>
            <div className="space-y-1">
              {recentFileOps.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded text-xs"
                >
                  {op.success ? (
                    <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-red-500 flex-shrink-0" />
                  )}
                  <span className="text-gray-600 dark:text-gray-400 uppercase">{op.type}</span>
                  <span className="flex-1 truncate text-gray-900 dark:text-gray-100 font-mono">
                    {op.filePath}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Terminal Commands */}
        {recentTerminalCmds.length > 0 && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase flex items-center gap-1">
              <Terminal size={12} />
              Recent Commands
            </h4>
            <div className="space-y-1">
              {recentTerminalCmds.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded text-xs"
                >
                  {cmd.exitCode === 0 || cmd.exitCode === undefined ? (
                    <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-red-500 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate text-gray-900 dark:text-gray-100 font-mono">
                    {cmd.command}
                  </span>
                  {cmd.duration && (
                    <span className="text-gray-500">
                      {cmd.duration < 1000
                        ? `${cmd.duration}ms`
                        : `${(cmd.duration / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Tool Executions */}
        {recentToolExecs.length > 0 && (
          <div className="p-4">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase flex items-center gap-1">
              <Wrench size={12} />
              Recent Tool Executions
            </h4>
            <div className="space-y-1">
              {recentToolExecs.map((exec) => (
                <div
                  key={exec.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-900 rounded text-xs"
                >
                  {exec.success ? (
                    <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-red-500 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate text-gray-900 dark:text-gray-100 font-mono">
                    {exec.toolName}
                  </span>
                  <span className="text-gray-500">
                    {exec.duration < 1000
                      ? `${exec.duration}ms`
                      : `${(exec.duration / 1000).toFixed(1)}s`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {totalActive === 0 &&
          recentFileOps.length === 0 &&
          recentTerminalCmds.length === 0 &&
          recentToolExecs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Clock size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400">No active operations</p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Operations will appear here as they execute
              </p>
            </div>
          )}
      </div>
    </div>
  );
};

export default ActiveOperationsSection;
