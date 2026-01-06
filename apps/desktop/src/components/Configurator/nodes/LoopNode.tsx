import { NodeProps, Handle, Position } from 'reactflow';
import { Repeat, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { useConfiguratorStore } from '../../../stores/configuratorStore';

export function LoopNode({ data, selected, id }: NodeProps) {
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  return (
    <div
      className={cn(
        'relative min-w-[180px] rounded-md border-2 border-yellow-500 bg-yellow-50 px-4 py-3 shadow-md transition-all hover:bg-yellow-100',
        selected && 'ring-2 ring-blue-500',
      )}
    >
      {}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
      />

      {}
      <div className="flex items-center gap-2">
        <div className="shrink-0 text-yellow-600">
          <Repeat className="h-4 w-4" />
        </div>
        <div className="flex-1 truncate text-sm font-medium text-gray-900">{data.label}</div>
        {selected && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {}
      {data.config?.maxIterations && (
        <div className="mt-1 text-xs text-gray-500">Max: {data.config.maxIterations}</div>
      )}

      {}
      <Handle
        type="source"
        position={Position.Right}
        id="loop-body"
        className="!right-0 !top-1/2 !h-3 !w-3 !-translate-y-1/2 !border-2 !border-yellow-600 !bg-yellow-100"
      />

      {}
      <Handle
        type="source"
        position={Position.Bottom}
        id="continue"
        className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
      />
    </div>
  );
}
