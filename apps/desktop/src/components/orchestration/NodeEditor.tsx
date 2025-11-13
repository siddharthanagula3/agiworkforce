import React from 'react';
import { useOrchestrationStore } from '../../stores/orchestrationStore';
import { X } from 'lucide-react';

export const NodeEditor: React.FC = () => {
  const { selectedNode, selectNode, updateNode, deleteNode } = useOrchestrationStore();

  if (!selectedNode) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-4">
        <div className="text-center text-gray-500 mt-8">
          <p>Select a node to edit its properties</p>
        </div>
      </div>
    );
  }

  const handleLabelChange = (newLabel: string) => {
    updateNode(selectedNode.id, {
      ...selectedNode,
      data: { ...selectedNode.data, label: newLabel },
    });
  };

  const handleDelete = () => {
    deleteNode(selectedNode.id);
    selectNode(null);
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Node Properties</h3>
        <button onClick={() => selectNode(null)} className="p-1 hover:bg-gray-100 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Node Type</label>
          <div className="text-sm text-gray-600 capitalize">{selectedNode.type}</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
          <input
            type="text"
            value={selectedNode.data.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {selectedNode.type === 'agent' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
            <input
              type="text"
              value={selectedNode.data.agent_name || ''}
              onChange={(e) =>
                updateNode(selectedNode.id, {
                  ...selectedNode,
                  data: { ...selectedNode.data, agent_name: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter agent name"
            />
          </div>
        )}

        {selectedNode.type === 'decision' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
            <textarea
              value={selectedNode.data.condition || ''}
              onChange={(e) =>
                updateNode(selectedNode.id, {
                  ...selectedNode,
                  data: { ...selectedNode.data, condition: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Enter condition"
            />
          </div>
        )}

        {selectedNode.type === 'script' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <select
                value={selectedNode.data.language || 'javascript'}
                onChange={(e) =>
                  updateNode(selectedNode.id, {
                    ...selectedNode,
                    data: { ...selectedNode.data, language: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="bash">Bash</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <textarea
                value={selectedNode.data.code || ''}
                onChange={(e) =>
                  updateNode(selectedNode.id, {
                    ...selectedNode,
                    data: { ...selectedNode.data, code: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                rows={8}
                placeholder="Enter code"
              />
            </div>
          </>
        )}

        <button
          onClick={handleDelete}
          className="w-full py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Delete Node
        </button>
      </div>
    </div>
  );
};
