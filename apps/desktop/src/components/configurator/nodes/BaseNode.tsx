import * as React from 'react';
import { Handle, Position } from 'reactflow';
import { X, Circle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/Button';

interface BaseNodeProps {
  data: {
    label: string;
    icon: React.ReactNode;
    config?: any;
  };
  selected?: boolean;
  onDelete?: () => void;
  variant?: 'data' | 'action' | 'logic' | 'ai' | 'trigger';
  showSourceHandle?: boolean;
  showTargetHandle?: boolean;
  status?: 'idle' | 'running' | 'success' | 'error';
}

const variantStyles = {
  data: 'border-blue-500 bg-blue-50 hover:bg-blue-100',
  action: 'border-green-500 bg-green-50 hover:bg-green-100',
  logic: 'border-yellow-500 bg-yellow-50 hover:bg-yellow-100',
  ai: 'border-purple-500 bg-purple-50 hover:bg-purple-100',
  trigger: 'border-orange-500 bg-orange-50 hover:bg-orange-100',
};

const statusStyles = {
  idle: '',
  running: 'ring-2 ring-blue-400 animate-pulse',
  success: 'ring-2 ring-green-400',
  error: 'ring-2 ring-red-400',
};

export function BaseNode({
  data,
  selected,
  onDelete,
  variant = 'action',
  showSourceHandle = true,
  showTargetHandle = true,
  status = 'idle',
}: BaseNodeProps) {
  return (
    <div
      className={cn(
        'relative min-w-[180px] rounded-md border-2 bg-white px-4 py-3 shadow-md transition-all',
        variantStyles[variant],
        selected && 'ring-2 ring-blue-500',
        statusStyles[status],
      )}
    >
      {/* Target Handle (Top) */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
        />
      )}

      {/* Node Content */}
      <div className="flex items-center gap-2">
        <div className={cn('flex-shrink-0', variant === 'ai' && 'text-purple-600')}>
          {data.icon}
        </div>
        <div className="flex-1 truncate text-sm font-medium text-gray-900">{data.label}</div>
        {selected && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Status Indicator */}
      {status !== 'idle' && (
        <div className="absolute -right-1 -top-1">
          <Circle
            className={cn(
              'h-3 w-3',
              status === 'running' && 'fill-blue-400 text-blue-400',
              status === 'success' && 'fill-green-400 text-green-400',
              status === 'error' && 'fill-red-400 text-red-400',
            )}
          />
        </div>
      )}

      {/* Source Handle (Bottom) */}
      {showSourceHandle && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !border-2 !border-gray-400 !bg-white"
        />
      )}
    </div>
  );
}
