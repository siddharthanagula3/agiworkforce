import React, { useEffect, useState } from 'react';
import { Save, Play, Settings } from 'lucide-react';
import { useOrchestrationStore } from '../../stores/orchestrationStore';
import { OrchestrationCanvas } from './OrchestrationCanvas';
import { NodeLibrary } from './NodeLibrary';
import { NodeEditor } from './NodeEditor';
import type { WorkflowDefinition } from '../../types/workflow';

export const WorkflowBuilder: React.FC = () => {
  const {
    selectedWorkflow,
    nodes,
    edges,
    createWorkflow,
    updateWorkflow,
    executeWorkflow,
    error,
    clearError,
  } = useOrchestrationStore();

  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (selectedWorkflow) {
      setWorkflowName(selectedWorkflow.name);
      setWorkflowDescription(selectedWorkflow.description || '');
    }
  }, [selectedWorkflow]);

  const handleSave = async () => {
    const workflowData: Partial<WorkflowDefinition> = {
      name: workflowName,
      description: workflowDescription,
      nodes,
      edges,
      triggers: [],
      metadata: {},
      user_id: 'default-user',
    };

    if (selectedWorkflow) {
      await updateWorkflow(selectedWorkflow.id, {
        ...selectedWorkflow,
        ...workflowData,
      } as WorkflowDefinition);
    } else {
      await createWorkflow(workflowData);
    }
  };

  const handleExecute = async () => {
    if (!selectedWorkflow) {
      alert('Please save the workflow first');
      return;
    }

    setExecuting(true);
    const executionId = await executeWorkflow(selectedWorkflow.id, {});
    setExecuting(false);

    if (executionId) {
      alert(`Workflow execution started: ${executionId}`);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-xl font-semibold border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2"
            placeholder="Workflow Name"
          />
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-100 rounded"
            title="Workflow Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={handleExecute}
            disabled={executing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            <Play className="w-4 h-4" />
            {executing ? 'Executing...' : 'Execute'}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-gray-50 border-b border-gray-200 p-4">
          <div className="max-w-2xl">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Enter workflow description"
            />
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-red-700">{error}</span>
            <button onClick={clearError} className="text-red-700 hover:text-red-900">
              ×
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <NodeLibrary />
        <div className="flex-1">
          <OrchestrationCanvas workflowId={selectedWorkflow?.id} />
        </div>
        <NodeEditor />
      </div>
    </div>
  );
};
