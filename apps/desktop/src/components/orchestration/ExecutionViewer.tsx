import React, { useEffect } from 'react';
import { Pause, Play, X, RefreshCw } from 'lucide-react';
import { useOrchestrationStore } from '../../stores/orchestrationStore';

interface ExecutionViewerProps {
  executionId: string;
}

export const ExecutionViewer: React.FC<ExecutionViewerProps> = ({ executionId }) => {
  const {
    currentExecution,
    executionLogs,
    getExecutionStatus,
    getExecutionLogs,
    pauseWorkflow,
    resumeWorkflow,
    cancelWorkflow,
  } = useOrchestrationStore();

  useEffect(() => {
    getExecutionStatus(executionId);
    getExecutionLogs(executionId);
  }, [executionId, getExecutionStatus, getExecutionLogs]);

  const handlePause = async () => {
    await pauseWorkflow(executionId);
  };

  const handleResume = async () => {
    await resumeWorkflow(executionId);
  };

  const handleCancel = async () => {
    if (confirm('Are you sure you want to cancel this execution?')) {
      await cancelWorkflow(executionId);
    }
  };

  const handleRefresh = () => {
    getExecutionStatus(executionId);
    getExecutionLogs(executionId);
  };

  if (!currentExecution) {
    return (
      <div className="p-8 text-center text-gray-500">
        <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
        <p>Loading execution...</p>
      </div>
    );
  }

  const statusColors = {
    pending: 'bg-gray-100 text-gray-700',
    running: 'bg-blue-100 text-blue-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-700',
  };

  const eventTypeColors = {
    started: 'bg-blue-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    skipped: 'bg-gray-400',
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Workflow Execution</h2>
          <div className="flex items-center gap-2">
            {currentExecution.status === 'running' && (
              <button
                onClick={handlePause}
                className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}
            {currentExecution.status === 'paused' && (
              <button
                onClick={handleResume}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            )}
            {(currentExecution.status === 'running' || currentExecution.status === 'paused') && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            )}
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500 mb-1">Status</div>
            <div
              className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${statusColors[currentExecution.status]}`}
            >
              {currentExecution.status.toUpperCase()}
            </div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Current Node</div>
            <div className="font-mono text-xs">{currentExecution.current_node_id || 'N/A'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Execution ID</div>
            <div className="font-mono text-xs truncate">{currentExecution.id}</div>
          </div>
        </div>

        {currentExecution.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="text-sm font-semibold text-red-700 mb-1">Error</div>
            <div className="text-sm text-red-600">{currentExecution.error}</div>
          </div>
        )}
      </div>

      {/* Execution Logs */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Execution Logs</h3>
        {executionLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No logs available</div>
        ) : (
          <div className="space-y-2">
            {executionLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 ${eventTypeColors[log.event_type]}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-gray-600">{log.node_id}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(log.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="font-semibold capitalize">{log.event_type}</span>
                    {log.data && (
                      <div className="mt-1 text-xs text-gray-600 font-mono bg-white p-2 rounded border border-gray-200">
                        {JSON.stringify(log.data, null, 2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
