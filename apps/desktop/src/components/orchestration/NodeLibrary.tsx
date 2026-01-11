import React from 'react';
import { Bot, GitBranch, Repeat, Clock, Code, Wrench, GitFork } from 'lucide-react';
import { useOrchestrationStore } from '../../stores/orchestrationStore';
import type { WorkflowNode } from '../../types/workflow';

const iconMap = {
  bot: Bot,
  'git-branch': GitBranch,
  repeat: Repeat,
  clock: Clock,
  code: Code,
  wrench: Wrench,
  'git-fork': GitFork,
};

export const NodeLibrary: React.FC = () => {
  const { nodeLibrary, addNode } = useOrchestrationStore();

  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleAddNode = (nodeType: string) => {
    const newNode: WorkflowNode = {
      type: nodeType as any,
      id: `${nodeType}-${Date.now()}`,
      position: { x: Math.random() * 500, y: Math.random() * 300 },
      data: {
        label: `New ${nodeType}`,
      } as any,
    };

    addNode(newNode);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4">Node Library</h3>

      {['control', 'action', 'integration'].map((category) => (
        <div key={category} className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{category}</h4>
          <div className="space-y-2">
            {nodeLibrary
              .filter((item) => item.category === category)
              .map((item) => {
                const Icon = iconMap[item.icon as keyof typeof iconMap];
                return (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.type)}
                    onClick={() => handleAddNode(item.type)}
                    className="flex items-center gap-2 p-2 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-move transition-colors"
                  >
                    {Icon && <Icon className="w-4 h-4" />}
                    <div>
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-gray-500">{item.description}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};
