import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, GitBranch, Repeat, Clock, Code, Wrench, GitFork } from 'lucide-react';
import type {
  AgentNodeData,
  DecisionNodeData,
  LoopNodeData,
  ParallelNodeData,
  WaitNodeData,
  ScriptNodeData,
  ToolNodeData,
} from '../../../types/workflow';

// Base node styles
const nodeBaseClass = 'px-4 py-3 rounded-lg border-2 shadow-lg bg-white min-w-[200px]';
const handleClass = 'w-3 h-3 !bg-blue-500 border-2 border-white';

export const AgentNodeComponent: React.FC<{ data: AgentNodeData }> = ({ data }) => {
  return (
    <div className={`${nodeBaseClass} border-blue-500`}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-5 h-5 text-blue-500" />
        <div className="font-semibold text-sm">Agent</div>
      </div>
      <div className="text-xs text-gray-700">{data.label}</div>
      {data.agent_name && (
        <div className="text-xs text-gray-500 mt-1">Agent: {data.agent_name}</div>
      )}
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
};

export const DecisionNodeComponent: React.FC<{ data: DecisionNodeData }> = ({ data }) => {
  return (
    <div className={`${nodeBaseClass} border-yellow-500`}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="w-5 h-5 text-yellow-500" />
        <div className="font-semibold text-sm">Decision</div>
      </div>
      <div className="text-xs text-gray-700">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1 truncate">{data.condition}</div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className={handleClass}
        style={{ left: '30%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className={handleClass}
        style={{ left: '70%' }}
      />
    </div>
  );
};

export const LoopNodeComponent: React.FC<{ data: LoopNodeData }> = ({ data }) => {
  return (
    <div className={`${nodeBaseClass} border-purple-500`}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2 mb-2">
        <Repeat className="w-5 h-5 text-purple-500" />
        <div className="font-semibold text-sm">Loop</div>
      </div>
      <div className="text-xs text-gray-700">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1">Type: {data.loop_type}</div>
      {data.iterations && (
        <div className="text-xs text-gray-500">Iterations: {data.iterations}</div>
      )}
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
};

export const ParallelNodeComponent: React.FC<{ data: ParallelNodeData }> = ({ data }) => {
  return (
    <div className={`${nodeBaseClass} border-green-500`}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2 mb-2">
        <GitFork className="w-5 h-5 text-green-500" />
        <div className="font-semibold text-sm">Parallel</div>
      </div>
      <div className="text-xs text-gray-700">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1">Branches: {data.branches.length}</div>
      {data.branches.map((_, index) => (
        <Handle
          key={index}
          type="source"
          position={Position.Bottom}
          id={`branch-${index}`}
          className={handleClass}
          style={{ left: `${(index + 1) * (100 / (data.branches.length + 1))}%` }}
        />
      ))}
    </div>
  );
};

export const WaitNodeComponent: React.FC<{ data: WaitNodeData }> = ({ data }) => {
  return (
    <div className={`${nodeBaseClass} border-orange-500`}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-5 h-5 text-orange-500" />
        <div className="font-semibold text-sm">Wait</div>
      </div>
      <div className="text-xs text-gray-700">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1">Type: {data.wait_type}</div>
      {data.duration_seconds && (
        <div className="text-xs text-gray-500">Duration: {data.duration_seconds}s</div>
      )}
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
};

export const ScriptNodeComponent: React.FC<{ data: ScriptNodeData }> = ({ data }) => {
  return (
    <div className={`${nodeBaseClass} border-red-500`}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2 mb-2">
        <Code className="w-5 h-5 text-red-500" />
        <div className="font-semibold text-sm">Script</div>
      </div>
      <div className="text-xs text-gray-700">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1">Lang: {data.language}</div>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
};

export const ToolNodeComponent: React.FC<{ data: ToolNodeData }> = ({ data }) => {
  return (
    <div className={`${nodeBaseClass} border-indigo-500`}>
      <Handle type="target" position={Position.Top} className={handleClass} />
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="w-5 h-5 text-indigo-500" />
        <div className="font-semibold text-sm">Tool</div>
      </div>
      <div className="text-xs text-gray-700">{data.label}</div>
      <div className="text-xs text-gray-500 mt-1 truncate">Tool: {data.tool_name}</div>
      <Handle type="source" position={Position.Bottom} className={handleClass} />
    </div>
  );
};

export const nodeTypes = {
  agent: AgentNodeComponent,
  decision: DecisionNodeComponent,
  loop: LoopNodeComponent,
  parallel: ParallelNodeComponent,
  wait: WaitNodeComponent,
  script: ScriptNodeComponent,
  tool: ToolNodeComponent,
};
