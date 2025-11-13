import { NodeProps, Handle, Position } from 'reactflow';
import { GitBranch, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

export function ConditionNode({ data, selected, id }: NodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  return (
    <div
      className={cn(
        'relative min-w-[180px] rounded-md border-2 border-yellow-500 bg-yellow-50 px-4 py-3 shadow-md transition-all hover:bg-yellow-100',
        selected && 'ring-2 ring-blue-500',
      )}
    >
      {/* Target Handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
      />

      {/* Node Content */}
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 text-yellow-600">
          <GitBranch className="h-4 w-4" />
        </div>
        <div className="flex-1 truncate text-sm font-medium text-gray-900">{data.label}</div>
        {selected && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Two source handles for true/false branches */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="!-bottom-2 !left-1/4 !h-3 !w-3 !border-2 !border-green-500 !bg-green-100"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="!-bottom-2 !left-3/4 !h-3 !w-3 !border-2 !border-red-500 !bg-red-100"
      />

      {/* Labels for branches */}
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span className="text-green-600">True</span>
        <span className="text-red-600">False</span>
      </div>
    </div>
  );
}
